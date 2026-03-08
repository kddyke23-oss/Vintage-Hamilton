import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useAppAccess } from '@/hooks/useAppAccess'

const ALL_APPS = [
  { id: 'directory', label: 'Resident Directory', description: 'Find and connect with your neighbors', icon: '👥', path: '/apps/directory' },
  { id: 'calendar',  label: 'Social Calendar',    description: 'Community events and activities',    icon: '📅', path: '/apps/calendar' },
  { id: 'lotto',     label: 'Lotto Tracker',       description: 'Community lottery pools and results', icon: '🎟️', path: '/apps/lotto' },
  { id: 'blog',      label: 'Community Blog',      description: 'News, stories, and announcements',  icon: '📝', path: '/apps/blog' },
]

export default function HomePage() {
  const { user, isAdmin } = useAuth()
  const { hasAccess, loading } = useAppAccess()
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Neighbor'

  const visibleApps = ALL_APPS.filter(app => hasAccess(app.id))

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

      {/* Upcoming events placeholder */}
      <div>
        <h2 className="font-display text-xl text-brand-800 mb-4">Upcoming Events</h2>
        <div className="bg-white rounded-2xl border border-brand-100 p-6 text-center text-brand-400 text-sm">
          Events will appear here once the Social Calendar is set up.
        </div>
      </div>
    </div>
  )
}
