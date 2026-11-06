// LinkedIn publishing shared by the Next.js app and the Deno Edge Functions.
// Import-free on purpose (see content.ts).
//
// Uses the versioned Posts API (/rest/posts) and Images API (/rest/images),
// which replace the legacy /v2/ugcPosts and /v2/assets endpoints.

// Versions are supported for ~1 year. 202610 sunsets 2027-10-15 — bump it
// before then (https://learn.microsoft.com/linkedin/marketing/versioning).
export const LINKEDIN_VERSION = '202610'

const API = 'https://api.linkedin.com/rest'

export class LinkedInApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    context: string
  ) {
    super(`LinkedIn ${context} failed (${status}): ${body.slice(0, 400)}`)
    this.name = 'LinkedInApiError'
  }
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

// ─── Little Text Format ──────────────────────────────────────────────────────
// `commentary` is parsed as Little Text: every reserved character must be
// backslash-escaped, and hashtags use the {hashtag|\#|tag} template.

const RESERVED = /[\\|{}@[\]()<>#*_~]/g

function escapeLittleText(text: string): string {
  return text.replace(RESERVED, (ch) => `\\${ch}`)
}

// A hashtag is '#' + word characters, not glued to a preceding word ("a#b").
const HASHTAG = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]+)/gu

export function toLittleText(text: string): string {
  const out: string[] = []
  let last = 0
  for (const match of text.matchAll(HASHTAG)) {
    const hashAt = (match.index ?? 0) + match[1].length
    out.push(escapeLittleText(text.slice(last, hashAt)))
    out.push(`{hashtag|\\#|${escapeLittleText(match[2])}}`)
    last = hashAt + 1 + match[2].length
  }
  out.push(escapeLittleText(text.slice(last)))
  return out.join('')
}

// ─── API calls ───────────────────────────────────────────────────────────────

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

// Post images must live in this project's public bucket, inside the brand's
// own folder. Anything else is refused before we fetch it server-side.
export function isOwnedImageUrl(imageUrl: string, storageBaseUrl: string, clientId: string): boolean {
  const base = storageBaseUrl.trim().replace(/\/$/, '')
  if (!base) return false
  const prefix = `${base}/storage/v1/object/public/post-images/${clientId}/`
  return imageUrl.startsWith(prefix) && !imageUrl.slice(prefix.length).includes('..')
}

async function uploadImage(ownerUrn: string, token: string, imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Could not download the post image (${imgRes.status})`)
  if (Number(imgRes.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
    throw new Error('The post image is larger than 10 MB')
  }
  const bytes = new Uint8Array(await imgRes.arrayBuffer())
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('The post image is larger than 10 MB')

  const initRes = await fetch(`${API}/images?action=initializeUpload`, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  })
  if (!initRes.ok) throw new LinkedInApiError(initRes.status, await initRes.text(), 'image upload init')
  const init = await initRes.json()
  const uploadUrl: string | undefined = init?.value?.uploadUrl
  const imageUrn: string | undefined = init?.value?.image
  if (!uploadUrl || !imageUrn) throw new Error('LinkedIn image upload init returned no upload URL')

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
  })
  if (!putRes.ok) throw new LinkedInApiError(putRes.status, await putRes.text(), 'image upload')

  return imageUrn
}

async function createPost(authorUrn: string, token: string, caption: string, imageUrn: string | null): Promise<string> {
  const res = await fetch(`${API}/posts`, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify({
      author: authorUrn,
      commentary: toLittleText(caption),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      ...(imageUrn ? { content: { media: { id: imageUrn } } } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!res.ok) throw new LinkedInApiError(res.status, await res.text(), 'post creation')
  return res.headers.get('x-restli-id') ?? ''
}

async function publishAs(authorUrn: string, token: string, caption: string, imageUrl: string | null) {
  const imageUrn = imageUrl ? await uploadImage(authorUrn, token, imageUrl) : null
  return createPost(authorUrn, token, caption, imageUrn)
}

function isAccessDenied(err: unknown): boolean {
  return err instanceof LinkedInApiError && (err.status === 403 || err.body.includes('ACCESS_DENIED'))
}

// Posts as the Company Page when possible. Page posting needs
// w_organization_social (Community Management API approval); until that's
// granted LinkedIn returns 403 and we fall back to the member's own profile.
export async function publishToLinkedIn(opts: {
  pageId: string | null
  personId: string | null
  token: string
  caption: string
  imageUrl: string | null
}): Promise<{ postUrn: string; postedAs: 'organization' | 'person' }> {
  const { pageId, personId, token, caption, imageUrl } = opts

  if (pageId) {
    try {
      const postUrn = await publishAs(`urn:li:organization:${pageId}`, token, caption, imageUrl)
      return { postUrn, postedAs: 'organization' }
    } catch (err) {
      if (!isAccessDenied(err) || !personId) throw err
    }
  }

  if (!personId) {
    throw new Error('No LinkedIn author available: page posting was denied and no profile ID is stored. Reconnect LinkedIn.')
  }

  const postUrn = await publishAs(`urn:li:person:${personId}`, token, caption, imageUrl)
  return { postUrn, postedAs: 'person' }
}

// ─── Publish flow with a real lock ───────────────────────────────────────────
// Every publisher (dashboard button, Telegram agent, 15-min cron) goes through
// publishPost(). It claims the row by moving it to 'publishing' only if the
// status is still what we read; a second concurrent caller matches zero rows
// and backs off, so a post can't be published twice.

// This file can't import supabase-js (Deno and Next resolve it differently),
// so the client is typed structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type PublishFailureCode =
  | 'not_found'
  | 'not_publishable'
  | 'already_claimed'
  | 'not_connected'
  | 'token_expired'
  | 'invalid_image'
  | 'linkedin_error'

export type PublishOutcome =
  | { ok: true; postUrn: string; postedAs: 'organization' | 'person' }
  | { ok: false; code: PublishFailureCode; message: string }

export const STALE_PUBLISHING_MINUTES = 10

export async function publishPost(
  db: Db,
  opts: {
    postId: string
    allowedFrom: string[]
    actor: string
    storageBaseUrl: string // the Supabase project URL that hosts post-images
  }
): Promise<PublishOutcome> {
  const { postId, allowedFrom, actor, storageBaseUrl } = opts

  const { data: post } = await db
    .from('posts')
    .select(
      'id, status, caption, image_url, retry_count, clients(id, linkedin_page_id, linkedin_person_id, linkedin_access_token, linkedin_token_expires_at)'
    )
    .eq('id', postId)
    .maybeSingle()

  if (!post) return { ok: false, code: 'not_found', message: 'Post not found.' }
  if (!allowedFrom.includes(post.status)) {
    return { ok: false, code: 'not_publishable', message: `Can't publish a post that is ${post.status.replace('_', ' ')}.` }
  }

  const client = post.clients
  if (!client?.linkedin_access_token || (!client.linkedin_page_id && !client.linkedin_person_id)) {
    return { ok: false, code: 'not_connected', message: 'LinkedIn is not connected. Connect it in Settings first.' }
  }
  if (client.linkedin_token_expires_at && new Date(client.linkedin_token_expires_at) < new Date()) {
    return { ok: false, code: 'token_expired', message: 'The LinkedIn connection has expired. Reconnect it in Settings.' }
  }
  if (post.image_url && !isOwnedImageUrl(post.image_url, storageBaseUrl, client.id)) {
    const message = "This post's image isn't stored with your brand, so it can't be published."
    // Fail it once (instead of leaving it approved) so it isn't retried forever.
    const { data: failed } = await db
      .from('posts')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('status', post.status)
      .select('id')
    if (failed?.length) {
      await db.from('post_history').insert({
        post_id: postId,
        previous_status: post.status,
        new_status: 'failed',
        changed_by: actor,
        note: message,
      })
    }
    return { ok: false, code: 'invalid_image', message }
  }

  // Claim: only succeeds if nobody changed the status since we read it.
  const { data: claimed, error: claimError } = await db
    .from('posts')
    .update({ status: 'publishing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('status', post.status)
    .select('id')

  if (claimError) return { ok: false, code: 'already_claimed', message: claimError.message }
  if (!claimed?.length) {
    return { ok: false, code: 'already_claimed', message: 'This post is already being published or was just changed.' }
  }

  try {
    const { postUrn, postedAs } = await publishToLinkedIn({
      pageId: client.linkedin_page_id,
      personId: client.linkedin_person_id,
      token: client.linkedin_access_token,
      caption: post.caption,
      imageUrl: post.image_url,
    })

    const publishedAt = new Date().toISOString()
    await db
      .from('posts')
      .update({
        status: 'published',
        linkedin_post_id: postUrn,
        published_at: publishedAt,
        error_message: null,
        updated_at: publishedAt,
      })
      .eq('id', postId)

    await db.from('post_history').insert({
      post_id: postId,
      previous_status: post.status,
      new_status: 'published',
      changed_by: actor,
      note: `Published to LinkedIn as ${postedAs === 'organization' ? 'the company page' : 'the personal profile'} (${postUrn})`,
    })

    return { ok: true, postUrn, postedAs }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await db
      .from('posts')
      .update({
        status: 'failed',
        error_message: message,
        retry_count: (post.retry_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)

    await db.from('post_history').insert({
      post_id: postId,
      previous_status: post.status,
      new_status: 'failed',
      changed_by: actor,
      note: message,
    })

    return { ok: false, code: 'linkedin_error', message }
  }
}

// A publisher that crashed mid-flight leaves the row in 'publishing'. We can't
// know whether LinkedIn accepted the post, so mark it failed (never auto-retry,
// which could double-post) and let the caller alert the user to check.
export async function recoverStalePublishing(
  db: Db,
  olderThanMinutes = STALE_PUBLISHING_MINUTES
): Promise<Array<{ id: string; client_id: string }>> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
  const message =
    'Publishing was interrupted. Check LinkedIn before retrying: the post may already be live.'

  const { data } = await db
    .from('posts')
    .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
    .eq('status', 'publishing')
    .lt('updated_at', cutoff)
    .select('id, client_id')

  for (const row of data ?? []) {
    await db.from('post_history').insert({
      post_id: row.id,
      previous_status: 'publishing',
      new_status: 'failed',
      changed_by: 'edge_function:publish-posts',
      note: message,
    })
  }
  return data ?? []
}
