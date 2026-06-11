'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/posts', label: 'Posts', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-bold">
          Socialigent
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
