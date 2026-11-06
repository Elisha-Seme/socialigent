import { notFound } from 'next/navigation'
import { Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientForm } from '@/components/clients/ClientForm'
import { TelegramConnect } from '@/components/clients/TelegramConnect'
import { toClientProfile, type Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('*').single()

  if (!data) notFound()
  // Strip tokens before anything reaches a client component.
  const client = toClientProfile(data as Client)

  const tokenDaysLeft = client.linkedin_token_expires_at
    ? Math.ceil((new Date(client.linkedin_token_expires_at).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4" aria-hidden="true" /> LinkedIn
            </span>
            <span className="flex items-center gap-2">
              {client.linkedin_connected && (
                <Badge variant={tokenDaysLeft !== null && tokenDaysLeft <= 0 ? 'destructive' : 'default'}>
                  {tokenDaysLeft !== null && tokenDaysLeft <= 0 ? 'Expired' : 'Connected'}
                </Badge>
              )}
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/linkedin/oauth?clientId=${client.id}`}>
                  {client.linkedin_connected ? 'Reconnect' : 'Connect'}
                </a>
              </Button>
            </span>
          </div>
          {client.linkedin_connected && tokenDaysLeft !== null && tokenDaysLeft <= 14 && (
            <p className="text-xs text-destructive">
              {tokenDaysLeft <= 0
                ? 'Your LinkedIn connection has expired. Reconnect to keep publishing.'
                : `LinkedIn connection expires in ${tokenDaysLeft} day${tokenDaysLeft === 1 ? '' : 's'}.`}
            </p>
          )}

          <div className="border-t pt-4">
            <TelegramConnect clientId={client.id} isConnected={!!client.telegram_chat_id} />
          </div>
        </CardContent>
      </Card>

      <ClientForm client={client} />
    </div>
  )
}
