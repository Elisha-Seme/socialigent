import { ClientForm } from '@/components/clients/ClientForm'

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Add client</h1>
      <ClientForm />
    </div>
  )
}
