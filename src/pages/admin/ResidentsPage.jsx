import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export default function ResidentsPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [residents, setResidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(searchParams.get('action') || null)
  const [form, setForm] = useState({ full_name: '', email: '', unit_number: '', phone: '', password: '' })
  const [editTarget, setEditTarget] = useState(null)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)

  const fetchResidents = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name')
      if (error) throw error
      setResidents(profiles ?? [])
    } catch (e) {
      toast.error('Failed to load residents: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchResidents() }, [])

  const callEdgeFunction = async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No active session — please sign in again')
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      }
    )
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Something went wrong')
    return result
  }

  const handleInvite = async () => {
    if (!form.email) { setFormError('Email is required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      await callEdgeFunction({ mode: 'invite', email: form.email, full_name: form.full_name })
      setFormSuccess(`Invitation sent to ${form.email}`)
      toast.success(`Invitation sent to ${form.email}`)
      setForm({ full_name: '', email: '', unit_number: '', phone: '', password: '' })
      fetchResidents()
    } catch (e) {
      setFormError(e.message)
      toast.error('Invite failed: ' + e.message)
    }
    setSubmitting(false)
  }

  const handleCreate = async () => {
    if (!form.email) { setFormError('Email is required'); return }
    if (!form.password) { setFormError('Temporary password is required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      await callEdgeFunction({
        mode: 'create',
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        unit_number: form.unit_number,
        phone: form.phone,
      })
      setFormSuccess(`Account created for ${form.email}`)
      toast.success(`Account created for ${form.email}`)
      setForm({ full_name: '', email: '', unit_number: '', phone: '', password: '' })
      fetchResidents()
    } catch (e) {
      setFormError(e.message)
      toast.error('Create failed: ' + e.message)
    }
    setSubmitting(false)
  }

  const handleEdit = async () => {
    if (!form.full_name) { setFormError('Full name is required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: form.full_name,
        phone: form.phone,
        unit_number: form.unit_number,
      }).eq('id', editTarget.id)
      if (error) throw error
      setFormSuccess('Resident updated successfully')
      toast.success(`${form.full_name} updated successfully`)
      fetchResidents()
    } catch (e) {
      setFormError(e.message)
      toast.error('Update failed: ' + e.message)
    }
    setSubmitting(false)
  }

  const openEdit = (resident) => {
    setEditTarget(resident)
    setForm({
      full_name: resident.full_name || '',
      email: resident.email || '',
      unit_number: resident.unit_number || '',
      phone: resident.phone || '',
      password: '',
    })
    setFormError(null)
    setFormSuccess(null)
    setModal('edit')
  }

  const handleDeactivate = async (id, current, name) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !current }).eq('id', id)
      if (error) throw error
      toast.success(`${name || 'Resident'} ${current ? 'deactivated' : 'activated'}`)
      fetchResidents()
    } catch (e) {
      toast.error('Failed to update status: ' + e.message)
    }
  }

  const handleToggleAdmin = async (userId, isCurrentlyAdmin, name) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !isCurrentlyAdmin })
        .eq('id', userId)
      if (error) throw error
      toast.success(`${name || 'Resident'} ${isCurrentlyAdmin ? 'removed as admin' : 'is now an admin'}`)
      fetchResidents()
    } catch (e) {
      toast.error('Failed to update admin role: ' + e.message)
    }
  }

  const handlePasswordReset = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      toast.success(`Password reset email sent to ${email}`)
    } catch (e) {
      toast.error('Failed to send reset email: ' + e.message)
    }
    setResetTarget(null)
  }

  const closeModal = () => {
    setModal(null)
    setEditTarget(null)
    setFormError(null)
    setFormSuccess(null)
    setForm({ full_name: '', email: '', unit_number: '', phone: '', password: '' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-800 mb-1">Residents</h1>
          <p className="text-brand-500">{residents.length} registered residents</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('invite')}
            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            ✉️ Invite
          </button>
          <button onClick={() => setModal('create')}
            className="bg-gold-500 hover:bg-gold-400 text-brand-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            ➕ Create Account
          </button>
        </div>
      </div>

      {/* Residents table */}
      <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-400 animate-pulse">Loading residents…</div>
        ) : residents.length === 0 ? (
          <div className="p-8 text-center text-brand-400">No residents yet. Invite or create the first one!</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-brand-50 border-b border-brand-100">
              <tr>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Name</th>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Email</th>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Unit</th>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Phone</th>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Status</th>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Admin</th>
                <th className="text-left px-6 py-3 text-brand-600 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {residents.map(r => (
                <tr key={r.id} className="hover:bg-brand-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-brand-800">{r.full_name || '—'}</td>
                  <td className="px-6 py-3 text-brand-600">{r.email}</td>
                  <td className="px-6 py-3 text-brand-500">{r.unit_number || '—'}</td>
                  <td className="px-6 py-3 text-brand-500">{r.phone || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => handleToggleAdmin(r.id, r.is_admin, r.full_name)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        r.is_admin
                          ? 'bg-gold-100 text-gold-700 hover:bg-red-100 hover:text-red-600'
                          : 'bg-brand-100 text-brand-500 hover:bg-gold-100 hover:text-gold-700'
                      }`}
                      title={r.is_admin ? 'Click to remove admin' : 'Click to make admin'}
                    >
                      {r.is_admin ? '⭐ Admin' : '+ Admin'}
                    </button>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(r)}
                        className="text-brand-400 hover:text-brand-700 text-xs underline">Edit</button>
                      <button onClick={() => setResetTarget(r)}
                        className="text-brand-400 hover:text-brand-700 text-xs underline">Reset PWD</button>
                      <button onClick={() => handleDeactivate(r.id, r.is_active, r.full_name)}
                        className="text-brand-400 hover:text-brand-700 text-xs underline">
                        {r.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite / Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-display text-xl text-brand-800 mb-4">
              {modal === 'invite' ? '✉️ Invite Resident' : modal === 'create' ? '➕ Create Account' : '✏️ Edit Resident'}
            </h2>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm mb-4 flex items-center gap-2">
                <span>❌</span> {formError}
              </div>
            )}
            {formSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm mb-4 flex items-center gap-2">
                <span>✅</span> {formSuccess}
              </div>
            )}

            <div className="space-y-3">
              <input placeholder="Full Name" value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <input placeholder="Email Address" type="email" value={form.email}
                disabled={modal === 'edit'}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-brand-50 disabled:text-brand-400" />
              <input placeholder="Unit Number (optional)" value={form.unit_number}
                onChange={e => setForm(f => ({ ...f, unit_number: e.target.value }))}
                className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <input placeholder="Phone (optional)" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              {modal === 'create' && (
                <input placeholder="Temporary Password" type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={closeModal}
                className="flex-1 border border-brand-200 text-brand-600 rounded-lg py-2.5 text-sm hover:bg-brand-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={modal === 'invite' ? handleInvite : modal === 'create' ? handleCreate : handleEdit}
                disabled={submitting}
                className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                {submitting ? 'Please wait…' :
                  modal === 'invite' ? 'Send Invitation' :
                  modal === 'create' ? 'Create Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Confirmation */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">🔑</div>
            <h2 className="font-display text-xl text-brand-800 mb-2">Reset Password?</h2>
            <p className="text-brand-500 text-sm mb-5">
              A password reset email will be sent to <strong>{resetTarget.email}</strong>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)}
                className="flex-1 border border-brand-200 text-brand-600 rounded-lg py-2.5 text-sm hover:bg-brand-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handlePasswordReset(resetTarget.email)}
                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                Send Reset Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
