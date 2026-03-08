import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const apps = [
  { id: 'directory', label: 'Resident Directory', description: 'Find and connect with your neighbors', icon: '👥', path: '/apps/directory' },
  { id: 'calendar',  label: 'Social Calendar',    description: 'Community events and activities',    icon: '📅', path: '/apps/calendar' },
  { id: 'lotto',     label: 'Lotto Tracker',       description: 'Community lottery pools and results', icon: '🎟️', path: '/apps/lotto' },
  { id: 'blog',      label: 'Community Blog',      description: 'News, stories, and announcements',  icon: '📝', path: '/apps/blog' },
]

export default function HomePage() {
  const { user } = useAuth()
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Neighbor'

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="bg-brand-800 text-white rounded-2xl px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1">
            Welcome back, {firstName}!
          </h1>
          <p className="text-brand-300">Here's what's happening in your community.</p>
        </div>
        <div className="text-5xl hidden sm:block">🏡</div>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="font-display text-xl text-brand-800 mb-4">Community Apps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {apps.map(app => (
            <Link
              key={app.id}
              to={app.path}
              className="block p-6 bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-3">{app.icon}</div>
              <h3 className="font-display text-base font-semibold text-brand-800 mb-1">{app.label}</h3>
              <p className="text-brand-500 text-sm">{app.description}</p>
            </Link>
          ))}
        </div>
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
