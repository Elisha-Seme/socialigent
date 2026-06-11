import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/posts/StatusBadge'
import { ApproveRejectButtons } from '@/components/posts/ApproveRejectButtons'
import { PublishButton } from '@/components/posts/PublishButton'
import type { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PostDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select('*, clients(id, name)')
    .eq('id', params.id)
    .single()

  if (!data) notFound()
  const post = data as Post & { clients: { id: string; name: string } | null }
  const canReview = post.status === 'pending_approval' || post.status === 'draft'
  const canPublish = post.status === 'approved' || post.status === 'failed'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/posts"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All posts
        </Link>
        <StatusBadge status={post.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {post.clients ? (
              <Link href={`/clients/${post.clients.id}`} className="hover:underline">
                {post.clients.name}
              </Link>
            ) : (
              'Unknown client'
            )}{' '}
            · LinkedIn
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {post.image_url && (
            <Image
              src={post.image_url}
              alt={post.image_prompt ?? 'Post image'}
              width={1792}
              height={1024}
              className="w-full rounded-md border object-cover"
            />
          )}
          <p className="whitespace-pre-wrap text-sm">{post.caption}</p>

          <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
            <p>Created: {new Date(post.created_at).toLocaleString()}</p>
            {post.scheduled_at && (
              <p>Scheduled: {new Date(post.scheduled_at).toLocaleString()}</p>
            )}
            {post.published_at && (
              <p>Published: {new Date(post.published_at).toLocaleString()}</p>
            )}
            {post.rejection_reason && <p>Rejection reason: {post.rejection_reason}</p>}
            {post.error_message && (
              <p className="text-destructive">Error: {post.error_message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {canReview && <ApproveRejectButtons postId={post.id} />}
      {canPublish && <PublishButton postId={post.id} />}
    </div>
  )
}
