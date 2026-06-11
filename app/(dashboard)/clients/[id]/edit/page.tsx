import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientForm } from '@/components/clients/ClientForm'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EditClientPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!data) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Edit {data.name}</h1>
      <ClientForm client={data as Client} />
    </div>
  )
}
