import Link from 'next/link'
import { Users, FileText, Clock, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Post, Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: posts }] = await Promise.all([
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('posts').select('*').order('created_at', { ascending: false }),
  ])

  const allPosts = (posts ?? []) as Post[]
  const allClients = (clients ?? []) as Client[]
  const pending = allPosts.filter((p) => p.status === 'pending_approval')
  const published = allPosts.filter((p) => p.status === 'published')

  const stats = [
    { label: 'Clients', value: allClients.length, icon: Users },
    { label: 'Total posts', value: allPosts.length, icon: FileText },
    { label: 'Pending approval', value: pending.length, icon: Clock },
    { label: 'Published', value: published.length, icon: CheckCircle },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/clients/new">Add client</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

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

      {allClients.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              No clients yet. Add your first client to start generating posts.
            </p>
            <Button asChild>
              <Link href="/clients/new">Add your first client</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
