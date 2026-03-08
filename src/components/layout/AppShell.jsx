import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const navItems = [
  { label: 'Home', path: '/' },
  { label: 'Directory', path: '/apps/directory' },
  { label: 'Calendar', path: '/apps/calendar' },
  { label: 'Lotto', path: '/apps/lotto' },
  { label: 'Blog', path: '/apps/blog' },
]

const textSizes = {
  normal: { label: 'A', class: 'text-base' },
  large:  { label: 'A+', class: 'text-lg' },
  xlarge: { label: 'A++', class: 'text-xl' },
}

export default function AppShell({ children }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [textSize, setTextSize] = useState('normal')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`min-h-screen bg-brand-50 font-body ${textSizes[textSize].class}`}>

      {/* Top Bar */}
      <header className="bg-brand-800 text-white shadow-lg fixed top-0 left-0 right-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left: hamburger + logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="text-brand-300 hover:text-white p-1 rounded transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link to="/" className="font-display text-xl font-semibold text-white">
              Vintage <span className="text-gold-400">@</span> Hamilton
            </Link>
          </div>

          {/* Right: text size toggle + user + sign out */}
          <div className="flex items-center gap-4">
            {/* Text size toggle */}
            <div className="flex items-center gap-1 bg-brand-700 rounded-full px-2 py-1">
              {Object.entries(textSizes).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTextSize(key)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    textSize === key
                      ? 'bg-gold-400 text-brand-900'
                      : 'text-brand-300 hover:text-white'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>

            <span className="text-brand-300 text-sm hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm bg-brand-700 hover:bg-brand-600 px-4 py-1.5 rounded-full transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex pt-14">

        {/* Sidebar */}
        <aside className={`fixed top-14 left-0 bottom-0 z-40 bg-brand-900 text-white transition-all duration-200 ${sidebarOpen ? 'w-52' : 'w-0 overflow-hidden'}`}>
          <nav className="p-3 space-y-1">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-gold-500 text-brand-900'
                    : 'text-brand-300 hover:bg-brand-700 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className={`flex-1 min-h-screen transition-all duration-200 ${sidebarOpen ? 'ml-52' : 'ml-0'}`}>
          <div className="max-w-5xl mx-auto px-6 py-8">
            {children}
          </div>
          <footer className="text-center text-brand-400 text-xs py-6 mt-8 border-t border-brand-200">
            © {new Date().getFullYear()} Vintage @ Hamilton Community · Hamilton, NJ
          </footer>
        </main>
      </div>
    </div>
  )
}
