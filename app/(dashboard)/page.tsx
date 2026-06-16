import Link from 'next/link'
import { FileText, Clock, CheckCircle, Globe, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AnalyticsChart } from '@/components/dashboard/AnalyticsChart'
import type { Post, Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  published: 'default',
  failed: 'destructive',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { linkedin_connected?: string; linkedin_error?: string }
}) {
  const supabase = await createClient()

  const [{ data: clientData }, { data: postsData }] = await Promise.all([
    supabase.from('clients').select('*').single(),
    supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  const client = clientData as Client
  const posts = (postsData ?? []) as Post[]

  const pending = posts.filter((p) => p.status === 'pending_approval')
  const published = posts.filter((p) => p.status === 'published')

  const stats = [
    { label: 'Total posts', value: posts.length, icon: FileText },
    { label: 'Pending approval', value: pending.length, icon: Clock },
    { label: 'Published', value: published.length, icon: CheckCircle },
  ]

  const linkedinConnected = !!client.linkedin_access_token
  const telegramConnected = !!client.telegram_chat_id

  return (
    <div className="space-y-6">
      {searchParams.linkedin_connected && (
        <div className="rounded-md border border-green-500 bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          LinkedIn connected successfully. Posts will now publish automatically.
        </div>
      )}
      {searchParams.linkedin_error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          LinkedIn error: {decodeURIComponent(searchParams.linkedin_error)}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Connection nudges */}
      {(!linkedinConnected || !telegramConnected) && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950">
          <CardContent className="flex flex-wrap items-center gap-4 pt-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Finish setting up to go fully autonomous:
            </p>
            {!linkedinConnected && (
              <Button size="sm" asChild variant="outline">
                <a href={`/api/linkedin/oauth?clientId=${client.id}`}>
                  <Globe className="mr-2 h-4 w-4" /> Connect LinkedIn
                </a>
              </Button>
            )}
            {!telegramConnected && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/settings">
                  <Send className="mr-2 h-4 w-4" /> Connect Telegram
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AnalyticsChart posts={posts} />

      {/* Pending approval */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting your approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.slice(0, 5).map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="block rounded-md border p-3 text-sm hover:bg-muted"
              >
                <p className="line-clamp-2">{post.caption}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent posts */}
      {posts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {posts.slice(0, 10).map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm hover:bg-muted"
              >
                <p className="line-clamp-1 flex-1">{post.caption}</p>
                <Badge variant={statusVariant[post.status]}>
                  {post.status.replace('_', ' ')}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {posts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              The AI will generate your first posts based on your schedule. Check back soon.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
