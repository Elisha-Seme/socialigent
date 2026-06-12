import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_HEX: Record<string, string> = {
  pending_approval: '#F59E0B',
  approved: '#3B82F6',
  published: '#16A34A',
  rejected: '#EF4444',
  failed: '#EF4444',
  draft: '#9CA3AF',
}

function formatMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

type PostRow = {
  id: string
  caption: string
  status: string
  scheduled_at: string | null
  clients: { name: string } | null
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const now = new Date()
  const rawMonth = searchParams.month ?? formatMonth(now.getFullYear(), now.getMonth() + 1)
  const parts = rawMonth.split('-')
  const year = parseInt(parts[0])
  const month = parseInt(parts[1])

  const safeYear = isNaN(year) ? now.getFullYear() : year
  const safeMonth = isNaN(month) || month < 1 || month > 12 ? now.getMonth() + 1 : month

  const startDate = new Date(safeYear, safeMonth - 1, 1)
  const endDate = new Date(safeYear, safeMonth, 0, 23, 59, 59)

  const supabase = await createClient()
  const { data: rawPosts } = await supabase
    .from('posts')
    .select('id, caption, status, scheduled_at, clients(name)')
    .gte('scheduled_at', startDate.toISOString())
    .lte('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(300)

  const posts = (rawPosts ?? []) as PostRow[]

  // Group posts by calendar day number
  const postsByDay: Record<number, PostRow[]> = {}
  for (const post of posts) {
    if (!post.scheduled_at) continue
    const d = new Date(post.scheduled_at).getDate()
    if (!postsByDay[d]) postsByDay[d] = []
    postsByDay[d].push(post)
  }

  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate()
  const firstDayOfWeek = new Date(safeYear, safeMonth - 1, 1).getDay()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const todayDate = now.getDate()
  const isCurrentMonth = now.getFullYear() === safeYear && now.getMonth() + 1 === safeMonth

  const prev = addMonths(safeYear, safeMonth, -1)
  const next = addMonths(safeYear, safeMonth, 1)

  const totalCells = cells.length
  const lastRowStart = totalCells - 7

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content Calendar</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?month=${formatMonth(prev.year, prev.month)}`}
            className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[10rem] text-center text-sm font-medium">
            {MONTHS[safeMonth - 1]} {safeYear}
          </span>
          <Link
            href={`/calendar?month=${formatMonth(next.year, next.month)}`}
            className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b">
              {WEEKDAYS.map(day => (
                <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                const dayPosts = day ? (postsByDay[day] ?? []) : []
                const isToday = isCurrentMonth && day === todayDate
                const isLastRow = idx >= lastRowStart
                const isLastCol = idx % 7 === 6

                return (
                  <div
                    key={idx}
                    className={cn(
                      'min-h-[5rem] p-1.5',
                      !day && 'bg-muted/20',
                      !isLastRow && 'border-b',
                      !isLastCol && 'border-r',
                    )}
                  >
                    {day && (
                      <>
                        <div className={cn(
                          'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                          isToday
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground',
                        )}>
                          {day}
                        </div>
                        <div className="space-y-0.5">
                          {dayPosts.slice(0, 3).map(post => (
                            <Link
                              key={post.id}
                              href={`/posts/${post.id}`}
                              className="block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white hover:opacity-75 transition-opacity"
                              style={{ backgroundColor: STATUS_HEX[post.status] ?? '#9CA3AF' }}
                              title={`${post.clients?.name ?? 'Post'}: ${post.caption?.slice(0, 80)}`}
                            >
                              {post.clients?.name ?? 'Post'}
                            </Link>
                          ))}
                          {dayPosts.length > 3 && (
                            <p className="px-1 text-[10px] text-muted-foreground">
                              +{dayPosts.length - 3} more
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {[
          { label: 'Pending approval', color: STATUS_HEX.pending_approval },
          { label: 'Approved', color: STATUS_HEX.approved },
          { label: 'Published', color: STATUS_HEX.published },
          { label: 'Rejected / Failed', color: STATUS_HEX.rejected },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
