// Generates an image with DALL-E 3 and returns a temporary URL.
// The URL expires after ~1 hour — download and store it immediately.
export async function generateImage(prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      response_format: 'url',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`DALL-E request failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  const url = data.data?.[0]?.url
  if (!url) throw new Error('DALL-E returned no image URL')
  return url
}
