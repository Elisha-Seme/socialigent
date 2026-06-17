import { redirect } from 'next/navigation'

// Dashboard lives at /overview — redirect root to keep URLs consistent
export default function RootPage() {
  redirect('/overview')
}
