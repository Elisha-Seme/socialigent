'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CalendarClock,
  Check,
  CheckCircle2,
  MessageSquare,
  Repeat2,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsUp,
  X,
} from 'lucide-react'

// LinkedIn brand mark (Simple Icons path). Lucide no longer ships brand icons.
function LinkedinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

type Stage = 'pending' | 'rewriting' | 'scheduled' | 'published'

const BRAND = 'Kijani Solar'
const SLOT = 'Tue 09:00'

// Example drafts written to the same rules the product enforces.
const DRAFTS = [
  `Last month we fitted rooftop systems for 41 homes in Nakuru. The question we heard most wasn't about price. It was "what happens when it rains for a week?"

The battery covers about three cloudy days, and the grid tie handles the rest. We now show every customer their own usage curve before we quote.

#SolarKenya #RenewableEnergy`,
  `Rainy season is the real test for solar. A battery sized for three cloudy days plus a grid tie keeps the lights on. Ask us for your usage curve before you buy.

#SolarKenya #CleanEnergy`,
]

// Motion tokens (Corporate personality): one curve, three durations.
const EASE = [0.2, 0, 0, 1] as const
const QUICK = 0.15
const STANDARD = 0.28
const SLOW = 0.6

const PROGRESS: Record<Stage, number> = { pending: 0, rewriting: 0, scheduled: 0.5, published: 1 }

export function InteractivePipeline() {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<Stage>('pending')
  const [draft, setDraft] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, reduce ? 0 : ms))
  }

  const approve = () => {
    setStage('scheduled')
    later(1100, () => setStage('published'))
  }

  const reject = () => {
    setStage('rewriting')
    later(1400, () => {
      setDraft((d) => (d + 1) % DRAFTS.length)
      setStage('pending')
    })
  }

  const replay = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setDraft(0)
    setStage('pending')
  }

  const t = (duration: number) => (reduce ? { duration: 0 } : { duration, ease: EASE })

  return (
    <div className="mx-auto max-w-5xl rounded-2xl border bg-card p-5 shadow-sm md:p-10">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-indigo-500" aria-hidden="true" />
          <span>Interactive demo</span>
        </div>
        <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">Approve a post the way you would on your phone</h3>
        <p className="mx-auto mt-2 max-w-[60ch] text-muted-foreground">
          Approve it to schedule it. Reject it and the AI rewrites the draft with your feedback.
        </p>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        {/* Telegram approval message */}
        <div className="flex min-h-[380px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-white">
          <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500">
              <Send className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">Socialigent</p>
              <p className="text-xs text-sky-400">bot</p>
            </div>
          </div>

          <motion.div
            className="my-5 flex-1"
            animate={stage === 'rewriting' && !reduce ? { x: [0, -6, 6, -3, 0] } : { x: 0 }}
            transition={{ duration: 0.32, ease: 'easeInOut' }}
          >
            <div className="space-y-2 rounded-2xl rounded-tl-none bg-zinc-800 p-4 text-xs">
              <p className="text-[11px] text-zinc-400">New post for {BRAND}: awaiting your approval</p>
              <AnimatePresence mode="wait" initial={false}>
                {stage === 'rewriting' ? (
                  <motion.div
                    key="rewriting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={t(QUICK)}
                    className="space-y-2 py-1"
                    aria-hidden="true"
                  >
                    {[92, 100, 78, 96, 60].map((w, i) => (
                      <div key={i} className="h-2.5 animate-pulse rounded bg-zinc-700" style={{ width: `${w}%` }} />
                    ))}
                  </motion.div>
                ) : (
                  <motion.p
                    key={`draft-${draft}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={t(STANDARD)}
                    className="whitespace-pre-line leading-relaxed text-zinc-100"
                  >
                    {DRAFTS[draft]}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <div aria-live="polite" className="min-h-[44px]">
            <AnimatePresence mode="wait" initial={false}>
              {stage === 'pending' && (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={t(QUICK)}
                  className="grid grid-cols-2 gap-3"
                >
                  <button
                    type="button"
                    onClick={reject}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 active:scale-[0.98]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={approve}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:scale-[0.98]"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" /> Approve
                  </button>
                </motion.div>
              )}
              {stage === 'rewriting' && (
                <motion.p
                  key="rewriting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={t(QUICK)}
                  className="flex h-11 items-center justify-center gap-2 text-sm text-zinc-300"
                >
                  <Sparkles className="h-4 w-4 text-sky-400" aria-hidden="true" /> Rewriting with your feedback…
                </motion.p>
              )}
              {stage === 'scheduled' && (
                <motion.p
                  key="scheduled"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={t(QUICK)}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-sm font-medium text-emerald-300"
                >
                  <CalendarClock className="h-4 w-4" aria-hidden="true" /> Approved. Goes live {SLOT}
                </motion.p>
              )}
              {stage === 'published' && (
                <motion.div
                  key="published"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={t(QUICK)}
                  className="flex h-11 items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-300"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Published to LinkedIn
                  </span>
                  <button
                    type="button"
                    onClick={replay}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" /> Replay
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Connector: fills as the post moves from approval to the feed */}
        <div className="flex items-center justify-center" aria-hidden="true">
          <div className="relative hidden h-1 w-16 overflow-hidden rounded-full bg-muted md:block">
            <motion.div
              className="absolute inset-0 origin-left rounded-full bg-indigo-500"
              initial={false}
              animate={{ scaleX: PROGRESS[stage] }}
              transition={t(SLOW)}
            />
          </div>
          <div className="relative h-8 w-1 overflow-hidden rounded-full bg-muted md:hidden">
            <motion.div
              className="absolute inset-0 origin-top rounded-full bg-indigo-500"
              initial={false}
              animate={{ scaleY: PROGRESS[stage] }}
              transition={t(SLOW)}
            />
          </div>
        </div>

        {/* LinkedIn feed */}
        <div className="relative flex min-h-[380px] flex-col justify-center rounded-2xl border bg-background p-5">
          <div className="absolute right-4 top-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LinkedinMark className="h-3.5 w-3.5 text-[#0a66c2]" />
            LinkedIn feed
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {stage === 'published' ? (
              <motion.article
                key="post"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={t(STANDARD)}
                className="space-y-3 pt-6"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
                    KS
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{BRAND}</p>
                    <p className="text-xs text-muted-foreground">Rooftop solar for homes and small shops · Just now</p>
                  </div>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed">{DRAFTS[draft]}</p>
                <div className="flex justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> Like</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Comment</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" aria-hidden="true" /> Repost</span>
                  <span className="flex items-center gap-1"><Send className="h-3.5 w-3.5" aria-hidden="true" /> Send</span>
                </div>
              </motion.article>
            ) : (
              <motion.div
                key={stage === 'scheduled' ? 'queued' : 'waiting'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={t(STANDARD)}
                className="flex flex-col items-center p-4 text-center"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {stage === 'scheduled' ? (
                    <CalendarClock className="h-6 w-6 text-indigo-500" aria-hidden="true" />
                  ) : (
                    <LinkedinMark className="h-6 w-6" />
                  )}
                </div>
                <p className="text-sm font-semibold">{stage === 'scheduled' ? `Queued for ${SLOT}` : 'Waiting for your approval'}</p>
                <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                  {stage === 'scheduled'
                    ? 'Approved posts publish automatically when their slot arrives.'
                    : 'Nothing goes live until you approve it.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
