const LI_VERSION = '202501'

async function liPost(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LI_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LinkedIn API error ${res.status}: ${text}`)
  }
  return res
}

function isAccessDenied(err: unknown): boolean {
  return err instanceof Error && (err.message.includes('ACCESS_DENIED') || err.message.includes('403'))
}

async function registerImageUpload(authorUrn: string, token: string): Promise<{ uploadUrl: string; assetUrn: string }> {
  const res = await liPost(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    token,
    {
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [
          {
            identifier: 'urn:li:userGeneratedContent',
            relationshipType: 'OWNER',
          },
        ],
        supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
      },
    }
  )
  const json = await res.json()
  const uploadMechanism =
    json.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']
  return {
    uploadUrl: uploadMechanism.uploadUrl,
    assetUrn: json.value.asset,
  }
}

async function uploadImageBinary(uploadUrl: string, token: string, imageBuffer: ArrayBuffer): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'LinkedIn-Version': LI_VERSION,
    },
    body: new Uint8Array(imageBuffer),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LinkedIn image upload failed ${res.status}: ${text}`)
  }
}

async function publishAs(authorUrn: string, token: string, caption: string, imageUrl: string | null): Promise<string> {
  let media: unknown[] = []

  if (imageUrl) {
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('Failed to fetch image for LinkedIn upload')
    const buffer = await imgRes.arrayBuffer()

    const { uploadUrl, assetUrn } = await registerImageUpload(authorUrn, token)
    await uploadImageBinary(uploadUrl, token, buffer)

    media = [
      {
        status: 'READY',
        description: { text: '' },
        media: assetUrn,
        title: { text: '' },
      },
    ]
  }

  const shareContent =
    media.length > 0
      ? {
          shareCommentary: { text: caption },
          shareMediaCategory: 'IMAGE',
          media,
        }
      : {
          shareCommentary: { text: caption },
          shareMediaCategory: 'NONE',
        }

  const res = await liPost('https://api.linkedin.com/v2/ugcPosts', token, {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  })

  return res.headers.get('x-restli-id') ?? res.headers.get('location') ?? ''
}

// Tries to post as the Company Page first; if the token lacks page permissions
// (w_organization_social requires LinkedIn approval), falls back to posting as
// the connected member's personal profile.
export async function publishLinkedInPost(opts: {
  pageId: string | null
  personId: string | null
  token: string
  caption: string
  imageUrl: string | null
}): Promise<{ postId: string; postedAs: 'organization' | 'person' }> {
  const { pageId, personId, token, caption, imageUrl } = opts

  if (pageId) {
    try {
      const postId = await publishAs(`urn:li:organization:${pageId}`, token, caption, imageUrl)
      return { postId, postedAs: 'organization' }
    } catch (err) {
      if (!isAccessDenied(err) || !personId) throw err
      // fall through to personal profile
    }
  }

  if (!personId) {
    throw new Error('No LinkedIn author available: page posting denied and no person ID stored. Reconnect LinkedIn.')
  }

  const postId = await publishAs(`urn:li:person:${personId}`, token, caption, imageUrl)
  return { postId, postedAs: 'person' }
}
