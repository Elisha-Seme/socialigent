// Supabase Edge Function — runs every 15 minutes via cron
// Publishes approved posts whose scheduled_at time has passed.

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const LI_VERSION = '202501'

async function registerImageUpload(
  authorUrn: string,
  token: string,
): Promise<{ uploadUrl: string; assetUrn: string }> {
  const res = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LI_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [{ identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' }],
        supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
      },
    }),
  })
  if (!res.ok) throw new Error(`registerUpload failed: ${await res.text()}`)
  const json = await res.json()
  const mech = json.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']
  return { uploadUrl: mech.uploadUrl, assetUrn: json.value.asset }
}

async function publishAs(authorUrn: string, token: string, caption: string, imageUrl: string | null): Promise<string> {
  let media: unknown[] = []

  if (imageUrl) {
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('Failed to fetch post image')
    const buffer = await imgRes.arrayBuffer()

    const { uploadUrl, assetUrn } = await registerImageUpload(authorUrn, token)
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'LinkedIn-Version': LI_VERSION,
      },
      body: buffer,
    })
    media = [{ status: 'READY', description: { text: '' }, media: assetUrn, title: { text: '' } }]
  }

  const shareContent = media.length
    ? { shareCommentary: { text: caption }, shareMediaCategory: 'IMAGE', media }
    : { shareCommentary: { text: caption }, shareMediaCategory: 'NONE' }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LI_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  })
  if (!res.ok) throw new Error(`LinkedIn publish failed: ${await res.text()}`)
  return res.headers.get('x-restli-id') ?? res.headers.get('location') ?? ''
}

// Page first, personal profile as fallback (page posting needs LinkedIn approval).
async function publishPost(opts: {
  pageId: string | null
  personId: string | null
  token: string
  caption: string
  imageUrl: string | null
}): Promise<string> {
  const { pageId, personId, token, caption, imageUrl } = opts

  if (pageId) {
    try {
      return await publishAs(`urn:li:organization:${pageId}`, token, caption, imageUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!(msg.includes('ACCESS_DENIED') || msg.includes('403')) || !personId) throw err
    }
  }

  if (!personId) throw new Error('No LinkedIn author available. Reconnect LinkedIn.')
  return await publishAs(`urn:li:person:${personId}`, token, caption, imageUrl)
}

Deno.serve(async (_req) => {
  const now = new Date().toISOString()

  // Fetch approved posts that are due
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*, clients(*)')
    .eq('status', 'approved')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: Array<{ postId: string; status: string }> = []

  for (const post of posts ?? []) {
    const client = post.clients
    if (!client?.linkedin_access_token || (!client?.linkedin_page_id && !client?.linkedin_person_id)) {
      results.push({ postId: post.id, status: 'skipped:no_linkedin' })
      continue
    }

    if (client.linkedin_token_expires_at && new Date(client.linkedin_token_expires_at) < new Date()) {
      results.push({ postId: post.id, status: 'skipped:token_expired' })
      continue
    }

    // Lock row by setting failed temporarily (prevent double-publish on concurrent invocations)
    const { error: lockError } = await supabase
      .from('posts')
      .update({ status: 'failed', error_message: 'Publishing...', updated_at: now })
      .eq('id', post.id)
      .eq('status', 'approved')

    if (lockError) {
      results.push({ postId: post.id, status: 'lock_failed' })
      continue
    }

    try {
      const linkedInPostId = await publishPost({
        pageId: client.linkedin_page_id,
        personId: client.linkedin_person_id,
        token: client.linkedin_access_token,
        caption: post.caption,
        imageUrl: post.image_url,
      })

      const publishedAt = new Date().toISOString()
      await supabase
        .from('posts')
        .update({ status: 'published', linkedin_post_id: linkedInPostId, published_at: publishedAt, error_message: null, updated_at: publishedAt })
        .eq('id', post.id)

      await supabase.from('post_history').insert({
        post_id: post.id,
        previous_status: 'approved',
        new_status: 'published',
        changed_by: 'edge_function:publish-posts',
        note: `LinkedIn post: ${linkedInPostId}`,
      })

      results.push({ postId: post.id, status: 'published' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await supabase
        .from('posts')
        .update({
          status: 'failed',
          error_message: message,
          retry_count: (post.retry_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)

      await supabase.from('post_history').insert({
        post_id: post.id,
        previous_status: 'approved',
        new_status: 'failed',
        changed_by: 'edge_function:publish-posts',
        note: message,
      })

      results.push({ postId: post.id, status: `failed: ${message}` })
    }
  }

  return new Response(JSON.stringify({ processed: results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
