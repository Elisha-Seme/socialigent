import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LINKEDIN_VERSION,
  isOwnedImageUrl,
  publishPost,
  recoverStalePublishing,
  toLittleText,
} from '@/supabase/functions/_shared/linkedin'
import { FakeDb } from './fake-db'

const BASE = 'https://proj.supabase.co'
const OWN_IMAGE = `${BASE}/storage/v1/object/public/post-images/c1/img.jpg`

describe('toLittleText', () => {
  it('turns hashtags into hashtag templates', () => {
    expect(toLittleText('Solar works #SolarKenya #CleanEnergy')).toBe(
      'Solar works {hashtag|\\#|SolarKenya} {hashtag|\\#|CleanEnergy}'
    )
  })

  it('escapes every reserved character so LinkedIn keeps the full text', () => {
    expect(toLittleText('Price (est.) [x] <y> @z ~w | {q} * _ \\')).toBe(
      'Price \\(est.\\) \\[x\\] \\<y\\> \\@z \\~w \\| \\{q\\} \\* \\_ \\\\'
    )
  })

  it('does not treat a # glued to a word as a hashtag', () => {
    expect(toLittleText('C#sharp and issue a#1')).toBe('C\\#sharp and issue a\\#1')
  })

  it('escapes reserved characters inside hashtag text', () => {
    expect(toLittleText('#my_tag')).toBe('{hashtag|\\#|my\\_tag}')
  })

  it('handles a hashtag at the start of a line', () => {
    expect(toLittleText('Done.\n#Ship')).toBe('Done.\n{hashtag|\\#|Ship}')
  })
})

type FetchCall = { url: string; init?: RequestInit }

function stubLinkedIn(handler: (url: string, body: Record<string, unknown> | null) => Response) {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      return handler(url, body)
    })
  )
  return calls
}

const created = (urn: string) => new Response(null, { status: 201, headers: { 'x-restli-id': urn } })

function makeDb(overrides: { post?: Record<string, unknown>; client?: Record<string, unknown> } = {}) {
  return new FakeDb({
    clients: [
      {
        id: 'c1',
        linkedin_page_id: null,
        linkedin_person_id: 'person-1',
        linkedin_access_token: 'tok',
        linkedin_token_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        ...overrides.client,
      },
    ],
    posts: [
      {
        id: 'p1',
        client_id: 'c1',
        status: 'approved',
        caption: 'Hello (world) #Test',
        image_url: null,
        retry_count: 0,
        ...overrides.post,
      },
    ],
    post_history: [],
  })
}

describe('publishPost', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('publishes via the versioned Posts API with escaped commentary', async () => {
    const calls = stubLinkedIn(() => created('urn:li:share:1'))
    const db = makeDb()

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toEqual({ ok: true, postUrn: 'urn:li:share:1', postedAs: 'person' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.linkedin.com/rest/posts')
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers['LinkedIn-Version']).toBe(LINKEDIN_VERSION)
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.author).toBe('urn:li:person:person-1')
    expect(body.commentary).toBe('Hello \\(world\\) {hashtag|\\#|Test}')

    expect(db.tables.posts[0]).toMatchObject({ status: 'published', linkedin_post_id: 'urn:li:share:1' })
    expect(db.tables.post_history).toEqual([
      expect.objectContaining({ previous_status: 'approved', new_status: 'published', changed_by: 'test' }),
    ])
  })

  it('lets only one of two concurrent publishers post', async () => {
    const calls = stubLinkedIn(() => created('urn:li:share:1'))
    const db = makeDb()

    const [a, b] = await Promise.all([
      publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'cron', storageBaseUrl: BASE }),
      publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'dashboard', storageBaseUrl: BASE }),
    ])

    const outcomes = [a, b].map((r) => (r.ok ? 'ok' : r.code)).sort()
    expect(outcomes).toEqual(['already_claimed', 'ok'])
    expect(calls.filter((c) => c.url.endsWith('/rest/posts'))).toHaveLength(1)
  })

  it('falls back to the personal profile when page posting is denied', async () => {
    const calls = stubLinkedIn((_url, body) =>
      String(body?.author).startsWith('urn:li:organization')
        ? new Response('{"code":"ACCESS_DENIED"}', { status: 403 })
        : created('urn:li:share:2')
    )
    const db = makeDb({ client: { linkedin_page_id: '999' } })

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toMatchObject({ ok: true, postedAs: 'person' })
    expect(calls.map((c) => JSON.parse(c.init?.body as string).author)).toEqual([
      'urn:li:organization:999',
      'urn:li:person:person-1',
    ])
  })

  it('marks the post failed and records why when LinkedIn rejects it', async () => {
    stubLinkedIn(() => new Response('{"message":"bad"}', { status: 422 }))
    const db = makeDb()

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toMatchObject({ ok: false, code: 'linkedin_error' })
    expect(db.tables.posts[0]).toMatchObject({ status: 'failed', retry_count: 1 })
    expect(String(db.tables.posts[0].error_message)).toContain('422')
  })

  it('refuses posts in a status the caller does not allow', async () => {
    const calls = stubLinkedIn(() => created('x'))
    const db = makeDb({ post: { status: 'pending_approval' } })

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toMatchObject({ ok: false, code: 'not_publishable' })
    expect(calls).toHaveLength(0)
    expect(db.tables.posts[0].status).toBe('pending_approval')
  })

  it('does not claim the post when the LinkedIn token has expired', async () => {
    const calls = stubLinkedIn(() => created('x'))
    const db = makeDb({ client: { linkedin_token_expires_at: new Date(Date.now() - 1000).toISOString() } })

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toMatchObject({ ok: false, code: 'token_expired' })
    expect(calls).toHaveLength(0)
    expect(db.tables.posts[0].status).toBe('approved')
  })

  it('uploads the image through the Images API before posting', async () => {
    const calls = stubLinkedIn((url) => {
      if (url === OWN_IMAGE) return new Response(new Uint8Array([1, 2, 3]))
      if (url.includes('/rest/images?action=initializeUpload')) {
        return Response.json({ value: { uploadUrl: 'https://upload.example/u', image: 'urn:li:image:9' } })
      }
      if (url === 'https://upload.example/u') return new Response(null, { status: 201 })
      return created('urn:li:share:3')
    })
    const db = makeDb({ post: { image_url: OWN_IMAGE } })

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toMatchObject({ ok: true })
    const postCall = calls.find((c) => c.url.endsWith('/rest/posts'))
    expect(JSON.parse(postCall?.init?.body as string).content).toEqual({ media: { id: 'urn:li:image:9' } })
  })

  it("refuses images outside the brand's storage folder without fetching them", async () => {
    const calls = stubLinkedIn(() => created('x'))
    const db = makeDb({ post: { image_url: 'http://169.254.169.254/latest/meta-data' } })

    const result = await publishPost(db, { postId: 'p1', allowedFrom: ['approved'], actor: 'test', storageBaseUrl: BASE })

    expect(result).toMatchObject({ ok: false, code: 'invalid_image' })
    expect(calls).toHaveLength(0)
    // Failed once, so the cron doesn't retry and re-alert every 15 minutes.
    expect(db.tables.posts[0].status).toBe('failed')
    expect(db.tables.post_history).toHaveLength(1)
  })
})

describe('isOwnedImageUrl', () => {
  it("accepts only this project's bucket, inside the brand folder", () => {
    expect(isOwnedImageUrl(OWN_IMAGE, BASE, 'c1')).toBe(true)
    expect(isOwnedImageUrl(OWN_IMAGE, BASE + '/', 'c1')).toBe(true)
    expect(isOwnedImageUrl(OWN_IMAGE, BASE, 'c2')).toBe(false)
    expect(isOwnedImageUrl(`${BASE}/storage/v1/object/public/post-images/c1/../c2/x.jpg`, BASE, 'c1')).toBe(false)
    expect(isOwnedImageUrl('https://evil.example/post-images/c1/x.jpg', BASE, 'c1')).toBe(false)
    expect(isOwnedImageUrl(OWN_IMAGE, '', 'c1')).toBe(false)
  })
})

describe('recoverStalePublishing', () => {
  it('fails only posts stuck in publishing past the cutoff', async () => {
    const old = new Date(Date.now() - 30 * 60_000).toISOString()
    const fresh = new Date().toISOString()
    const db = new FakeDb({
      posts: [
        { id: 'stale', client_id: 'c1', status: 'publishing', updated_at: old },
        { id: 'busy', client_id: 'c1', status: 'publishing', updated_at: fresh },
        { id: 'done', client_id: 'c1', status: 'published', updated_at: old },
      ],
      post_history: [],
    })

    const recovered = await recoverStalePublishing(db, 10)

    expect(recovered.map((r) => r.id)).toEqual(['stale'])
    expect(db.tables.posts.map((p) => p.status)).toEqual(['failed', 'publishing', 'published'])
    expect(db.tables.post_history).toHaveLength(1)
  })
})
