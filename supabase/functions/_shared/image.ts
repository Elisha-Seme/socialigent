// AI image generation shared by the Next.js app and the Deno Edge Functions.
// Import-free on purpose (see content.ts).
//
// DALL-E 3 was removed from the OpenAI API on 2026-05-12 and gpt-image-1 on
// 2026-10-23. GPT image models always return base64 (never a URL), so the
// caller uploads the bytes straight to storage.

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2'

export interface GeneratedImage {
  bytes: Uint8Array
  contentType: 'image/jpeg'
  extension: 'jpg'
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function generateImage(opts: {
  apiKey: string
  prompt: string
  model?: string
}): Promise<GeneratedImage> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_IMAGE_MODEL,
      prompt: opts.prompt,
      n: 1,
      size: '1536x1024', // landscape 3:2, supported by every GPT image model
      quality: 'medium',
      output_format: 'jpeg', // smaller than PNG; well under Telegram's 5 MB photo limit
      output_compression: 85,
    }),
  })

  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  const json = await res.json()
  const b64: string | undefined = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('Image generation returned no image data')

  return { bytes: base64ToBytes(b64), contentType: 'image/jpeg', extension: 'jpg' }
}
