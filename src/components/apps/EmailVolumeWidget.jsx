import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'

// Resend's free-plan transactional cap. This widget only tracks the
// transactional side (send-daily-notifications' flush) via
// email_volume_log / bump_email_volume — see supabase/migrations/
// pending_notifications.sql. The community digest runs on Resend
// Broadcasts' separate marketing quota and isn't counted here.
const DAILY_CAP = 100
const WARN_THRESHOLD = 80

function statusColor(count) {
  if (count >= WARN_THRESHOLD) return { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', bar: '#C62828' }
  if (count >= DAILY_CAP * 0.5) return { text: 'text-gold-700', bg: 'bg-gold-50', border: 'border-gold-200', bar: '#d4900f' }
  return { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', bar: '#2E7D32' }
}

function formatDay(dayStr) {
  // dayStr is 'YYYY-MM-DD'
  const d = new Date(dayStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── History modal: one month at a time, Prev/Next to scroll ────────────────
function EmailVolumeHistoryModal({ onClose }) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() }) // month is 0-indexed
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (year, month) => {
    setLoading(true)
    const start = new Date(year, month, 1).toISOString().slice(0, 10)
    const end = new Date(year, month + 1, 0).toISOString().slice(0, 10) // last day of month
    const { data, error } = await supabase
      .from('email_volume_log')
      .select('day, sent_count')
      .gte('day', start)
      .lte('day', end)
      .order('day', { ascending: true })
    if (!error) setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load(cursor.year, cursor.month)
  }, [cursor, load])

  const chartData = rows.map(r => ({ day: formatDay(r.day), count: r.sent_count }))
  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth()

  const goPrev = () => {
    setCursor(c => {
      const m = c.month - 1
      return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m }
    })
  }
  const goNext = () => {
    if (isCurrentMonth) return
    setCursor(c => {
      const m = c.month + 1
      return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m }
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-xl text-brand-800" style={{ fontFamily: "'Playfair Display', serif" }}>
            📧 Daily Transactional Email Volume
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Resend free-plan cap is {DAILY_CAP}/day. Digest broadcasts aren't included — they run on a separate quota.
        </p>

        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goPrev}
            className="text-sm px-3 py-1.5 rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            ← Prev
          </button>
          <span className="font-medium text-brand-700">{monthLabel(cursor.year, cursor.month)}</span>
          <button
            onClick={goNext}
            disabled={isCurrentMonth}
            className="text-sm px-3 py-1.5 rounded-full border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            Next →
          </button>
        </div>

        <div style={{ width: '100%', height: 280 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">No data for this month</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd5" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, DAILY_CAP]} />
                <Tooltip formatter={(value) => [`${value} / ${DAILY_CAP}`, 'Sent']} />
                <ReferenceLine y={WARN_THRESHOLD} stroke="#C62828" strokeDasharray="4 4" label={{ value: 'warn', position: 'insideTopRight', fill: '#C62828', fontSize: 10 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={statusColor(entry.count).bar} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Small widget: today's (most recent) count, click for history ──────────
export default function EmailVolumeWidget() {
  const [latest, setLatest] = useState(null) // { day, sent_count } | null
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('email_volume_log')
        .select('day, sent_count')
        .order('day', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        if (error) {
          console.error('EmailVolumeWidget: failed to read email_volume_log —', error.message)
          setLoadError(error.message)
        } else {
          setLatest(data)
        }
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return null

  // Surface a read failure instead of silently vanishing — most likely cause
  // is the "Admins can view email volume log" RLS policy not having been
  // run yet (supabase/migrations/email_volume_log_admin_policy.sql).
  if (loadError) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <span className="text-2xl">⚠️</span>
        <div>
          <p className="font-medium text-red-700 text-sm">Email Volume widget couldn't load</p>
          <p className="text-xs text-red-500 mt-0.5">{loadError} — check that the admin RLS policy migration has been run.</p>
        </div>
      </div>
    )
  }

  // No rows yet — most likely explanation: no comments/clubhouse/access-request
  // activity has happened since this went live, so send-daily-notifications
  // ran with an empty queue and never called bump_email_volume. Say so
  // explicitly rather than just vanishing, which looks identical to "broken."
  if (!latest) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
        <span className="text-2xl">📧</span>
        <div>
          <p className="font-medium text-gray-700 text-sm">Email Volume — no data yet</p>
          <p className="text-xs text-gray-400 mt-0.5">
            This fills in once the daily notification flush actually sends something (it only logs a day when at least one email goes out).
          </p>
        </div>
      </div>
    )
  }

  const colors = statusColor(latest.sent_count)
  const dayDate = new Date(latest.day + 'T00:00:00')
  const isToday = dayDate.toDateString() === new Date().toDateString()

  return (
    <>
      <button
        onClick={() => setShowHistory(true)}
        className={`flex items-center justify-between rounded-xl border px-5 py-4 hover:shadow-md transition-shadow w-full text-left ${colors.bg} ${colors.border}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📧</span>
          <div>
            <p className="font-medium text-gray-800 text-sm">
              Email Volume {isToday ? 'Today' : `(${formatDay(latest.day)})`}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Transactional sends vs. Resend's free-plan cap</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${colors.text} bg-white/70`}>
            {latest.sent_count} / {DAILY_CAP}
          </span>
          <span className="text-gray-400 text-sm">→</span>
        </div>
      </button>

      {showHistory && <EmailVolumeHistoryModal onClose={() => setShowHistory(false)} />}
    </>
  )
}
