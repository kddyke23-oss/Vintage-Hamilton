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

export default function AccessPage() {
  const toast = useToast()
  const [residents, setResidents] = useState([])
  const [access, setAccess] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [linking, setLinking] = useState(null)

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

      // Build access map — keyed on auth id for linked residents,
      // and on resident_id (as string) for unlinked ones
      const map = {}
      profiles?.forEach(p => {
        const key = p.id || `unlinked-${p.resident_id}`
        map[key] = {}
        APPS.forEach(a => { map[key][a.id] = 'none' })
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

  // Attempt to find the auth UUID for an unlinked resident by email,
  // update their profiles row, and return the new auth id.
  const tryLinkAccount = async (resident) => {
    const email = displayEmail(resident)
    if (!email || email === '—') {
      toast.error('No email address on record for this resident')
      return null
    }
    setLinking(resident.resident_id)
    try {
      // Use the admin lookup edge function (or RPC) to find auth user by email
      const { data, error } = await supabase.rpc('get_auth_id_by_email', { lookup_email: email })
      if (error) throw error
      if (!data) {
        toast.info(`No Supabase Auth account found for ${email} — they may not have accepted their invite yet`)
        return null
      }
      // Link the auth id back to the profiles row
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ id: data })
        .eq('resident_id', resident.resident_id)
      if (updateError) throw updateError

      toast.success(`Account linked for ${displayName(resident)}`)
      await fetchAll()
      return data
    } catch (e) {
      toast.error('Link failed: ' + e.message)
      return null
    } finally {
      setLinking(null)
    }
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-brand-500 flex-wrap">
        <span className="font-medium">Click to cycle:</span>
        {Object.entries(STATE_DISPLAY).map(([state, { icon, label }]) => (
          <span key={state} className="flex items-center gap-1">
            <span>{icon}</span> {label}
          </span>
        ))}
        <span className="ml-4 text-brand-300">|</span>
        <span className="flex items-center gap-1 text-brand-400 italic text-xs">
          🔗 Invited but not yet logged in — click "Link" to connect their account
        </span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400 animate-pulse">Loading…</div>
      ) : residents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">No active residents found.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-brand-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 border-b border-brand-100">
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
              {residents.map(r => {
                const hasAccount = !!r.id
                const mapKey = r.id || `unlinked-${r.resident_id}`
                const name = displayName(r)
                const isLinking = linking === r.resident_id
                return (
                  <tr key={r.resident_id} className={`transition-colors ${hasAccount ? 'hover:bg-brand-50' : 'bg-amber-50/40'}`}>
                    <td className="px-6 py-3">
                      <div className="font-medium text-brand-800 flex items-center gap-2">
                        {name}
                        {!hasAccount && (
                          <button
                            onClick={() => tryLinkAccount(r)}
                            disabled={isLinking}
                            className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-200 px-2 py-0.5 rounded-full font-normal transition-colors disabled:opacity-50"
                          >
                            {isLinking ? 'Linking…' : '🔗 Link'}
                          </button>
                        )}
                      </div>
                      <div className="text-brand-400 text-xs">{displayEmail(r)}</div>
                      {!hasAccount && (
                        <div className="text-amber-500 text-xs mt-0.5">Invited — awaiting first login</div>
                      )}
                    </td>
                    {APPS.map(app => {
                      const state = access[mapKey]?.[app.id] ?? 'none'
                      const key = `${mapKey}-${app.id}`
                      const display = STATE_DISPLAY[state]
                      // Toggles are locked only if there's truly no auth id AND no way to get one
                      const isLocked = !hasAccount
                      return (
                        <td key={app.id} className="text-center px-4 py-3">
                          <button
                            onClick={() => isLocked
                              ? toast.info(`Link ${name}'s account first using the "Link" button`)
                              : cycleAccess(r.id, app.id, state, name)
                            }
                            disabled={saving === key}
                            className={`w-8 h-8 rounded-full text-base transition-all ${
                              isLocked ? 'bg-amber-50 text-amber-300 cursor-pointer' :
                              saving === key ? 'opacity-50 cursor-wait' :
                              display.className
                            }`}
                            title={isLocked ? `Link ${name}'s account first` : `${name}: ${display.label} — click to change`}
                          >
                            {saving === key ? '…' : isLocked ? '🔗' : display.icon}
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
                        <span className="text-xs text-amber-400">Link first</span>
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
