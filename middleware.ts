import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!login|signup|onboard|privacy|auth/callback|api/telegram/webhook|api/linkedin/callback|_next/static|_next/image|favicon).*)',
  ],
}
