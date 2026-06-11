import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, Globe, Send, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GeneratePostButton } from '@/components/clients/GeneratePostButton'
import type { Client, Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  published: 'default',
  failed: 'destructive',
}

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  const [{ data: clientData }, { data: postsData }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', params.id).single(),
    supabase
      .from('posts')
      .select('*')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!clientData) notFound()
  const client = clientData as Client
  const posts = (postsData ?? []) as Post[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <Badge variant={client.is_active ? 'default' : 'secondary'}>
            {client.is_active ? 'Active' : 'Paused'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <GeneratePostButton clientId={client.id} />
          <Button variant="outline" asChild>
            <Link href={`/clients/${client.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Brand profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{client.brand_voice}</p>
            {client.content_pillars.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {client.content_pillars.map((pillar) => (
                  <Badge key={pillar} variant="outline">
                    {pillar}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> LinkedIn
              </span>
              <span className="flex items-center gap-2">
                {client.linkedin_access_token && <Badge variant="default">Connected</Badge>}
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/api/linkedin/oauth?clientId=${client.id}`}>
                    {client.linkedin_access_token ? 'Reconnect' : 'Connect'}
                  </Link>
                </Button>
              </span>
            </div>
            {client.linkedin_token_expires_at && (() => {
              const exp = new Date(client.linkedin_token_expires_at)
              const daysLeft = Math.floor((exp.getTime() - Date.now()) / 86400000)
              return daysLeft < 14 ? (
                <p className="text-xs text-destructive">
                  LinkedIn token expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                </p>
              ) : null
            })()}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4" /> Telegram
              </span>
              <Badge variant={client.telegram_chat_id ? 'default' : 'secondary'}>
                {client.telegram_chat_id ? 'Configured' : 'Off'}
              </Badge>
            </div>
            <div className="pt-2 text-muted-foreground">
              {client.posting_schedule.length === 0 ? (
                <p>No posting slots scheduled.</p>
              ) : (
                <ul className="space-y-1">
                  {client.posting_schedule.map((slot, i) => (
                    <li key={i} className="capitalize">
                      {slot.day} at {slot.time} UTC
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent posts</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No posts yet. Generate the first one!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => (
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
