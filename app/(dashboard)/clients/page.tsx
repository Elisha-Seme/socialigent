import Link from 'next/link'
import { Users, Calendar, Globe, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  const clients = (data ?? []) as Client[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button asChild>
          <Link href="/clients/new">Add client</Link>
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No clients yet.</p>
            <Button asChild>
              <Link href="/clients/new">Add your first client</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{client.name}</CardTitle>
                  <Badge variant={client.is_active ? 'default' : 'secondary'}>
                    {client.is_active ? 'Active' : 'Paused'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="line-clamp-2">{client.brand_voice}</p>
                  <div className="flex items-center gap-4 pt-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {client.posting_schedule.length} slots
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5" />
                      {client.linkedin_access_token ? 'Connected' : 'Not connected'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Send className="h-3.5 w-3.5" />
                      {client.telegram_chat_id ? 'On' : 'Off'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
