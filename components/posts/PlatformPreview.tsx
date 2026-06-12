'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Globe, ThumbsUp, MessageCircle, Repeat2,
  Send, Share2, Heart, BarChart2, Bookmark, BadgeCheck, MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Platform = 'linkedin' | 'facebook' | 'x'

// lucide-react no longer ships brand icons — inline SVG glyphs instead
const BRAND_PATHS: Record<Platform, string> = {
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z',
  facebook:
    'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
}

function BrandIcon({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={BRAND_PATHS[platform]} />
    </svg>
  )
}

const PLATFORMS: Array<{ id: Platform; label: string }> = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X' },
]

const ACCENT: Record<Platform, string> = {
  linkedin: '#0a66c2',
  facebook: '#1877f2',
  x: '#1d9bf0',
}

const AVATAR_COLORS = ['#0a66c2', '#7c3aed', '#0d9488', '#b91c1c', '#b45309', '#1d4ed8']

function avatarColor(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// Colour hashtags and links the way each platform does
function renderRichText(text: string, accent: string) {
  const parts = text.split(/(#\w+|https?:\/\/\S+)/g)
  return parts.map((part, i) =>
    /^(#\w+|https?:\/\/)/.test(part) ? (
      <span key={i} style={{ color: accent }} className="font-medium">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className
      )}
      style={{ backgroundColor: avatarColor(name) }}
    >
      {initials(name)}
    </div>
  )
}

function PostImage({ imageUrl, rounded }: { imageUrl: string; rounded?: boolean }) {
  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden bg-gray-100',
        rounded && 'rounded-2xl border border-gray-200'
      )}
    >
      <Image
        src={imageUrl}
        alt="Post image"
        fill
        sizes="(max-width: 768px) 100vw, 672px"
        className="object-cover"
      />
    </div>
  )
}

// Mocks force light-theme colours so they look like the real platforms
// even when the dashboard is in dark mode.

function LinkedInMock({ name, caption, imageUrl }: MockProps) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 210
  const truncated = caption.length > LIMIT && !expanded

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm">
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <Avatar name={name} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-gray-500">1,284 followers</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            2h · <Globe className="h-3 w-3" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 shrink-0 text-gray-500" />
      </div>

      <div className="px-4 py-2 text-sm leading-snug">
        <span className="whitespace-pre-wrap">
          {renderRichText(truncated ? caption.slice(0, LIMIT).trimEnd() : caption, ACCENT.linkedin)}
        </span>
        {truncated && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-1 text-gray-500 hover:text-[#0a66c2] hover:underline"
          >
            …more
          </button>
        )}
      </div>

      {imageUrl && <PostImage imageUrl={imageUrl} />}

      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0a66c2]">
            <ThumbsUp className="h-2.5 w-2.5 fill-white text-white" />
          </span>
          Wanjiku and 46 others
        </span>
        <span>12 comments · 3 reposts</span>
      </div>

      <div className="mx-3 grid grid-cols-4 border-t border-gray-200 py-1">
        {[
          { icon: ThumbsUp, label: 'Like' },
          { icon: MessageCircle, label: 'Comment' },
          { icon: Repeat2, label: 'Repost' },
          { icon: Send, label: 'Send' },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex items-center justify-center gap-1.5 rounded py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            <Icon className="h-4 w-4" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function FacebookMock({ name, caption, imageUrl }: MockProps) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 280
  const truncated = caption.length > LIMIT && !expanded

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm">
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <Avatar name={name} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            2h · <Globe className="h-3 w-3" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 shrink-0 text-gray-500" />
      </div>

      <div className="px-4 py-2 text-[15px] leading-snug">
        <span className="whitespace-pre-wrap">
          {renderRichText(truncated ? caption.slice(0, LIMIT).trimEnd() : caption, ACCENT.facebook)}
        </span>
        {truncated && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-1 font-medium text-gray-500 hover:underline"
          >
            See more
          </button>
        )}
      </div>

      {imageUrl && <PostImage imageUrl={imageUrl} />}

      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1877f2]">
            <ThumbsUp className="h-2.5 w-2.5 fill-white text-white" />
          </span>
          47
        </span>
        <span>12 comments · 5 shares</span>
      </div>

      <div className="mx-3 grid grid-cols-3 border-t border-gray-200 py-1">
        {[
          { icon: ThumbsUp, label: 'Like' },
          { icon: MessageCircle, label: 'Comment' },
          { icon: Share2, label: 'Share' },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex items-center justify-center gap-1.5 rounded py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <Icon className="h-4 w-4" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function XMock({ name, caption, imageUrl }: MockProps) {
  const handle = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const overLimit = caption.length > 280

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm">
      <div className="flex gap-2.5 px-4 py-3">
        <Avatar name={name} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="truncate font-bold">{name}</span>
            <BadgeCheck className="h-4 w-4 shrink-0 fill-[#1d9bf0] text-white" />
            <span className="truncate text-gray-500">@{handle} · 2h</span>
            <MoreHorizontal className="ml-auto h-4 w-4 shrink-0 text-gray-500" />
          </div>

          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">
            {renderRichText(caption, ACCENT.x)}
          </p>

          {imageUrl && (
            <div className="mt-2">
              <PostImage imageUrl={imageUrl} rounded />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between pr-6 text-xs text-gray-500">
            {[
              { icon: MessageCircle, count: '12' },
              { icon: Repeat2, count: '8' },
              { icon: Heart, count: '47' },
              { icon: BarChart2, count: '2.1K' },
            ].map(({ icon: Icon, count }, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                {count}
              </span>
            ))}
            <span className="flex items-center gap-3">
              <Bookmark className="h-4 w-4" />
              <Share2 className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      {overLimit && (
        <p className="border-t border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          {caption.length}/280 characters — this would need X Premium or trimming to post on X.
        </p>
      )}
    </div>
  )
}

interface MockProps {
  name: string
  caption: string
  imageUrl: string | null
}

export function PlatformPreview({
  clientName,
  caption,
  imageUrl,
}: {
  clientName: string
  caption: string
  imageUrl: string | null
}) {
  const [platform, setPlatform] = useState<Platform>('linkedin')

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {PLATFORMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPlatform(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                platform === id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted'
              )}
            >
              <BrandIcon platform={id} className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          Preview only — publishing goes to LinkedIn
        </span>
      </div>

      {platform === 'linkedin' && (
        <LinkedInMock name={clientName} caption={caption} imageUrl={imageUrl} />
      )}
      {platform === 'facebook' && (
        <FacebookMock name={clientName} caption={caption} imageUrl={imageUrl} />
      )}
      {platform === 'x' && <XMock name={clientName} caption={caption} imageUrl={imageUrl} />}
    </div>
  )
}
