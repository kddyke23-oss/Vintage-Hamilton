import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

const APPS = [
  { id: 'directory', label: 'Resident Directory', icon: '👥' },
  { id: 'calendar',  label: 'Social Calendar',    icon: '📅' },
  { id: 'lotto',     label: 'Lotto Tracker',       icon: '🎟️' },
  { id: 'blog',      label: 'Community Blog',      icon: '📝' },
]

export default function AccessPage() {
  const toast = useToast()
  const [residents, setResidents] = useState([])
  const [access, setAccess] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  const fetchAll = async () => {
    try {
      const [{ data: profiles, error: pError }, { data: accessRows, error: aError }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, unit_number').eq('is_active', true).order('full_name'),
        supabase.from('app_access').select('user_id, app_id'),
      ])
      if (pError) throw pError
      if (aError) throw aError
      const map = {}
      profiles?.forEach(p => { map[p.id] = new Set() })
      accessRows?.forEach(r => { map[r.user_id]?.add(r.app_id) })
      setResidents(profiles ?? [])
      setAccess(map)
    } catch (e) {
      toast.error('Failed to load access data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const toggleAccess = async (userId, appId, currentlyHas, name) => {
    setSaving(`${userId}-${appId}`)
    try {
      if (currentlyHas) {
        const { error } = await supabase.from('app_access').delete()
          .eq('user_id', userId).eq('app_id', appId)
        if (error) throw error
        toast.info(`${APPS.find(a => a.id === appId)?.label} access removed for ${name}`)
      } else {
        const { error } = await supabase.from('app_access').insert({ user_id: userId, app_id: appId })
        if (error) throw error
        toast.success(`${APPS.find(a => a.id === appId)?.label} access granted to ${name}`)
      }
      setAccess(prev => {
        const updated = { ...prev, [userId]: new Set(prev[userId]) }
        currentlyHas ? updated[userId].delete(appId) : updated[userId].add(appId)
        return updated
      })
    } catch (e) {
      toast.error('Failed to update access: ' + e.message)
    }
    setSaving(null)
  }

  const grantAll = async (userId, name) => {
    try {
      const inserts = APPS.filter(a => !access[userId]?.has(a.id)).map(a => ({ user_id: userId, app_id: a.id }))
      if (inserts.length) {
        const { error } = await supabase.from('app_access').insert(inserts)
        if (error) throw error
        setAccess(prev => ({ ...prev, [userId]: new Set(APPS.map(a => a.id)) }))
        toast.success(`All apps granted to ${name}`)
      } else {
        toast.info(`${name} already has access to all apps`)
      }
    } catch (e) {
      toast.error('Failed to grant all access: ' + e.message)
    }
  }

  const revokeAll = async (userId, name) => {
    try {
      const { error } = await supabase.from('app_access').delete().eq('user_id', userId)
      if (error) throw error
      setAccess(prev => ({ ...prev, [userId]: new Set() }))
      toast.info(`All app access removed for ${name}`)
    } catch (e) {
      toast.error('Failed to revoke access: ' + e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-brand-800 mb-1">App Access</h1>
        <p className="text-brand-500">Control which apps each resident can access.</p>
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
              {residents.map(r => (
                <tr key={r.id} className="hover:bg-brand-50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="font-medium text-brand-800">{r.full_name || '—'}</div>
                    <div className="text-brand-400 text-xs">{r.email}</div>
                  </td>
                  {APPS.map(app => {
                    const has = access[r.id]?.has(app.id)
                    const key = `${r.id}-${app.id}`
                    return (
                      <td key={app.id} className="text-center px-4 py-3">
                        <button
                          onClick={() => toggleAccess(r.id, app.id, has, r.full_name)}
                          disabled={saving === key}
                          className={`w-8 h-8 rounded-full text-lg transition-all ${
                            saving === key ? 'opacity-50 cursor-wait' :
                            has ? 'bg-green-100 hover:bg-red-100' : 'bg-brand-100 hover:bg-green-100'
                          }`}
                          title={has ? 'Click to revoke' : 'Click to grant'}
                        >
                          {saving === key ? '…' : has ? '✅' : '○'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="text-center px-4 py-3">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => grantAll(r.id, r.full_name)}
                        className="text-xs text-green-600 hover:text-green-800 underline">All</button>
                      <span className="text-brand-300">|</span>
                      <button onClick={() => revokeAll(r.id, r.full_name)}
                        className="text-xs text-red-500 hover:text-red-700 underline">None</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
