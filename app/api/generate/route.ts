import { NextResponse } from 'next/server'
import { generateAndQueuePost } from '@/lib/ai/pipeline'
import { jsonError, readJson, requireUser } from '@/lib/api/session'
import type { Client, Post } from '@/lib/types'

export const maxDuration = 120

// POST { clientId } → new draft for the brand
// POST { postId }   → regenerate a rejected post using its rejection reason
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return jsonError('ANTHROPIC_API_KEY is not configured', 500)

  const session = await requireUser()
  if (!session.ok) return session.response
  const { supabase } = session

  const { clientId, postId } = await readJson(request)
  if (typeof clientId !== 'string' && typeof postId !== 'string') {
    return jsonError('clientId or postId is required', 400)
  }

  // Ownership checks run as the user (RLS); the pipeline then writes with the
  // service role.
  let client: Client
  let regenerate: Post | undefined

  if (typeof postId === 'string') {
    const { data } = await supabase.from('posts').select('*, clients(*)').eq('id', postId).maybeSingle()
    if (!data?.clients) return jsonError('Post not found', 404)
    const { clients, ...post } = data as Post & { clients: Client }
    if (post.status !== 'rejected') return jsonError('Only rejected posts can be regenerated', 409)
    client = clients
    regenerate = post
  } else {
    const { data } = await supabase.from('clients').select('*').eq('id', clientId as string).maybeSingle()
    if (!data) return jsonError('Brand not found', 404)
    client = data as Client
  }

  try {
    const post = await generateAndQueuePost({ client, regenerate, actor: 'dashboard' })
    return NextResponse.json(post, { status: regenerate ? 200 : 201 })
  } catch (err) {
    console.error('Generation failed:', err)
    return jsonError(err instanceof Error ? err.message : 'Generation failed', 500)
  }
}
