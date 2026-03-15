import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const navItems = [
  { label: 'Home',            path: '/' },
  { label: 'Directory',       path: '/apps/directory' },
  { label: 'Calendar',        path: '/apps/calendar' },
  { label: 'Lotto',           path: '/apps/lotto' },
  { label: 'Blog',            path: '/apps/blog' },
  { label: 'Recommendations', path: '/apps/recommendations' },
  { label: 'Help',            path: '/help' },
]

const textSizes = {
  normal: { label: 'A',   class: 'text-base' },
  large:  { label: 'A+',  class: 'text-lg' },
  xlarge: { label: 'A++', class: 'text-xl' },
}

export default function AppShell({ children }) {
  const { user, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [textSize, setTextSize] = useState('normal')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [location.pathname])

  // On first load, default mobile to closed, desktop to open
  useEffect(() => {
    setSidebarOpen(window.innerWidth >= 768)
  }, [])

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

            {/* Sign Out button with always-visible reminder */}
            <div className="flex flex-col items-center gap-0.5">
              <button
                onClick={handleSignOut}
                className="text-sm bg-brand-700 hover:bg-brand-600 px-4 py-1.5 rounded-full transition-colors"
              >
                Sign Out
              </button>
              <span className="text-gold-400 text-xs hidden sm:block">
                Please sign out when done
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile backdrop — tapping it closes the sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Body: sidebar + content */}
      <div className="flex pt-14">

        {/* Sidebar
            - Mobile: fixed overlay, full width up to w-52, sits above content (z-40)
            - Desktop: fixed sidebar that pushes content via ml-52 on main
        */}
        <aside className={`
          fixed top-14 left-0 bottom-0 z-40 bg-brand-900 text-white
          transition-all duration-200
          ${sidebarOpen ? 'w-52' : 'w-0 overflow-hidden'}
        `}>
          <nav className="p-3 w-52 flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
            <div className="space-y-1 flex-1">
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
            </div>

            {/* Admin link — super admins only */}
            {isAdmin && (
              <div className="pt-3 mt-3 border-t border-brand-700">
                <Link
                  to="/admin"
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-gold-500 text-brand-900'
                      : 'text-brand-400 hover:bg-brand-700 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Admin
                </Link>
              </div>
            )}
          </nav>
        </aside>

        {/* Main content
            - Mobile: no left margin (sidebar overlays)
            - Desktop: ml-52 when sidebar open, ml-0 when closed
        */}
        <main className={`
          flex-1 min-h-screen transition-all duration-200
          ${sidebarOpen ? 'md:ml-52' : 'ml-0'}
        `}>
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
