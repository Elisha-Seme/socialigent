import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateImage } from '@/supabase/functions/_shared/image'

// Uploads bytes to the public post-images bucket at {clientId}/{uuid}.{ext}
// and returns the public URL.
export async function storeImageBytes(opts: {
  bytes: Uint8Array | ArrayBuffer
  clientId: string
  extension: string
  contentType: string
}): Promise<string> {
  const supabase = createAdminClient()
  const path = `${opts.clientId}/${randomUUID()}.${opts.extension}`

  const { error } = await supabase.storage
    .from('post-images')
    .upload(path, opts.bytes, { contentType: opts.contentType, upsert: false })

  if (error) throw new Error(`Failed to upload image to storage: ${error.message}`)
  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl
}

// Generates an AI image for the post and stores it. Returns null when no
// OPENAI_API_KEY is configured (posts then go out text-only).
export async function generateAndStoreImage(prompt: string, clientId: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !prompt) return null

  const image = await generateImage({ apiKey, prompt, model: process.env.OPENAI_IMAGE_MODEL })
  return storeImageBytes({
    bytes: image.bytes,
    clientId,
    extension: image.extension,
    contentType: image.contentType,
  })
}
