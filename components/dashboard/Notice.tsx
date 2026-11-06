import { AlertTriangle, CheckCircle2, PauseCircle, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'warning' | 'error' | 'success' | 'paused'

const TONES: Record<Tone, { icon: LucideIcon; className: string }> = {
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  },
  paused: {
    icon: PauseCircle,
    className: 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  },
  error: {
    icon: XCircle,
    className: 'border-destructive bg-destructive/10 text-destructive',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200',
  },
}

// Status banner: icon + text (never colour alone), announced politely to
// screen readers; errors use role="alert".
export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  const { icon: Icon, className } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-3 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-center', className)}
    >
      <div className="flex flex-1 items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="font-medium">{title}</p>
          {children && <div className="opacity-90">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
