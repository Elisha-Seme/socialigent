import Link from 'next/link'
import { ArrowRight, Bot, CalendarClock, History, ImageIcon, PenLine, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InteractivePipeline } from '@/components/landing/InteractivePipeline'

export const metadata = {
  title: 'Socialigent: LinkedIn posts in your voice, approved from Telegram',
  description:
    'Claude drafts each LinkedIn post in your brand voice, you approve it in Telegram with one tap, and it publishes on schedule.',
}

const FEATURES = [
  {
    icon: Bot,
    title: 'Drafts that sound like you',
    body: 'Claude writes three caption options per post from your brand voice and topics. Paste your website and it drafts the profile for you.',
    className: 'lg:col-span-2 bg-indigo-50 dark:bg-indigo-950/40',
  },
  {
    icon: Send,
    title: 'Approve from Telegram',
    body: 'Tap Approve or Reject, or just reply: "make it shorter", "post it now", "move it to Friday".',
    className: 'bg-card',
  },
  {
    icon: CalendarClock,
    title: 'Runs on your schedule',
    body: 'Pick your posting days. Drafts arrive an hour before each slot, and approved posts go out on time.',
    className: 'bg-card',
  },
  {
    icon: PenLine,
    title: 'No AI tells',
    body: 'Writing rules and a cleanup pass remove the usual giveaways: no em dashes, no engagement bait, no emoji bullet lists.',
    className: 'bg-card',
  },
  {
    icon: ImageIcon,
    title: 'Images when you want them',
    body: 'Send a photo to the bot and it builds the post around it, or turn on AI images for every draft.',
    className: 'bg-card',
  },
  {
    icon: History,
    title: 'Calendar and full history',
    body: 'See the month at a glance. Every approval, rejection and publish is logged, and failed posts tell you exactly why.',
    className: 'lg:col-span-3 bg-muted/60',
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Bot className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <span>Socialigent</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#demo" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild className="bg-indigo-600 font-medium text-white hover:bg-indigo-500">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="pb-16 pt-20 md:pb-24 md:pt-24">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            LinkedIn posts in your voice, approved from Telegram
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Socialigent drafts each post with Claude, sends it to your Telegram for a one-tap approval, then publishes on schedule.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button size="lg" asChild className="bg-indigo-600 px-8 text-base font-semibold text-white hover:bg-indigo-500 active:scale-[0.98]">
              <Link href="/signup">
                Get started <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="px-8 text-base font-semibold">
              <a href="#demo">See how it works</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="demo" className="border-y bg-muted/40 py-12 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <InteractivePipeline />
        </div>
      </section>

      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Your LinkedIn, handled from a chat</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              No content calendar to babysit. Drafts come to you, and nothing posts without your yes.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body, className }) => (
              <div key={title} className={`rounded-2xl border p-7 ${className}`}>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
            Posting as a LinkedIn Company Page needs LinkedIn&apos;s Community Management approval. Until that&apos;s granted,
            posts go out on your personal profile.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted py-20 md:py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Set up your brand in a few minutes</h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
            Paste your website, pick your posting days, and connect LinkedIn and Telegram. Your first draft is waiting when you finish.
          </p>
          <div className="mt-8 flex justify-center">
            <Button size="lg" asChild className="bg-indigo-600 font-semibold text-white hover:bg-indigo-500 active:scale-[0.98]">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-12 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            <span className="font-semibold text-foreground">Socialigent</span>
            <span>© 2026</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy Policy</Link>
            <a
              href="https://github.com/Elisha-Seme/socialigent"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
