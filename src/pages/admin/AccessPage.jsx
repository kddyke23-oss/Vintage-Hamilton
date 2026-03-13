import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

const APPS = [
  { id: 'directory', label: 'Resident Directory', icon: '👥' },
  { id: 'calendar',  label: 'Social Calendar',    icon: '📅' },
  { id: 'lotto',     label: 'Lotto Tracker',       icon: '🎟️' },
  { id: 'blog',      label: 'Community Blog',      icon: '📝' },
]

// Cycle: none → user → admin → none
const NEXT_STATE = { none: 'user', user: 'admin', admin: 'none' }

const STATE_DISPLAY = {
  none:  { icon: '○',  label: 'No Access', className: 'bg-brand-100 text-brand-400 hover:bg-blue-50 hover:text-blue-500' },
  user:  { icon: '✅', label: 'User',      className: 'bg-green-100 text-green-700 hover:bg-gold-100 hover:text-gold-700' },
  admin: { icon: '⭐', label: 'Admin',     className: 'bg-yellow-100 text-yellow-700 hover:bg-red-50 hover:text-red-500' },
}

// Filter options: one per app + admin role + all
const FILTER_OPTIONS = [
  { id: 'all',       label: 'All Residents', icon: '👤' },
  { id: 'directory', label: 'Directory',     icon: '👥' },
  { id: 'calendar',  label: 'Calendar',      icon: '📅' },
  { id: 'lotto',     label: 'Lotto',         icon: '🎟️' },
  { id: 'blog',      label: 'Blog',          icon: '📝' },
  { id: 'admin',     label: 'Any Admin',     icon: '⭐' },
  { id: 'none',      label: 'No Access',     icon: '○'  },
]

export default function AccessPage() {
  const toast = useToast()
  const [residents, setResidents] = useState([])
  const [access, setAccess] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')

  const fetchAll = async () => {
    try {
      const [{ data: profiles, error: pError }, { data: accessRows, error: aError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, resident_id, full_name, surname, names, email, emails, unit_number')
          .eq('is_active', true)
          .order('surname'),
        supabase.from('app_access').select('user_id, app_id, role'),
      ])
      if (pError) throw pError
      if (aError) throw aError

      // Build access map keyed on auth id (linked residents only)
      const map = {}
      profiles?.forEach(p => {
        if (p.id) {
          map[p.id] = {}
          APPS.forEach(a => { map[p.id][a.id] = 'none' })
        }
      })
      accessRows?.forEach(r => {
        if (map[r.user_id]) map[r.user_id][r.app_id] = r.role || 'user'
      })

      setResidents(profiles ?? [])
      setAccess(map)
    } catch (e) {
      toast.error('Failed to load access data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // ── Filtering logic ──────────────────────────────────────────────────────────
  const filteredResidents = residents.filter(r => {
    if (activeFilter === 'all') return true
    if (!r.id) return activeFilter === 'none'
    const userAccess = access[r.id] ?? {}
    if (activeFilter === 'none') {
      return Object.values(userAccess).every(v => v === 'none')
    }
    if (activeFilter === 'admin') {
      return Object.values(userAccess).some(v => v === 'admin')
    }
    // specific app — show anyone with user or admin access to that app
    return userAccess[activeFilter] && userAccess[activeFilter] !== 'none'
  })

  const getFilterCount = (filterId) => {
    if (filterId === 'all') return residents.length
    return residents.filter(r => {
      if (!r.id) return filterId === 'none'
      const userAccess = access[r.id] ?? {}
      if (filterId === 'none') return Object.values(userAccess).every(v => v === 'none')
      if (filterId === 'admin') return Object.values(userAccess).some(v => v === 'admin')
      return userAccess[filterId] && userAccess[filterId] !== 'none'
    }).length
  }

  const cycleAccess = async (userId, appId, currentState, name) => {
    if (!userId) return
    const nextState = NEXT_STATE[currentState]
    const appLabel = APPS.find(a => a.id === appId)?.label
    setSaving(`${userId}-${appId}`)
    try {
      if (nextState === 'none') {
        const { error } = await supabase.from('app_access').delete()
          .eq('user_id', userId).eq('app_id', appId)
        if (error) throw error
        toast.info(`${appLabel} access removed for ${name}`)
      } else if (currentState === 'none') {
        const { error } = await supabase.from('app_access')
          .insert({ user_id: userId, app_id: appId, role: nextState })
        if (error) throw error
        toast.success(`${appLabel} ${nextState} access granted to ${name}`)
      } else {
        const { error } = await supabase.from('app_access')
          .update({ role: nextState })
          .eq('user_id', userId).eq('app_id', appId)
        if (error) throw error
        toast.success(`${name} is now ${nextState === 'admin' ? 'an admin' : 'a user'} for ${appLabel}`)
      }

      setAccess(prev => ({
        ...prev,
        [userId]: { ...prev[userId], [appId]: nextState }
      }))
    } catch (e) {
      toast.error('Failed to update access: ' + e.message)
    }
    setSaving(null)
  }

  const grantAll = async (userId, name) => {
    if (!userId) return
    try {
      const toInsert = APPS
        .filter(a => access[userId]?.[a.id] === 'none')
        .map(a => ({ user_id: userId, app_id: a.id, role: 'user' }))
      if (toInsert.length) {
        const { error } = await supabase.from('app_access').insert(toInsert)
        if (error) throw error
        setAccess(prev => {
          const updated = { ...prev[userId] }
          APPS.forEach(a => { if (updated[a.id] === 'none') updated[a.id] = 'user' })
          return { ...prev, [userId]: updated }
        })
        toast.success(`All apps granted to ${name}`)
      } else {
        toast.info(`${name} already has access to all apps`)
      }
    } catch (e) {
      toast.error('Failed to grant all access: ' + e.message)
    }
  }

  const revokeAll = async (userId, name) => {
    if (!userId) return
    try {
      const { error } = await supabase.from('app_access').delete().eq('user_id', userId)
      if (error) throw error
      setAccess(prev => {
        const updated = {}
        APPS.forEach(a => { updated[a.id] = 'none' })
        return { ...prev, [userId]: updated }
      })
      toast.info(`All app access removed for ${name}`)
    } catch (e) {
      toast.error('Failed to revoke access: ' + e.message)
    }
  }

  const displayName = (r) => r.full_name || [r.surname, r.names].filter(Boolean).join(' ') || '—'
  const displayEmail = (r) => r.email || r.emails?.[0] || '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-brand-800 mb-1">App Access</h1>
        <p className="text-brand-500">Control which apps each resident can access and their role.</p>
      </div>

      {/* ── Quick-filter buttons ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm font-medium text-brand-500 mr-1">Show:</span>
        {FILTER_OPTIONS.map(opt => {
          const count = loading ? null : getFilterCount(opt.id)
          const isActive = activeFilter === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => setActiveFilter(opt.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                isActive
                  ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                  : 'bg-white text-brand-600 border-brand-200 hover:border-brand-400 hover:bg-brand-50'
              }`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
              {count !== null && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
        {activeFilter !== 'all' && (
          <button
            onClick={() => setActiveFilter('all')}
            className="text-xs text-brand-400 hover:text-brand-600 underline ml-1"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-brand-500 flex-wrap">
        <span className="font-medium">Click icons to cycle:</span>
        {Object.entries(STATE_DISPLAY).map(([state, { icon, label }]) => (
          <span key={state} className="flex items-center gap-1">
            <span>{icon}</span> {label}
          </span>
        ))}
        <span className="ml-4 text-brand-300">|</span>
        <span className="flex items-center gap-1 text-brand-400 italic text-xs">
          🔒 No account yet — access unlocks automatically after first login
        </span>
      </div>

      {/* Result count when filtered */}
      {activeFilter !== 'all' && !loading && (
        <p className="text-sm text-brand-500">
          Showing <span className="font-semibold text-brand-700">{filteredResidents.length}</span> of {residents.length} residents
          {' '}— filtered by <span className="font-semibold">{FILTER_OPTIONS.find(f => f.id === activeFilter)?.label}</span>
        </p>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400 animate-pulse">Loading…</div>
      ) : residents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">No active residents found.</div>
      ) : filteredResidents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">
          No residents match this filter.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-brand-100 overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 border-b border-brand-100 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Resident</th>
                {APPS.map(app => (
                  <th key={app.id} className="text-center px-4 py-3 text-brand-600 font-semibold">
                    <div>{app.icon}</div>
                    <div className="text-xs font-normal">{app.label}</div>
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-brand-600 font-semibold">Bulk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {filteredResidents.map(r => {
                const hasAccount = !!r.id
                const name = displayName(r)
                return (
                  <tr key={r.resident_id} className={`transition-colors ${hasAccount ? 'hover:bg-brand-50' : 'bg-gray-50 opacity-60'}`}>
                    <td className="px-6 py-3">
                      <div className="font-medium text-brand-800 flex items-center gap-2">
                        {name}
                        {!hasAccount && <span className="text-xs text-brand-300 font-normal">🔒 awaiting first login</span>}
                      </div>
                      <div className="text-brand-400 text-xs">{displayEmail(r)}</div>
                    </td>
                    {APPS.map(app => {
                      const state = hasAccount ? (access[r.id]?.[app.id] ?? 'none') : 'none'
                      const key = `${r.id}-${app.id}`
                      const display = STATE_DISPLAY[state]
                      return (
                        <td key={app.id} className="text-center px-4 py-3">
                          <button
                            onClick={() => hasAccount
                              ? cycleAccess(r.id, app.id, state, name)
                              : toast.info(`${name} hasn't logged in yet — access will unlock automatically after their first login`)
                            }
                            disabled={saving === key}
                            className={`w-8 h-8 rounded-full text-base transition-all ${
                              !hasAccount ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                              saving === key ? 'opacity-50 cursor-wait' :
                              display.className
                            }`}
                            title={!hasAccount ? 'Awaiting first login' : `${name}: ${display.label} — click to change`}
                          >
                            {saving === key ? '…' : hasAccount ? display.icon : '🔒'}
                          </button>
                        </td>
                      )
                    })}
                    <td className="text-center px-4 py-3">
                      {hasAccount ? (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => grantAll(r.id, name)}
                            className="text-xs text-green-600 hover:text-green-800 underline">All</button>
                          <span className="text-brand-300">|</span>
                          <button onClick={() => revokeAll(r.id, name)}
                            className="text-xs text-red-500 hover:text-red-700 underline">None</button>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
