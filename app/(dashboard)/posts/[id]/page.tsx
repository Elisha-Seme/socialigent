import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PostDetailView } from '@/components/posts/PostDetailView'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PostDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const [{ data: postData }, { data: historyData }] = await Promise.all([
    supabase
      .from('posts')
      .select('*, clients(id, name)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('post_history')
      .select('*')
      .eq('post_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  if (!postData) notFound()
  const post = postData as Post & { clients: { id: string; name: string } | null }
  const history = historyData ?? []

  return <PostDetailView key={post.id} post={post} history={history} />
}
