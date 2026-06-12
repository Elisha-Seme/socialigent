'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/posts/StatusBadge'
import { ApproveRejectButtons } from '@/components/posts/ApproveRejectButtons'
import { PublishButton } from '@/components/posts/PublishButton'
import { RegenerateButton } from '@/components/posts/RegenerateButton'
import { PlatformPreview } from '@/components/posts/PlatformPreview'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Post, PostHistory } from '@/lib/types'

export function PostDetailView({
  post,
  history = [],
}: {
  post: Post & { clients: { id: string; name: string } | null }
  history?: PostHistory[]
}) {
  const [caption, setCaption] = useState(post.caption)

  const formatForDateTimeLocal = (isoString: string | null): string => {
    if (!isoString) return ''
    const date = new Date(isoString)
    const pad = (num: number) => String(num).padStart(2, '0')
    const yyyy = date.getFullYear()
    const MM = pad(date.getMonth() + 1)
    const dd = pad(date.getDate())
    const hh = pad(date.getHours())
    const mm = pad(date.getMinutes())
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
  }

  const [scheduledAt, setScheduledAt] = useState(formatForDateTimeLocal(post.scheduled_at))

  const canReview = post.status === 'pending_approval' || post.status === 'draft'
  const canPublish = post.status === 'approved' || post.status === 'failed'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/posts"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All posts
        </Link>
        <StatusBadge status={post.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {post.clients ? (
              <Link href={`/clients/${post.clients.id}`} className="hover:underline">
                {post.clients.name}
              </Link>
            ) : (
              'Unknown client'
            )}{' '}
            · LinkedIn
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlatformPreview
            clientName={post.clients?.name ?? 'Your Brand'}
            caption={caption}
            imageUrl={post.image_url}
          />

          {canReview ? (
            <div className="space-y-4">
              {post.caption_variations && post.caption_variations.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Select a caption variation</Label>
                  <div className="flex gap-2">
                    {post.caption_variations.map((v, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setCaption(v)}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-md border font-medium transition-colors",
                          caption === v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground hover:bg-muted"
                        )}
                      >
                        Variation {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="caption" className="text-xs text-muted-foreground">
                  Caption (Editable before approval)
                </Label>
                <Textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={10}
                  className="font-sans text-sm leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduledAt" className="text-xs text-muted-foreground">
                  Scheduled Time (Optional override)
                </Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
            <p>Created: {new Date(post.created_at).toLocaleString()}</p>
            {post.scheduled_at && (
              <p>Scheduled: {new Date(post.scheduled_at).toLocaleString()}</p>
            )}
            {post.published_at && (
              <p>Published: {new Date(post.published_at).toLocaleString()}</p>
            )}
            {post.rejection_reason && <p>Rejection reason: {post.rejection_reason}</p>}
            {post.error_message && (
              <p className="text-destructive">Error: {post.error_message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {canReview && (
        <ApproveRejectButtons
          postId={post.id}
          caption={caption}
          scheduledAt={scheduledAt ? new Date(scheduledAt).toISOString() : undefined}
        />
      )}
      {canPublish && <PublishButton postId={post.id} />}
      {post.status === 'rejected' && <RegenerateButton postId={post.id} />}

      {/* Timeline Section */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Post history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-6 border-l border-muted space-y-6 ml-3 py-2">
              {history.map((event) => (
                <div key={event.id} className="relative">
                  {/* Timeline Dot */}
                  <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize text-sm">
                        {event.new_status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Changed by <span className="font-mono">{event.changed_by}</span>
                      {event.previous_status && (
                        <> from <span className="capitalize">{event.previous_status.replace('_', ' ')}</span></>
                      )}
                    </p>
                    {event.note && (
                      <p className="mt-1 text-xs bg-muted/50 p-2 rounded-md italic text-muted-foreground font-sans">
                        {event.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
