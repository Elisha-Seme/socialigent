'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export function ApproveRejectButtons({
  postId,
  caption,
  scheduledAt,
}: {
  postId: string
  caption?: string
  scheduledAt?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const call = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Request failed')
    }
  }

  const handleApprove = async () => {
    setLoading('approve')
    setError(null)
    const promise = call('/api/approve', { postId, caption, scheduledAt })

    toast.promise(promise, {
      loading: 'Approving post...',
      success: 'Post approved successfully!',
      error: (err) => err.message || 'Failed to approve post.',
    })

    try {
      await promise
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async () => {
    setLoading('reject')
    setError(null)
    const promise = call('/api/reject', { postId, reason: reason || null })

    toast.promise(promise, {
      loading: 'Rejecting post...',
      success: 'Post rejected.',
      error: (err) => err.message || 'Failed to reject post.',
    })

    try {
      await promise
      setRejectOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button onClick={handleApprove} disabled={loading !== null}>
          {loading === 'approve' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
        <Button
          variant="destructive"
          onClick={() => setRejectOpen(true)}
          disabled={loading !== null}
        >
          <X className="mr-2 h-4 w-4" />
          Reject
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this post?</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional) — helps the AI improve future drafts"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={loading === 'reject'}
            >
              {loading === 'reject' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {loading === 'reject' ? 'Rejecting…' : 'Reject post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
