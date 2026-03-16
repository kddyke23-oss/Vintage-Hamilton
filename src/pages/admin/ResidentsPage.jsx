import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useImageUpload } from '@/hooks/useImageUpload'

// Derive initials from surname + names for avatar circle
function getInitials(surname, names) {
  const first = names?.trim().split(' ')[0]?.[0] || ''
  const last  = surname?.trim()[0] || ''
  return (first + last).toUpperCase() || '?'
}

// Delete a file from Supabase Storage by its public URL
async function deleteStoragePhoto(photoUrl, bucket) {
  if (!photoUrl) return
  try {
    const marker = `/object/public/${bucket}/`
    const idx = photoUrl.indexOf(marker)
    if (idx === -1) return
    await supabase.storage.from(bucket).remove([photoUrl.slice(idx + marker.length)])
  } catch {}
}

const EMPTY_FORM = {
  surname: '',
  names: '',
  email: '',
  address: '',
  phone: '',
  password: '',
  directory_visible: true,
  sendInvite: true,
}

export default function ResidentsPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [residents, setResidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(searchParams.get('action') || null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editTarget, setEditTarget] = useState(null)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)

  // Avatar photo upload (edit modal)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const avatarInputRef = useRef(null)
  const { uploading: avatarUploading, error: avatarUploadError, uploadImage: uploadAvatar } = useImageUpload({
    bucket: 'avatars',
    maxDimension: 400,
  })

  const fetchResidents = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, resident_id, surname, names, emails, phones, address, directory_visible, is_active, is_admin, photo_url')
        .order('surname')
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

  // ── Invite only (for existing directory residents with no account) ────────────
  const handleInvite = async () => {
    if (!form.email) { setFormError('Email is required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      await callEdgeFunction({ mode: 'invite', email: form.email })
      setFormSuccess(`Invitation sent to ${form.email}`)
      toast.success(`Invitation sent to ${form.email}`)
      setForm(EMPTY_FORM)
      fetchResidents()
    } catch (e) {
      setFormError(e.message)
      toast.error('Invite failed: ' + e.message)
    }
    setSubmitting(false)
  }

  // ── Add Resident (profile + optional invite in one step) ─────────────────────
  const handleAddResident = async () => {
    if (!form.surname)  { setFormError('Surname is required'); return }
    if (!form.names)    { setFormError('First name(s) are required'); return }
    if (!form.email)    { setFormError('Email is required'); return }
    if (!form.address)  { setFormError('Address is required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      // Step 1: insert profile
      const { error } = await supabase.from('profiles').insert({
        surname: form.surname.toUpperCase(),
        names: form.names,
        emails: [form.email],
        phones: form.phone ? [form.phone] : [],
        address: form.address,
        directory_visible: form.directory_visible,
        is_active: true,
        is_admin: false,
      })
      if (error) throw error

      // Step 2: optionally send invite
      if (form.sendInvite) {
        try {
          await callEdgeFunction({ mode: 'invite', email: form.email })
          setFormSuccess(`${form.names} ${form.surname} added and invitation sent to ${form.email}`)
          toast.success(`${form.names} ${form.surname} added — invitation sent`)
        } catch (inviteErr) {
          // Profile was saved; invite failed — surface a clear message but don't roll back
          setFormSuccess(`${form.names} ${form.surname} added to directory`)
          toast.error(`Added to directory, but invite failed: ${inviteErr.message}`)
        }
      } else {
        setFormSuccess(`${form.names} ${form.surname} added to directory`)
        toast.success(`${form.names} ${form.surname} added to directory`)
      }

      setForm(EMPTY_FORM)
      fetchResidents()
    } catch (e) {
      setFormError(e.message)
      toast.error('Add failed: ' + e.message)
    }
    setSubmitting(false)
  }

  // ── Create Account (auth user + profile link) ────────────────────────────────
  const handleCreate = async () => {
    if (!form.surname)  { setFormError('Surname is required'); return }
    if (!form.names)    { setFormError('First name(s) are required'); return }
    if (!form.email)    { setFormError('Email is required'); return }
    if (!form.password) { setFormError('Temporary password is required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      await callEdgeFunction({
        mode: 'create',
        email: form.email,
        password: form.password,
        surname: form.surname.toUpperCase(),
        names: form.names,
        address: form.address,
        phone: form.phone,
      })
      setFormSuccess(`Account created for ${form.email}`)
      toast.success(`Account created for ${form.email}`)
      setForm(EMPTY_FORM)
      fetchResidents()
    } catch (e) {
      setFormError(e.message)
      toast.error('Create failed: ' + e.message)
    }
    setSubmitting(false)
  }

  // ── Edit existing resident ───────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!form.surname) { setFormError('Surname is required'); return }
    if (!form.names)   { setFormError('First name(s) are required'); return }
    setSubmitting(true); setFormError(null); setFormSuccess(null)
    try {
      const updates = {
        surname: form.surname.toUpperCase(),
        names: form.names,
        address: form.address,
        directory_visible: form.directory_visible,
      }
      // Preserve existing phones array; update index 0 if phone provided
      if (form.phone) {
        const existing = editTarget.phones || []
        updates.phones = [form.phone, ...existing.slice(1)]
      }
      // Handle avatar photo
      if (avatarFile) {
        const url = await uploadAvatar(avatarFile)
        if (!url) { setSubmitting(false); return }
        updates.photo_url = url
        // Clean up old photo from storage if replaced
        if (editTarget.photo_url) deleteStoragePhoto(editTarget.photo_url, 'avatars')
      } else if (!avatarPreview) {
        // Preview was cleared — remove photo
        updates.photo_url = null
        if (editTarget.photo_url) deleteStoragePhoto(editTarget.photo_url, 'avatars')
      }
      const { error } = await supabase.from('profiles').update(updates).eq('resident_id', editTarget.resident_id)
      if (error) throw error
      setFormSuccess('Resident updated successfully')
      toast.success(`${form.names} ${form.surname} updated successfully`)
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
      surname: resident.surname || '',
      names: resident.names || '',
      email: resident.emails?.[0] || '',
      address: resident.address || '',
      phone: resident.phones?.[0] || '',
      password: '',
      directory_visible: resident.directory_visible ?? true,
      sendInvite: false,
    })
    setAvatarFile(null)
    setAvatarPreview(resident.photo_url || null)
    setFormError(null)
    setFormSuccess(null)
    setModal('edit')
  }

  const openInvite = (resident = null) => {
    setForm({ ...EMPTY_FORM, email: resident?.emails?.[0] || '', sendInvite: false })
    setFormError(null)
    setFormSuccess(null)
    setModal('invite')
  }

  const handleDeactivate = async (resident) => {
    const name = `${resident.names} ${resident.surname}`
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !resident.is_active }).eq('resident_id', resident.resident_id)
      if (error) throw error
      toast.success(`${name} ${resident.is_active ? 'deactivated' : 'activated'}`)
      fetchResidents()
    } catch (e) {
      toast.error('Failed to update status: ' + e.message)
    }
  }

  const handleToggleAdmin = async (resident) => {
    if (!resident.id) return
    const name = `${resident.names} ${resident.surname}`
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !resident.is_admin })
        .eq('id', resident.id)
      if (error) throw error
      toast.success(`${name} ${resident.is_admin ? 'removed as admin' : 'is now an admin'}`)
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
    setForm(EMPTY_FORM)
  }

  // ── Shared form fields ───────────────────────────────────────────────────────
  const inputClass = 'w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400'
  const disabledClass = 'w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm bg-brand-50 text-brand-400'

  const NameFields = () => (
    <>
      <input placeholder="Surname *" value={form.surname}
        onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
        className={inputClass} />
      <input placeholder="First name(s) *" value={form.names}
        onChange={e => setForm(f => ({ ...f, names: e.target.value }))}
        className={inputClass} />
    </>
  )

  const ContactFields = ({ emailDisabled = false }) => (
    <>
      {emailDisabled
        ? <input value={form.email} disabled className={disabledClass} />
        : <input placeholder="Email address *" type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className={inputClass} />
      }
      <input placeholder="Address *" value={form.address}
        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
        className={inputClass} />
      <input placeholder="Phone (optional)" value={form.phone}
        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
        className={inputClass} />
    </>
  )

  const DirectoryVisibleToggle = () => (
    <label className="flex items-center gap-3 text-sm text-brand-600 cursor-pointer select-none">
      <input type="checkbox" checked={form.directory_visible}
        onChange={e => setForm(f => ({ ...f, directory_visible: e.target.checked }))}
        className="w-4 h-4 rounded accent-brand-600" />
      Show in resident directory
    </label>
  )

  const SendInviteToggle = () => (
    <label className="flex items-center gap-3 text-sm cursor-pointer select-none mt-1 pt-3 border-t border-brand-100">
      <input type="checkbox" checked={form.sendInvite}
        onChange={e => setForm(f => ({ ...f, sendInvite: e.target.checked }))}
        className="w-4 h-4 rounded accent-brand-600" />
      <span>
        <span className="font-medium text-brand-700">Send invitation email</span>
        <span className="block text-xs text-brand-400 mt-0.5">Resident will receive a link to set their password</span>
      </span>
    </label>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-800 mb-1">Residents</h1>
          <p className="text-brand-500">{residents.length} registered residents</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setFormSuccess(null); setModal('directory') }}
            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            ➕ Add Resident
          </button>
          <button onClick={() => setModal('create')}
            className="bg-gold-500 hover:bg-gold-400 text-brand-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            🔑 Create Account
          </button>
        </div>
      </div>

      {/* Residents table */}
      <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-400 animate-pulse">Loading residents…</div>
        ) : residents.length === 0 ? (
          <div className="p-8 text-center text-brand-400">No residents yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 border-b border-brand-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Name</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Email</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Address</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Phone</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Directory</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Admin</th>
                  <th className="text-left px-6 py-3 text-brand-600 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {residents.map(r => {
                  const name = [r.names, r.surname].filter(Boolean).join(' ')
                  const email = r.emails?.[0] || '—'
                  const phone = r.phones?.[0] || '—'
                  const hasAccount = !!r.id

                  return (
                    <tr key={r.resident_id} className="hover:bg-brand-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {/* Avatar circle */}
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-600 flex-shrink-0 overflow-hidden">
                            {r.photo_url
                              ? <img src={r.photo_url} alt={name} className="w-full h-full object-cover" />
                              : getInitials(r.surname, r.names)
                            }
                          </div>
                          <div>
                            <div className="font-medium text-brand-800">{name || '—'}</div>
                            {!hasAccount && <div className="text-xs text-brand-300">🔒 no account</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-brand-600">{email}</td>
                      <td className="px-6 py-3 text-brand-500">{r.address || '—'}</td>
                      <td className="px-6 py-3 text-brand-500">{phone}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.directory_visible ? 'bg-blue-100 text-blue-700' : 'bg-brand-100 text-brand-400'
                        }`}>
                          {r.directory_visible ? 'Visible' : 'Hidden'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => handleToggleAdmin(r)}
                          disabled={!hasAccount}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            !hasAccount ? 'bg-brand-50 text-brand-300 cursor-not-allowed' :
                            r.is_admin
                              ? 'bg-gold-100 text-gold-700 hover:bg-red-100 hover:text-red-600'
                              : 'bg-brand-100 text-brand-500 hover:bg-gold-100 hover:text-gold-700'
                          }`}
                          title={!hasAccount ? 'No account yet' : r.is_admin ? 'Click to remove admin' : 'Click to make admin'}
                        >
                          {r.is_admin ? '⭐ Admin' : '+ Admin'}
                        </button>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => openEdit(r)}
                            className="text-brand-400 hover:text-brand-700 text-xs underline">Edit</button>
                          {hasAccount && (
                            <button onClick={() => setResetTarget(r)}
                              className="text-brand-400 hover:text-brand-700 text-xs underline">Reset PWD</button>
                          )}
                          {!hasAccount && (
                            <button onClick={() => openInvite(r)}
                              className="text-brand-400 hover:text-brand-700 text-xs underline">Invite</button>
                          )}
                          <button onClick={() => handleDeactivate(r)}
                            className="text-brand-400 hover:text-brand-700 text-xs underline">
                            {r.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-display text-xl text-brand-800 mb-4">
              {modal === 'invite'    ? '✉️ Invite Resident' :
               modal === 'directory' ? '➕ Add Resident' :
               modal === 'create'    ? '🔑 Create Account' :
                                       '✏️ Edit Resident'}
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
              {/* Invite only — email field for existing directory-only residents */}
              {modal === 'invite' && (
                <input placeholder="Email address *" type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className={inputClass} />
              )}

              {/* Add Resident — full profile + optional invite */}
              {modal === 'directory' && (
                <>
                  <NameFields />
                  <ContactFields />
                  <DirectoryVisibleToggle />
                  <SendInviteToggle />
                </>
              )}

              {/* Create Account — full profile + password */}
              {modal === 'create' && (
                <>
                  <NameFields />
                  <ContactFields />
                  <input placeholder="Temporary password *" type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className={inputClass} />
                  <DirectoryVisibleToggle />
                </>
              )}

              {/* Edit — all fields, email read-only */}
              {modal === 'edit' && (
                <>
                  {/* Avatar upload */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-brand-700 mb-2">Profile Photo</label>
                    <div className="flex items-center gap-4">
                      {/* Preview */}
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center flex-shrink-0 border-2 border-brand-200">
                        {avatarPreview
                          ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                          : <span className="text-brand-600 font-bold text-lg font-display">
                              {getInitials(editTarget?.surname, editTarget?.names)}
                            </span>
                        }
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="text-sm text-brand-600 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50 transition-colors"
                        >
                          {avatarPreview ? 'Change photo' : 'Upload photo'}
                        </button>
                        {avatarPreview && (
                          <button
                            type="button"
                            onClick={() => { setAvatarFile(null); setAvatarPreview(null); if (avatarInputRef.current) avatarInputRef.current.value = '' }}
                            className="text-sm text-red-500 hover:text-red-700 transition-colors"
                          >
                            Remove photo
                          </button>
                        )}
                        <p className="text-xs text-gray-400">JPEG, PNG or WebP · max 5 MB</p>
                      </div>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setAvatarFile(file)
                        setAvatarPreview(URL.createObjectURL(file))
                      }}
                    />
                    {avatarUploadError && (
                      <p className="text-xs text-red-500 mt-1">{avatarUploadError}</p>
                    )}
                  </div>
                  <NameFields />
                  <ContactFields emailDisabled />
                  <DirectoryVisibleToggle />
                </>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={closeModal}
                className="flex-1 border border-brand-200 text-brand-600 rounded-lg py-2.5 text-sm hover:bg-brand-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={
                  modal === 'invite'    ? handleInvite :
                  modal === 'directory' ? handleAddResident :
                  modal === 'create'    ? handleCreate :
                                         handleEdit
                }
                disabled={submitting || avatarUploading}
                className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                {avatarUploading ? 'Uploading photo…' :
                 submitting ? 'Please wait…' :
                  modal === 'invite'    ? 'Send Invitation' :
                  modal === 'directory' ? (form.sendInvite ? 'Add & Send Invite' : 'Add to Directory') :
                  modal === 'create'    ? 'Create Account' :
                                         'Save Changes'}
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
              A password reset email will be sent to <strong>{resetTarget.emails?.[0]}</strong>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)}
                className="flex-1 border border-brand-200 text-brand-600 rounded-lg py-2.5 text-sm hover:bg-brand-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handlePasswordReset(resetTarget.emails?.[0])}
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
