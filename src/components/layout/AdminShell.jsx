import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const adminNav = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Residents', path: '/admin/residents' },
  { label: 'App Access', path: '/admin/access' },
]

export default function AdminShell({ children }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-brand-50 font-body">
      {/* Top bar */}
      <header className="bg-brand-900 text-white shadow-lg fixed top-0 left-0 right-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="font-display text-xl font-semibold text-white">
              Vintage <span className="text-gold-400">@</span> Hamilton
            </Link>
            <span className="bg-gold-500 text-brand-900 text-xs font-bold px-2 py-0.5 rounded-full">
              ADMIN
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-brand-300 hover:text-white text-sm transition-colors">
              ← Resident View
            </Link>
            <span className="text-brand-400 text-sm hidden sm:block">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm bg-brand-700 hover:bg-brand-600 px-4 py-1.5 rounded-full transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Admin nav */}
        <nav className="bg-brand-800 border-t border-brand-700">
          <div className="px-4 flex gap-1">
            {adminNav.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'text-gold-300 border-b-2 border-gold-400'
                    : 'text-brand-300 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="pt-24 max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>

      <footer className="text-center text-brand-400 text-xs py-6 border-t border-brand-200">
        © {new Date().getFullYear()} Vintage @ Hamilton — Admin Portal
      </footer>
    </div>
  )
}
