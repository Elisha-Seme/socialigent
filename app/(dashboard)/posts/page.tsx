import Link from 'next/link'
import Image from 'next/image'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/posts/StatusBadge'
import { cn } from '@/lib/utils'
import type { Post, PostStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const FILTERS: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Published', value: 'published' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Failed', value: 'failed' },
]

export default async function PostsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const supabase = await createClient()
  const status = searchParams.status ?? 'all'

  let query = supabase
    .from('posts')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data } = await query
  const posts = (data ?? []) as (Post & { clients: { name: string } | null })[]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Posts</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === 'all' ? '/posts' : `/posts?status=${f.value}`}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              status === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No posts {status !== 'all' ? `with status "${status.replace('_', ' ')}"` : 'yet'}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link key={post.id} href={`/posts/${post.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  {post.image_url && (
                    <Image
                      src={post.image_url}
                      alt=""
                      width={96}
                      height={56}
                      className="h-14 w-24 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm">{post.caption}</p>
                    <p className="text-xs text-muted-foreground">
                      {post.clients?.name ?? 'Unknown client'} ·{' '}
                      {new Date(post.created_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={post.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
