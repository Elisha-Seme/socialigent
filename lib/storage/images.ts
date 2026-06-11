import { createAdminClient } from '@/lib/supabase/admin'

// Downloads an image from a (temporary) URL and stores it permanently
// in the post-images bucket. Returns the public URL.
export async function storeImageFromUrl(
  sourceUrl: string,
  clientId: string,
  fileId: string
): Promise<string> {
  const imageResponse = await fetch(sourceUrl)
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image (${imageResponse.status})`)
  }
  const buffer = Buffer.from(await imageResponse.arrayBuffer())

  const supabase = createAdminClient()
  const path = `${clientId}/${fileId}.png`

  const { error } = await supabase.storage
    .from('post-images')
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (error) {
    throw new Error(`Failed to upload image to storage: ${error.message}`)
  }

  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl
}
