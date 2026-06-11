import { Badge } from '@/components/ui/badge'
import type { PostStatus } from '@/lib/types'

const variants: Record<PostStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  pending_approval: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  published: 'default',
  failed: 'destructive',
}

export function StatusBadge({ status }: { status: PostStatus }) {
  return <Badge variant={variants[status]}>{status.replace('_', ' ')}</Badge>
}
