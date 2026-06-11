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

async function registerImageUpload(pageId: string, token: string): Promise<{ uploadUrl: string; assetUrn: string }> {
  const res = await liPost(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    token,
    {
      registerUploadRequest: {
        owner: `urn:li:organization:${pageId}`,
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

export async function publishLinkedInPost(opts: {
  pageId: string
  token: string
  caption: string
  imageUrl: string | null
}): Promise<string> {
  const { pageId, token, caption, imageUrl } = opts
  const author = `urn:li:organization:${pageId}`

  let media: unknown[] = []

  if (imageUrl) {
    // Download image from Supabase Storage
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('Failed to fetch image for LinkedIn upload')
    const buffer = await imgRes.arrayBuffer()

    const { uploadUrl, assetUrn } = await registerImageUpload(pageId, token)
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
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  })

  const location = res.headers.get('x-restli-id') ?? res.headers.get('location') ?? ''
  return location
}
