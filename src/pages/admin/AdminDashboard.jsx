import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export default function AdminDashboard() {
  const toast = useToast()
  const [stats, setStats] = useState({ residents: 0, active: 0, admins: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [{ count: residents, error: e1 }, { count: active, error: e2 }, { count: admins, error: e3 }] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('admin_roles').select('*', { count: 'exact', head: true }).eq('is_active', true),
        ])
        if (e1 || e2 || e3) throw e1 || e2 || e3
        setStats({ residents: residents ?? 0, active: active ?? 0, admins: admins ?? 0 })
      } catch (e) {
        toast.error('Failed to load dashboard stats: ' + e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const cards = [
    { label: 'Total Residents', value: stats.residents, icon: '👥', path: '/admin/residents' },
    { label: 'Active Residents', value: stats.active, icon: '✅', path: '/admin/residents' },
    { label: 'Administrators', value: stats.admins, icon: '🔑', path: '/admin/residents' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-brand-800 mb-1">Admin Dashboard</h1>
        <p className="text-brand-500">Manage residents, access, and community settings.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(card => (
          <Link key={card.label} to={card.path}
            className="bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all p-6">
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="font-display text-4xl font-bold text-brand-800 mb-1">
              {loading ? <span className="animate-pulse">…</span> : card.value}
            </div>
            <div className="text-brand-500 text-sm">{card.label}</div>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="font-display text-xl text-brand-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/admin/residents?action=invite"
            className="flex items-center gap-4 bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all p-5">
            <span className="text-2xl">✉️</span>
            <div>
              <div className="font-semibold text-brand-800">Invite Resident</div>
              <div className="text-sm text-brand-500">Send an email invitation</div>
            </div>
          </Link>
          <Link to="/admin/residents?action=create"
            className="flex items-center gap-4 bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all p-5">
            <span className="text-2xl">➕</span>
            <div>
              <div className="font-semibold text-brand-800">Create Account</div>
              <div className="text-sm text-brand-500">Set up with a temporary password</div>
            </div>
          </Link>
          <Link to="/admin/access"
            className="flex items-center gap-4 bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all p-5">
            <span className="text-2xl">🔐</span>
            <div>
              <div className="font-semibold text-brand-800">Manage App Access</div>
              <div className="text-sm text-brand-500">Control which apps residents can use</div>
            </div>
          </Link>
          <Link to="/admin/residents"
            className="flex items-center gap-4 bg-white rounded-2xl border-2 border-brand-100 hover:border-gold-400 hover:shadow-md transition-all p-5">
            <span className="text-2xl">📋</span>
            <div>
              <div className="font-semibent text-brand-800">View All Residents</div>
              <div className="text-sm text-brand-500">Browse and manage resident accounts</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
