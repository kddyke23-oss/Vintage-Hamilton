import { useEffect, useState, useRef } from 'react'
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

// Filter options per column
const COLUMN_FILTER_OPTIONS = [
  { value: 'all',   label: 'All' },
  { value: 'user',  label: '✅ User' },
  { value: 'admin', label: '⭐ Admin' },
  { value: 'any',   label: '✅⭐ Any Access' },
  { value: 'none',  label: '○ No Access' },
]

// ─── Column Filter Dropdown ───────────────────────────────────────────────────
function ColumnFilterDropdown({ appId, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isActive = value !== 'all'

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        title={isActive ? `Filtered: ${COLUMN_FILTER_OPTIONS.find(o => o.value === value)?.label}` : 'Filter this column'}
        className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs transition-all ${
          isActive
            ? 'bg-brand-700 text-white'
            : 'bg-brand-100 text-brand-400 hover:bg-brand-200 hover:text-brand-600'
        }`}
      >
        ▾
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-brand-200 rounded-lg shadow-lg z-50 min-w-[145px] py-1 text-left">
          {COLUMN_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(appId, opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                value === opt.value
                  ? 'bg-brand-700 text-white font-medium'
                  : 'text-brand-700 hover:bg-brand-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AccessPage() {
  const toast = useToast()
  const [residents, setResidents] = useState([])
  const [access, setAccess] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  // Per-column filters: { directory: 'all', calendar: 'all', lotto: 'all', blog: 'all' }
  const [colFilters, setColFilters] = useState(
    Object.fromEntries(APPS.map(a => [a.id, 'all']))
  )

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

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const hasActiveFilters = Object.values(colFilters).some(v => v !== 'all')

  const filteredResidents = residents.filter(r => {
    return APPS.every(app => {
      const filterVal = colFilters[app.id]
      if (filterVal === 'all') return true
      const state = r.id ? (access[r.id]?.[app.id] ?? 'none') : 'none'
      if (filterVal === 'any') return state !== 'none'
      return state === filterVal
    })
  })

  const setColFilter = (appId, value) => {
    setColFilters(prev => ({ ...prev, [appId]: value }))
  }

  const clearAllFilters = () => {
    setColFilters(Object.fromEntries(APPS.map(a => [a.id, 'all'])))
  }

  // ── Access mutations ──────────────────────────────────────────────────────────
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

  const displayName  = (r) => r.full_name || [r.surname, r.names].filter(Boolean).join(' ') || '—'
  const displayEmail = (r) => r.email || r.emails?.[0] || '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-brand-800 mb-1">App Access</h1>
        <p className="text-brand-500">Control which apps each resident can access and their role.</p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-brand-500 flex-wrap">
        <span className="font-medium">Click icons to cycle:</span>
        {Object.entries(STATE_DISPLAY).map(([state, { icon, label }]) => (
          <span key={state} className="flex items-center gap-1">
            <span>{icon}</span> {label}
          </span>
        ))}
        <span className="ml-2 text-brand-300">|</span>
        <span className="flex items-center gap-1 text-brand-400 italic text-xs">
          🔒 No account yet — access unlocks after first login
        </span>
        <span className="text-brand-300">|</span>
        <span className="flex items-center gap-1 text-brand-400 italic text-xs">
          ▾ Click to filter a column
        </span>
      </div>

      {/* Active filter banner */}
      {hasActiveFilters && (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2.5 text-sm flex-wrap">
          <span className="font-semibold text-brand-700">Filters active:</span>
          {APPS.filter(a => colFilters[a.id] !== 'all').map(a => (
            <span key={a.id} className="inline-flex items-center gap-1.5 bg-brand-700 text-white text-xs px-2.5 py-1 rounded-full font-medium">
              {a.icon} {a.label}
              <span className="opacity-60">→</span>
              {COLUMN_FILTER_OPTIONS.find(o => o.value === colFilters[a.id])?.label}
              <button
                onClick={() => setColFilter(a.id, 'all')}
                className="ml-0.5 opacity-70 hover:opacity-100 font-bold leading-none"
                title={`Remove ${a.label} filter`}
              >×</button>
            </span>
          ))}
          <span className="text-brand-500">
            Showing <span className="font-semibold text-brand-700">{filteredResidents.length}</span> of {residents.length} residents
          </span>
          <button
            onClick={clearAllFilters}
            className="ml-auto text-xs text-red-500 hover:text-red-700 underline font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400 animate-pulse">Loading…</div>
      ) : residents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">No active residents found.</div>
      ) : filteredResidents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">
          No residents match the current filters.{' '}
          <button onClick={clearAllFilters} className="text-brand-600 underline">Clear filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-brand-100 overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 border-b border-brand-100 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Resident</th>
                {APPS.map(app => {
                  const isFiltered = colFilters[app.id] !== 'all'
                  return (
                    <th
                      key={app.id}
                      className={`text-center px-4 py-3 text-brand-600 font-semibold transition-colors ${isFiltered ? 'bg-brand-100' : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div>{app.icon}</div>
                        <div className="text-xs font-normal">{app.label}</div>
                        <ColumnFilterDropdown
                          appId={app.id}
                          value={colFilters[app.id]}
                          onChange={setColFilter}
                        />
                      </div>
                    </th>
                  )
                })}
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
                      const isFiltered = colFilters[app.id] !== 'all'
                      return (
                        <td key={app.id} className={`text-center px-4 py-3 transition-colors ${isFiltered ? 'bg-brand-50' : ''}`}>
                          <button
                            onClick={() => hasAccount
                              ? cycleAccess(r.id, app.id, state, name)
                              : toast.info(`${name} hasn't logged in yet — access will unlock after their first login`)
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
