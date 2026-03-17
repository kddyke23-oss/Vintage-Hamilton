import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import AdminReportsWidget from '@/components/apps/AdminReportsWidget'

const ALL_APPS = [
  { id: 'directory',       label: 'Resident Directory',         description: 'Find and connect with your neighbors',   icon: '👥', path: '/apps/directory' },
  { id: 'calendar',        label: 'Social Calendar',            description: 'Community events and activities',         icon: '📅', path: '/apps/calendar' },
  { id: 'lotto',           label: 'Lotto Tracker',              description: 'Community lottery pools and results',     icon: '🎟️', path: '/apps/lotto' },
  { id: 'blog',            label: 'Community Blog',             description: 'News, stories, and announcements',        icon: '📝', path: '/apps/blog' },
  { id: 'recommendations', label: "Residents' Recommendations", description: 'Tips, recommendations and warnings',      icon: '⭐', path: '/apps/recommendations' },
]

function formatEventDate(dateStr, timeStr) {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  let dayLabel
  if (date.getTime() === today.getTime()) {
    dayLabel = 'Today'
  } else if (date.getTime() === tomorrow.getTime()) {
    dayLabel = 'Tomorrow'
  } else {
    dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  if (!timeStr) return dayLabel
  const [h, m] = timeStr.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  const mins = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
  return `${dayLabel} · ${hour}${mins}${suffix}`
}

function UpcomingEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchEvents() {
      try {
        const today = new Date().toISOString().split('T')[0]
        const { data, error } = await supabase
          .from('calendar_events')
          .select(`
            id, title, event_date, event_time, location,
            calendar_categories ( name, color )
          `)
          .eq('removed', false)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true, nullsFirst: false })
          .limit(4)

        if (error) throw error
        setEvents(data || [])
      } catch (e) {
        console.error('Failed to load upcoming events', e)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-brand-100 p-6 text-center text-brand-400 text-sm">
        Loading events…
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-brand-100 p-6 text-center text-brand-400 text-sm">
        No upcoming events right now. Check back soon!
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-100 divide-y divide-brand-50">
      {events.map(event => {
        const category = event.calendar_categories
        const color = category?.color || '#2C5F8A'
        return (
          <div key={event.id} className="flex items-start gap-4 px-5 py-4">
            <div
              className="w-1 flex-shrink-0 rounded-full self-stretch min-h-[40px]"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-brand-800 text-sm truncate">{event.title}</p>
              <p className="text-brand-500 text-xs mt-0.5">
                {formatEventDate(event.event_date, event.event_time)}
                {event.location && <> · {event.location}</>}
              </p>
              {category?.name && (
                <span
                  className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-white text-xs font-medium"
                  style={{ backgroundColor: color }}
                >
                  {category.name}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <div className="px-5 py-3">
        <Link
          to="/apps/calendar"
          className="text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
        >
          View all events →
        </Link>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { user, isAdmin, hasAppAccess, loading } = useAuth()
  const [firstName, setFirstName] = useState('Neighbor')

  // Fetch profile to get names field for personalised greeting
  useEffect(() => {
    if (!user) return
    async function fetchProfile() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('names')
          .eq('id', user.id)
          .single()
        if (error) throw error
        if (data?.names) {
          // names may be "Keith" or "Keith Lou" — take the first word
          setFirstName(data.names.trim().split(' ')[0])
        }
      } catch (e) {
        console.error('Failed to load profile for greeting', e)
      }
    }
    fetchProfile()
  }, [user])

  const visibleApps = useMemo(() => ALL_APPS.filter(app => hasAppAccess(app.id)), [hasAppAccess])

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="bg-brand-800 text-white rounded-2xl px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1">Welcome back, {firstName}!</h1>
          <p className="text-brand-300">Here's what's happening in your community.</p>
        </div>
        <div className="text-5xl hidden sm:block">🏡</div>
      </div>

      {/* Admin shortcut */}
      {isAdmin && (
        <div className="bg-gold-50 border-2 border-gold-300 rounded-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔑</span>
            <div>
              <div className="font-semibold text-brand-800">Admin Portal</div>
              <div className="text-sm text-brand-500">Manage residents, access, and settings</div>
            </div>
          </div>
          <Link to="/admin"
            className="bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Open Admin
          </Link>
        </div>
      )}

      {/* Community Apps */}
      <div>
        <h2 className="font-display text-xl text-brand-800 mb-4">Community Apps</h2>
        {loading ? (
          <div className="text-brand-400 text-sm">Loading your apps…</div>
        ) : visibleApps.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-100 p-8 text-center text-brand-400 text-sm">
            You don't have access to any apps yet. Please contact your administrator.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleApps.map(app => (
              <Link key={app.id} to={app.path}
                className="block p-6 bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all">
                <div className="text-3xl mb-3">{app.icon}</div>
                <h3 className="font-display text-base font-semibold text-brand-800 mb-1">{app.label}</h3>
                <p className="text-brand-500 text-sm">{app.description}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-brand-800">Upcoming Events</h2>
          <Link to="/apps/calendar" className="text-sm text-brand-500 hover:text-brand-700 transition-colors">
            Full calendar →
          </Link>
        </div>
        <UpcomingEvents />
      </div>

      {/* Admin reports widget */}
      <AdminReportsWidget />
    </div>
  )
}
