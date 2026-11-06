import Link from 'next/link'
import { FileText, Clock, CheckCircle, Globe, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AnalyticsChart } from '@/components/dashboard/AnalyticsChart'
import { Notice } from '@/components/dashboard/Notice'
import { GeneratePostButton } from '@/components/clients/GeneratePostButton'
import { StatusBadge } from '@/components/posts/StatusBadge'
import { isDraftingPaused } from '@/lib/schedule'
import type { Post, Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

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
  const tokenDaysLeft = client.linkedin_token_expires_at
    ? Math.ceil((new Date(client.linkedin_token_expires_at).getTime() - Date.now()) / DAY_MS)
    : null
  const draftingPaused = client.is_active && isDraftingPaused(posts)

  const reconnect = (
    <Button size="sm" variant="outline" asChild>
      <a href={`/api/linkedin/oauth?clientId=${client.id}`}>
        <Globe className="mr-2 h-4 w-4" /> Reconnect LinkedIn
      </a>
    </Button>
  )

  return (
    <div className="space-y-6">
      {searchParams.linkedin_connected && (
        <Notice tone="success" title="LinkedIn connected">
          Approved posts will now publish automatically at their scheduled time.
        </Notice>
      )}
      {searchParams.linkedin_error && (
        <Notice tone="error" title="LinkedIn connection failed">
          {/* Next has already decoded the query string; decoding again throws on '%'. */}
          {String(searchParams.linkedin_error).slice(0, 300)}
        </Notice>
      )}

      {linkedinConnected && tokenDaysLeft !== null && tokenDaysLeft <= 0 && (
        <Notice tone="error" title="Your LinkedIn connection has expired" action={reconnect}>
          Approved posts can&apos;t be published until you reconnect.
        </Notice>
      )}
      {linkedinConnected && tokenDaysLeft !== null && tokenDaysLeft > 0 && tokenDaysLeft <= 14 && (
        <Notice
          tone="warning"
          title={`LinkedIn connection expires in ${tokenDaysLeft} day${tokenDaysLeft === 1 ? '' : 's'}`}
          action={reconnect}
        >
          LinkedIn tokens last about two months. Reconnecting takes a few seconds.
        </Notice>
      )}

      {draftingPaused && (
        <Notice
          tone="paused"
          title="Auto-drafting is paused"
          action={
            <Button size="sm" variant="outline" asChild>
              <Link href="/posts?status=pending_approval">Review drafts</Link>
            </Button>
          }
        >
          Your last few drafts weren&apos;t reviewed before their slot, so we stopped writing new ones. Approve or reject
          one and drafting resumes on the next slot.
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <GeneratePostButton clientId={client.id} />
      </div>

      {(!linkedinConnected || !telegramConnected) && (
        <Notice
          tone="warning"
          title="Finish setting up to go fully autonomous"
          action={
            <div className="flex flex-wrap gap-2">
              {!linkedinConnected && (
                <Button size="sm" variant="outline" asChild>
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
            </div>
          }
        >
          {!telegramConnected
            ? 'Without Telegram, new drafts only show up here, and you won’t get expiry or failure alerts.'
            : 'Connect LinkedIn so approved posts can be published.'}
        </Notice>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AnalyticsChart posts={posts} />

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting your approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.slice(0, 5).map((post) => (
              <Link key={post.id} href={`/posts/${post.id}`} className="block rounded-md border p-3 text-sm hover:bg-muted">
                <p className="line-clamp-2">{post.caption}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

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
                <StatusBadge status={post.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {posts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">
              The AI drafts posts for each slot in your schedule. Want one now? Use Generate post above.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
