import { notFound } from 'next/navigation'
import { Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientForm } from '@/components/clients/ClientForm'
import { TelegramConnect } from '@/components/clients/TelegramConnect'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('*').single()

  if (!data) notFound()
  const client = data as Client

  const tokenExpiryDays = client.linkedin_token_expires_at
    ? Math.floor((new Date(client.linkedin_token_expires_at).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Connections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* LinkedIn */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4" /> LinkedIn
            </span>
            <span className="flex items-center gap-2">
              {client.linkedin_access_token && <Badge variant="default">Connected</Badge>}
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/linkedin/oauth?clientId=${client.id}`}>
                  {client.linkedin_access_token ? 'Reconnect' : 'Connect'}
                </a>
              </Button>
            </span>
          </div>
          {tokenExpiryDays !== null && tokenExpiryDays < 14 && (
            <p className="text-xs text-destructive">
              LinkedIn token expires in {tokenExpiryDays} day{tokenExpiryDays !== 1 ? 's' : ''}
            </p>
          )}

          <div className="border-t pt-4">
            <TelegramConnect clientId={client.id} isConnected={!!client.telegram_chat_id} />
          </div>
        </CardContent>
      </Card>

      {/* Brand profile + schedule */}
      <ClientForm client={client} />
    </div>
  )
}
