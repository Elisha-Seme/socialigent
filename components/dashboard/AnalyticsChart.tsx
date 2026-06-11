'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Post } from '@/lib/types'

export function AnalyticsChart({ posts }: { posts: Post[] }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Card className="col-span-4 h-[350px]">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Post activity (Last 7 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-[270px] flex items-center justify-center text-muted-foreground text-sm">
          Loading chart data...
        </CardContent>
      </Card>
    )
  }

  // Group posts by date for the last 7 days
  const data = Array.from({ length: 7 })
    .map((_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]

      const dayPosts = posts.filter(
        (p) => new Date(p.created_at).toISOString().split('T')[0] === dateStr
      )

      return {
        date: new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        published: dayPosts.filter((p) => p.status === 'published').length,
        pending: dayPosts.filter((p) => p.status === 'pending_approval' || p.status === 'approved').length,
        failed: dayPosts.filter((p) => p.status === 'failed').length,
      }
    })
    .reverse()

  return (
    <Card className="col-span-4 h-[350px]">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Post activity (Last 7 days)</CardTitle>
      </CardHeader>
      <CardContent className="h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120, 120, 120, 0.15)" />
            <XAxis
              dataKey="date"
              stroke="#888888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                borderColor: 'rgba(120, 120, 120, 0.2)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            <Bar dataKey="published" name="Published" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pending" name="Pending" fill="#6b7280" radius={[4, 4, 0, 0]} opacity={0.6} />
            <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
