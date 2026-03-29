import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { deleteStoragePhoto } from '@/lib/storage'
import { useImageUpload } from '@/hooks/useImageUpload'
import { STREETS } from '@/config/constants'

const APPS = [
  { id: 'directory', label: 'Directory', icon: '👥' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'lotto', label: 'Lotto', icon: '🎟️' },
  { id: 'blog', label: 'Blog', icon: '📝' },
  { id: 'recommendations', label: 'Recommendations', icon: '⭐' },
  { id: 'budget', label: 'Budget', icon: '💰' },
]

// Cycle: none → user → admin → none (regular apps only)
const NEXT_STATE = { none: 'user', user: 'admin', admin: 'none' }

const STATE_DISPLAY = {
  none: { icon: '○', label: 'No Access', className: 'bg-brand-100 text-brand-400 hover:bg-blue-50 hover:text-blue-500' },
  user: { icon: '✅', label: 'User', className: 'bg-green-100 text-green-700 hover:bg-gold-100 hover:text-gold-700' },
  admin: { icon: '⭐', label: 'Admin', className: 'bg-yellow-100 text-yellow-700 hover:bg-red-50 hover:text-red-500' },
}

const COLUMN_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'user', label: '✅ User' },
  { value: 'admin', label: '⭐ Admin' },
  { value: 'any', label: '✅⭐ Any Access' },
  { value: 'none', label: '○ No Access' },
]

// ─── SVG Icons (for resident card modal) ─────────────────────────────────────
const IconPin = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
const IconPhone = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.9a16 16 0 006.19 6.19l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
const IconMail = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
const IconEdit = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
const IconX = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
const IconPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
const IconMinus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>

// ─── Inline styles for the resident card modal ────────────────────────────────
const inputStyle = {
  padding: '0.5rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '6px',
  fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--font-body)',
  background: 'white', width: '100%', boxSizing: 'border-box',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  padding: '0.5rem 1rem', background: '#1e4976', color: 'white',
  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500',
}
const btnSec = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
  padding: '0.5rem 1rem', background: 'white', color: '#374151',
  border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500',
}
const btnOutline = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  padding: '0.3rem 0.65rem', background: 'transparent', color: '#1e4976',
  border: '1px solid #1e4976', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem',
}
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '0.35rem', background: '#f3f4f6', border: 'none', borderRadius: '5px',
  cursor: 'pointer', color: '#6b7280',
}
const addMoreBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  padding: '0.3rem 0.65rem', background: 'transparent', color: '#1e4976',
  border: '1px dashed #1e4976', borderRadius: '5px', cursor: 'pointer',
  fontSize: '0.8rem', marginTop: '0.25rem',
}
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1500, padding: '1rem',
}

function parseAddress(address) {
  if (!address) return { houseNumber: null, street: '' }
  const match = address.trim().match(/^(\d+)\s+(.+)$/)
  if (match) return { houseNumber: parseInt(match[1], 10), street: match[2] }
  return { houseNumber: null, street: address }
}

// ─── ModalField helper ────────────────────────────────────────────────────────
function ModalField({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '0.3rem' }}>{label}</label>
      {children}
    </div>
  )
}

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
        className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs transition-all ${isActive ? 'bg-brand-700 text-white' : 'bg-brand-100 text-brand-400 hover:bg-brand-200 hover:text-brand-600'
          }`}
      >▾</button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-brand-200 rounded-lg shadow-lg z-50 min-w-[145px] py-1 text-left">
          {COLUMN_FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => { onChange(appId, opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${value === opt.value ? 'bg-brand-700 text-white font-medium' : 'text-brand-700 hover:bg-brand-50'
                }`}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Edit Resident Modal ──────────────────────────────────────────────────────
// Defined OUTSIDE the parent component to prevent focus loss on re-render
function EditResidentModal({ entry, onSave, onClose, isSaving }) {
  const parsed = parseAddress(entry.address)
  const knownStreet = STREETS.includes(parsed.street) ? parsed.street : ''
  const customStreet = STREETS.includes(parsed.street) ? '' : parsed.street

  const [form, setForm] = useState({
    surname: entry.surname || '',
    names: entry.names || '',
    houseNumber: parsed.houseNumber ? String(parsed.houseNumber) : '',
    street: knownStreet || STREETS[0],
    customStreet: customStreet,
    phones: entry.phones?.length ? entry.phones : [''],
    emails: entry.emails?.length ? entry.emails : [''],
    tags: entry.tags || [],
    notify_calendar: entry.notify_calendar ?? false,
    notify_blog: entry.notify_blog ?? false,
    directory_visible: entry.directory_visible ?? true,
  })
  const [newTag, setNewTag] = useState('')
  const [availableTags, setAvailableTags] = useState([])

  useEffect(() => {
    supabase.from('directory_tags').select('label').order('label')
      .then(({ data }) => setAvailableTags(data?.map(t => t.label) || []))
  }, [])

  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(entry.photo_url || null)
  const existingPhotoUrl = entry.photo_url || null
  const photoInputRef = useRef(null)
  const { uploading: photoUploading, error: photoUploadError, uploadImage } = useImageUpload({ bucket: 'avatars', maxDimension: 400 })

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))
  const updArr = (f, i, v) => { const a = [...form[f]]; a[i] = v; setForm(p => ({ ...p, [f]: a })) }
  const addArr = (f) => setForm(p => ({ ...p, [f]: [...p[f], ''] }))
  const remArr = (f, i) => { const a = form[f].filter((_, idx) => idx !== i); setForm(p => ({ ...p, [f]: a.length ? a : [''] })) }
  const addTag = () => { if (newTag.trim() && !form.tags.includes(newTag.trim())) { setForm(p => ({ ...p, tags: [...p.tags, newTag.trim()] })); setNewTag('') } }
  const remTag = (t) => setForm(p => ({ ...p, tags: p.tags.filter(x => x !== t) }))

  const handleSubmit = async () => {
    if (!form.surname.trim()) { alert('Surname is required.'); return }
    const streetName = form.street === '__other__' ? form.customStreet.trim() : form.street
    const address = form.houseNumber.trim() && streetName
      ? `${form.houseNumber.trim()} ${streetName}`
      : streetName || form.houseNumber.trim() || ''

    let photo_url = existingPhotoUrl
    if (photoFile) {
      const uploaded = await uploadImage(photoFile)
      if (!uploaded) return
      photo_url = uploaded
    } else if (!photoPreview) {
      photo_url = null
    }

    onSave({
      ...entry,
      surname: form.surname.toUpperCase().trim(),
      names: form.names,
      address,
      phones: form.phones.filter(p => p.trim()),
      emails: form.emails.filter(e => e.trim()),
      tags: form.tags,
      notify_calendar: form.notify_calendar,
      notify_blog: form.notify_blog,
      directory_visible: form.directory_visible,
      photo_url,
    })
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '12px', maxWidth: '520px', width: '100%', maxHeight: '90vh', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem 0.75rem', flexShrink: 0, borderBottom: '1px solid #f0f0f0' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: '#1e4976', fontSize: '1.2rem', margin: 0 }}>✏️ Edit Resident</h3>
          <button onClick={onClose} style={iconBtn}><IconX /></button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', flex: 1 }}>

          {/* Photo */}
          <ModalField label="Profile Photo">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'rgba(30,73,118,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(30,73,118,0.2)' }}>
                {photoPreview
                  ? <img src={photoPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: '#1e4976' }}>
                    {((form.names?.[0] || '') + (form.surname?.[0] || '')).toUpperCase() || '?'}
                  </span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button type="button" onClick={() => photoInputRef.current?.click()} style={{ ...btnSec, fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}>
                  {photoPreview ? 'Change photo' : 'Upload photo'}
                </button>
                {photoPreview && (
                  <button type="button" onClick={() => { setPhotoFile(null); if (photoPreview !== existingPhotoUrl) URL.revokeObjectURL(photoPreview); setPhotoPreview(null); if (photoInputRef.current) photoInputRef.current.value = '' }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.78rem', textAlign: 'left', padding: 0 }}>
                    Remove photo
                  </button>
                )}
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>JPEG, PNG or WebP · max 5 MB</span>
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (!f) return; setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)) }} />
            {photoUploadError && <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.35rem' }}>{photoUploadError}</p>}
          </ModalField>

          <ModalField label="Surname *">
            <input value={form.surname} onChange={e => upd('surname', e.target.value.toUpperCase())} style={inputStyle} placeholder="e.g. SMITH" />
          </ModalField>
          <ModalField label="First Names *">
            <input value={form.names} onChange={e => upd('names', e.target.value)} style={inputStyle} placeholder="e.g. John Mary" />
          </ModalField>
          <ModalField label="Street">
            <select value={form.street} onChange={e => upd('street', e.target.value)} style={{ ...inputStyle, marginBottom: '0.4rem' }}>
              {STREETS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__other__">Other / Unknown</option>
            </select>
            {form.street === '__other__' && (
              <input value={form.customStreet} onChange={e => upd('customStreet', e.target.value)} style={inputStyle} placeholder="Enter street name" />
            )}
          </ModalField>
          <ModalField label="House Number">
            <input value={form.houseNumber} onChange={e => upd('houseNumber', e.target.value)} style={{ ...inputStyle, width: '120px' }} placeholder="e.g. 12" type="number" min="1" />
          </ModalField>
          <ModalField label="Phone Numbers">
            {form.phones.map((phone, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem' }}>
                <input value={phone} onChange={e => updArr('phones', i, e.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} placeholder="Phone number" />
                {form.phones.length > 1 && <button type="button" onClick={() => remArr('phones', i)} style={iconBtn}><IconMinus /></button>}
              </div>
            ))}
            <button type="button" onClick={() => addArr('phones')} style={addMoreBtn}><IconPlus /> Add Phone</button>
          </ModalField>
          <ModalField label="Email Addresses">
            {form.emails.map((email, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem' }}>
                <input value={email} onChange={e => updArr('emails', i, e.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} placeholder="email@example.com" type="email" />
                {form.emails.length > 1 && <button type="button" onClick={() => remArr('emails', i)} style={iconBtn}><IconMinus /></button>}
              </div>
            ))}
            <button type="button" onClick={() => addArr('emails')} style={addMoreBtn}><IconPlus /> Add Email</button>
          </ModalField>
          <ModalField label="Tags / Roles">
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                value=""
                onChange={e => {
                  const val = e.target.value
                  if (val && !form.tags.includes(val)) {
                    setForm(p => ({ ...p, tags: [...p.tags, val] }))
                  }
                }}
                style={{ ...inputStyle, flex: 1, width: 'auto' }}
              >
                <option value="">— Select a tag to add —</option>
                {availableTags
                  .filter(t => !form.tags.includes(t))
                  .map(t => <option key={t} value={t}>{t}</option>)
                }
              </select>
            </div>
            {form.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                {form.tags.map((tag, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(30,73,118,0.08)', color: '#1e4976', padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem' }}>
                    {tag}
                    <button onClick={() => remTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, display: 'flex' }}><IconX /></button>
                  </span>
                ))}
              </div>
            )}
          </ModalField>

          {/* Directory Visibility */}
          <ModalField label="Directory Visibility">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: '6px', background: form.directory_visible ? '#f0fdf4' : '#fef2f2', border: `1px solid ${form.directory_visible ? '#86efac' : '#fca5a5'}` }}>
              <input type="checkbox" checked={form.directory_visible} onChange={e => upd('directory_visible', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#1e4976', cursor: 'pointer', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>{form.directory_visible ? 'Visible in directory' : 'Hidden from directory'}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{form.directory_visible ? 'Resident appears on the directory page' : 'Resident is not shown to other residents'}</div>
              </div>
            </label>
          </ModalField>

          {/* Email Notifications — admins can toggle for any resident */}
          <ModalField label="Email Notifications">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { key: 'notify_calendar', label: 'Social Calendar', desc: 'New events and updates' },
                { key: 'notify_blog', label: 'Community Blog', desc: 'New posts and comments' },
              ].map(({ key, label, desc }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: '6px', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <input type="checkbox" checked={form[key]} onChange={e => upd(key, e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#1e4976', cursor: 'pointer', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>{label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </ModalField>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem 1rem', flexShrink: 0, borderTop: '1px solid #f0f0f0' }}>
          <button onClick={handleSubmit} disabled={isSaving || photoUploading} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
            {photoUploading ? 'Uploading…' : isSaving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} style={{ ...btnSec, flex: 1, justifyContent: 'center' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Resident Profile Card Modal (view mode) ──────────────────────────────────
// Also defined OUTSIDE the parent to prevent remount on re-render
function ResidentProfileModal({ entry, authInfo, onEdit, onClose, onInviteSent }) {
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null)

  const hasAccount = !!entry.id
  const primaryEmail = entry.emails?.[0]

  const handleSendInvite = async () => {
    if (!primaryEmail) return
    setInviting(true)
    setInviteMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ mode: 'invite', email: primaryEmail }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Something went wrong')
      setInviteMsg({ type: 'success', text: `Invitation sent to ${primaryEmail}` })
      onInviteSent?.()
    } catch (e) {
      setInviteMsg({ type: 'error', text: `Failed: ${e.message}` })
    }
    setInviting(false)
  }

  const lastAccess = authInfo?.last_sign_in_at
    ? new Date(authInfo.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '14px', maxWidth: '420px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Card header with avatar */}
        <div style={{ background: '#1e4976', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {entry.photo_url
              ? <img src={entry.photo_url} alt={entry.names} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: '700', color: 'white', opacity: 0.9 }}>
                {((entry.names?.[0] || '') + (entry.surname?.[0] || '')).toUpperCase()}
              </span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: 'white' }}>{entry.surname}</div>
            <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.75)' }}>{entry.names}</div>
          </div>
          <button onClick={onClose} style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '6px', padding: '0.3rem', cursor: 'pointer', display: 'flex' }}><IconX /></button>
        </div>

        {/* Card body */}
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {/* Contact info */}
          <div style={{ marginBottom: '1rem' }}>
            {entry.address && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.875rem', color: '#374151' }}>
                <span style={{ color: '#1e4976', marginTop: '1px', flexShrink: 0 }}><IconPin /></span>
                <span>{entry.address}</span>
              </div>
            )}
            {entry.phones?.filter(Boolean).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.875rem', color: '#374151' }}>
                <span style={{ color: '#1e4976', marginTop: '1px', flexShrink: 0 }}><IconPhone /></span>
                <span>{p}</span>
              </div>
            ))}
            {entry.emails?.filter(Boolean).map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.875rem', color: '#374151' }}>
                <span style={{ color: '#1e4976', marginTop: '1px', flexShrink: 0 }}><IconMail /></span>
                <a href={`mailto:${e}`} style={{ color: '#1e4976', textDecoration: 'none' }}>{e}</a>
              </div>
            ))}
          </div>

          {/* Tags */}
          {entry.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '1rem' }}>
              {entry.tags.map((tag, i) => (
                <span key={i} style={{ background: 'rgba(30,73,118,0.08)', color: '#1e4976', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>{tag}</span>
              ))}
            </div>
          )}

          {/* Account status */}
          <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ color: '#6b7280', fontWeight: '600' }}>Account status</span>
              <span style={{ color: hasAccount ? '#16a34a' : '#d97706', fontWeight: '600' }}>
                {hasAccount ? '✅ Active' : '⏳ No account yet'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280', fontWeight: '600' }}>Last access</span>
              <span style={{ color: lastAccess ? '#374151' : '#9ca3af' }}>{lastAccess ?? 'Never'}</span>
            </div>
          </div>

          {/* Notification prefs */}
          <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: '600', color: '#6b7280', marginBottom: '0.4rem' }}>Email notifications</div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <span style={{ color: entry.notify_calendar ? '#16a34a' : '#9ca3af' }}>
                {entry.notify_calendar ? '✅' : '○'} Calendar
              </span>
              <span style={{ color: entry.notify_blog ? '#16a34a' : '#9ca3af' }}>
                {entry.notify_blog ? '✅' : '○'} Blog
              </span>
            </div>
          </div>

          {/* Invite feedback */}
          {inviteMsg && (
            <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', background: inviteMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${inviteMsg.type === 'success' ? '#86efac' : '#fca5a5'}`, color: inviteMsg.type === 'success' ? '#16a34a' : '#dc2626' }}>
              {inviteMsg.type === 'success' ? '✅' : '❌'} {inviteMsg.text}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onEdit} style={{ ...btnOutline, flex: 1, justifyContent: 'center' }}>
              <IconEdit /> Edit Profile
            </button>
            {!hasAccount && primaryEmail && (
              <button onClick={handleSendInvite} disabled={inviting || !!inviteMsg?.type === 'success'}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.3rem 0.65rem', background: '#c9922a', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem', opacity: inviting ? 0.6 : 1 }}>
                {inviting ? '…' : '✉️ Send Invite'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccessPage() {
  const toast = useToast()

  const [residents, setResidents] = useState([])
  const [access, setAccess] = useState({})
  const [superAdmins, setSuperAdmins] = useState({}) // user_id → boolean
  const [authInfo, setAuthInfo] = useState({}) // resident_id → { last_sign_in_at }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Modal state
  const [viewingEntry, setViewingEntry] = useState(null) // resident object for profile card
  const [editingEntry, setEditingEntry] = useState(null) // resident object for edit form

  const [colFilters, setColFilters] = useState(
    Object.fromEntries(APPS.map(a => [a.id, 'all']))
  )

  // Pending access requests count
  const [pendingRequestCount, setPendingRequestCount] = useState(0)

  useEffect(() => {
    supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPendingRequestCount(count || 0))
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const [{ data: profiles, error: pError }, { data: accessRows, error: aError }, authData] = await Promise.all([
        supabase
          .from('profiles')
          .select('resident_id, id, surname, names, emails, phones, address, tags, directory_visible, notify_calendar, notify_blog, photo_url, is_active, is_admin')
          .order('surname'),
        supabase.from('app_access').select('user_id, app_id, role'),
        supabase.rpc('get_resident_auth_info').then(r => r),
      ])

      if (pError) throw pError
      if (aError) throw aError

      // Build access map
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

      // Build super admin map from profiles.is_admin (source of truth)
      const superAdminMap = {}
      profiles?.forEach(p => { if (p.id) superAdminMap[p.id] = !!p.is_admin })

      // Build auth info map keyed by resident_id
      const aMap = {}
      authData?.data?.forEach(row => {
        aMap[row.resident_id] = { last_sign_in_at: row.last_sign_in_at }
      })

      setResidents(profiles ?? [])
      setAccess(map)
      setSuperAdmins(superAdminMap)
      setAuthInfo(aMap)
    } catch (e) {
      toast.error('Failed to load data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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

  const setColFilter = (appId, value) => setColFilters(prev => ({ ...prev, [appId]: value }))
  const clearAllFilters = () => setColFilters(Object.fromEntries(APPS.map(a => [a.id, 'all'])))

  // ── Access mutations ──────────────────────────────────────────────────────────
  const cycleAccess = async (userId, appId, currentState, name) => {
    if (!userId) return
    const nextState = NEXT_STATE[currentState]
    const appLabel = APPS.find(a => a.id === appId)?.label
    setSaving(`${userId}-${appId}`)
    try {
      if (nextState === 'none') {
        const { error } = await supabase.from('app_access').delete().eq('user_id', userId).eq('app_id', appId)
        if (error) throw error
        toast.info(`${appLabel} access removed for ${name}`)
      } else if (currentState === 'none') {
        const { error } = await supabase.from('app_access').insert({ user_id: userId, app_id: appId, role: nextState })
        if (error) throw error
        toast.success(`${appLabel} ${nextState} access granted to ${name}`)
      } else {
        const { error } = await supabase.from('app_access').update({ role: nextState }).eq('user_id', userId).eq('app_id', appId)
        if (error) throw error
        toast.success(`${name} is now ${nextState === 'admin' ? 'an admin' : 'a user'} for ${appLabel}`)
      }
      setAccess(prev => ({ ...prev, [userId]: { ...prev[userId], [appId]: nextState } }))
    } catch (e) {
      toast.error('Failed to update access: ' + e.message)
    }
    setSaving(null)
  }

  const grantAll = async (userId, name) => {
    if (!userId) return
    try {
      const toInsert = APPS.filter(a => access[userId]?.[a.id] === 'none').map(a => ({ user_id: userId, app_id: a.id, role: 'user' }))
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
    } catch (e) { toast.error('Failed to grant all access: ' + e.message) }
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
      setSuperAdmins(prev => ({ ...prev, [userId]: false }))
      toast.info(`All app access removed for ${name}`)
    } catch (e) { toast.error('Failed to revoke access: ' + e.message) }
  }

  const toggleSuperAdmin = async (userId, name, currentlySuper) => {
    if (!userId) return

    if (currentlySuper) {
      // Guard: never allow the last super admin to be removed
      const superAdminCount = Object.values(superAdmins).filter(Boolean).length
      if (superAdminCount <= 1) {
        toast.error('Cannot remove the last super admin — grant it to someone else first.')
        return
      }
      if (!window.confirm(`Remove super admin access from ${name}?\n\nThey will lose the ability to manage residents and app access.`)) return

      // Find resident_id for this user_id
      const resident = residents.find(r => r.id === userId)
      if (!resident) { toast.error('Resident not found.'); return }
      const { error } = await supabase.from('profiles')
        .update({ is_admin: false })
        .eq('resident_id', resident.resident_id)
      if (error) { toast.error('Failed to remove super admin: ' + error.message); return }
      setSuperAdmins(prev => ({ ...prev, [userId]: false }))
      toast.info(`Super admin removed for ${name}`)
    } else {
      if (!window.confirm(`Grant full super admin access to ${name}?\n\nThey will be able to manage all residents and control app access for everyone.`)) return

      const resident = residents.find(r => r.id === userId)
      if (!resident) { toast.error('Resident not found.'); return }
      const { error } = await supabase.from('profiles')
        .update({ is_admin: true })
        .eq('resident_id', resident.resident_id)
      if (error) { toast.error('Failed to grant super admin: ' + error.message); return }
      setSuperAdmins(prev => ({ ...prev, [userId]: true }))
      toast.success(`Super admin granted to ${name}`)
    }
  }

  // ── Profile save ─────────────────────────────────────────────────────────────
  const handleSave = async (entry) => {
    setIsSaving(true)
    const { resident_id, id, _isOwnRecord, ...fields } = entry
    try {
      const existing = residents.find(r => r.resident_id === resident_id)
      if (existing?.photo_url && existing.photo_url !== fields.photo_url) {
        deleteStoragePhoto(existing.photo_url, 'avatars')
      }
      const { error } = await supabase.from('profiles').update(fields).eq('resident_id', resident_id)
      if (error) throw error
      toast.success('Profile updated')
      setEditingEntry(null)
      setViewingEntry(null)
      await fetchAll()
    } catch (e) {
      toast.error('Error saving profile: ' + e.message)
    }
    setIsSaving(false)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const displayName = (r) => [r.surname, r.names].filter(Boolean).join(', ') || '—'
  const displayEmail = (r) => r.emails?.[0] || '—'

  const formatLastAccess = (residentId) => {
    const info = authInfo[residentId]
    if (!info?.last_sign_in_at) return 'Never'
    return new Date(info.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      <style>{`
        :root {
          --color-primary: #1e4976;
          --color-primary-dark: #163758;
          --color-primary-rgb: 30, 73, 118;
          --color-gold: #c9922a;
          --font-display: 'Playfair Display', serif;
          --font-body: 'Lato', sans-serif;
        }
      `}</style>

      <div>
        <h1 className="font-display text-3xl text-brand-800 mb-1">Admin Portal</h1>
        <p className="text-brand-500">Manage resident app access. Click a resident's name to view their profile.</p>
      </div>

      {/* Pending access requests banner */}
      {pendingRequestCount > 0 && (
        <Link to="/admin/requests" className="block bg-yellow-50 border border-yellow-300 rounded-xl px-5 py-3 hover:bg-yellow-100 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <p className="text-sm font-semibold text-yellow-800">
                  {pendingRequestCount} pending access request{pendingRequestCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-yellow-600">New residents are waiting for approval</p>
              </div>
            </div>
            <span className="text-yellow-700 text-sm font-medium">Review →</span>
          </div>
        </Link>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm text-brand-500 flex-wrap">
        <span className="font-medium">Click icons to cycle:</span>
        {Object.entries(STATE_DISPLAY).map(([state, { icon, label }]) => (
          <span key={state} className="flex items-center gap-1"><span>{icon}</span> {label}</span>
        ))}
        <span className="ml-2 text-brand-300">|</span>
        <span className="flex items-center gap-1 text-brand-400 italic text-xs">🔒 No account yet</span>
        <span className="text-brand-300">|</span>
        <span className="flex items-center gap-1 text-brand-400 italic text-xs">▾ Click to filter a column</span>
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
              <button onClick={() => setColFilter(a.id, 'all')} className="ml-0.5 opacity-70 hover:opacity-100 font-bold leading-none" title={`Remove ${a.label} filter`}>×</button>
            </span>
          ))}
          <span className="text-brand-500">
            Showing <span className="font-semibold text-brand-700">{filteredResidents.length}</span> of {residents.length} residents
          </span>
          <button onClick={clearAllFilters} className="ml-auto text-xs text-red-500 hover:text-red-700 underline font-medium">Clear all filters</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400 animate-pulse">Loading…</div>
      ) : residents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">No residents found.</div>
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
                <th className="text-left px-5 py-3 text-brand-600 font-semibold whitespace-nowrap">Resident</th>
                <th className="text-center px-3 py-3 text-brand-600 font-semibold text-xs">Active</th>
                <th className="text-center px-3 py-3 text-brand-600 font-semibold text-xs whitespace-nowrap">Has Account</th>
                <th className="text-center px-3 py-3 text-brand-600 font-semibold text-xs whitespace-nowrap">Last Access</th>
                {APPS.map(app => {
                  const isFiltered = colFilters[app.id] !== 'all'
                  return (
                    <th key={app.id} className={`text-center px-3 py-3 text-brand-600 font-semibold transition-colors ${isFiltered ? 'bg-brand-100' : ''}`}>
                      <div className="flex flex-col items-center gap-1">
                        <div>{app.icon}</div>
                        <div className="text-xs font-normal">{app.label}</div>
                        <ColumnFilterDropdown appId={app.id} value={colFilters[app.id]} onChange={setColFilter} />
                      </div>
                    </th>
                  )
                })}
                <th className="text-center px-3 py-3 text-brand-600 font-semibold text-xs">Bulk</th>
                {/* Divider + Super Admin */}
                <th className="text-center pl-4 pr-3 py-3 border-l-2 border-brand-200">
                  <div className="flex flex-col items-center gap-1">
                    <div>🛡️</div>
                    <div className="text-xs font-normal text-amber-700 whitespace-nowrap">Super Admin</div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {filteredResidents.map(r => {
                const hasAccount = !!r.id
                const name = displayName(r)
                return (
                  <tr key={r.resident_id} className={`transition-colors ${hasAccount ? 'hover:bg-brand-50' : 'bg-gray-50'}`}>

                    {/* Name — clickable */}
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setViewingEntry(r)}
                        className="text-left group"
                      >
                        <div className="font-medium text-brand-700 group-hover:text-brand-900 group-hover:underline underline-offset-2 transition-colors">
                          {name}
                        </div>
                        <div className="text-brand-400 text-xs">{displayEmail(r)}</div>
                      </button>
                    </td>

                    {/* Active */}
                    <td className="text-center px-3 py-3">
                      <span className={`text-sm ${r.is_active ? 'text-green-600' : 'text-red-400'}`}>
                        {r.is_active ? '✅' : '○'}
                      </span>
                    </td>

                    {/* Has account */}
                    <td className="text-center px-3 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${hasAccount ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'}`}>
                        {hasAccount ? 'Account' : 'Pending'}
                      </span>
                    </td>

                    {/* Last access */}
                    <td className="text-center px-3 py-3">
                      <span className={`text-xs ${formatLastAccess(r.resident_id) === 'Never' ? 'text-brand-300' : 'text-brand-600'}`}>
                        {formatLastAccess(r.resident_id)}
                      </span>
                    </td>

                    {/* App toggles */}
                    {APPS.map(app => {
                      const state = hasAccount ? (access[r.id]?.[app.id] ?? 'none') : 'none'
                      const key = `${r.id}-${app.id}`
                      const display = STATE_DISPLAY[state]
                      const isFiltered = colFilters[app.id] !== 'all'
                      return (
                        <td key={app.id} className={`text-center px-3 py-3 transition-colors ${isFiltered ? 'bg-brand-50' : ''}`}>
                          <button
                            onClick={() => hasAccount
                              ? cycleAccess(r.id, app.id, state, name)
                              : toast.info(`${name} hasn't logged in yet — access will unlock after their first login`)
                            }
                            disabled={saving === key}
                            className={`w-8 h-8 rounded-full text-base transition-all ${!hasAccount ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
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

                    {/* Bulk */}
                    <td className="text-center px-3 py-3">
                      {hasAccount ? (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => grantAll(r.id, name)} className="text-xs text-green-600 hover:text-green-800 underline">All</button>
                          <span className="text-brand-300">|</span>
                          <button onClick={() => revokeAll(r.id, name)} className="text-xs text-red-500 hover:text-red-700 underline">None</button>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-300">—</span>
                      )}
                    </td>
                    {/* Super Admin */}
                    <td className="text-center pl-4 pr-3 py-3 border-l-2 border-brand-100">
                      {hasAccount ? (
                        <button
                          onClick={() => toggleSuperAdmin(r.id, name, !!superAdmins[r.id])}
                          title={superAdmins[r.id] ? `Remove super admin from ${name}` : `Grant super admin to ${name}`}
                          className={`w-8 h-8 rounded-full text-base transition-all ${superAdmins[r.id]
                            ? 'bg-amber-100 text-amber-700 hover:bg-red-50 hover:text-red-600'
                            : 'bg-brand-100 text-brand-400 hover:bg-amber-50 hover:text-amber-600'
                            }`}
                        >
                          {superAdmins[r.id] ? '🛡️' : '○'}
                        </button>
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

      {/* ── Profile Card Modal ── */}
      {viewingEntry && !editingEntry && (
        <ResidentProfileModal
          entry={viewingEntry}
          authInfo={authInfo[viewingEntry.resident_id]}
          onEdit={() => setEditingEntry(viewingEntry)}
          onClose={() => setViewingEntry(null)}
          onInviteSent={fetchAll}
        />
      )}

      {/* ── Edit Modal ── */}
      {editingEntry && (
        <EditResidentModal
          entry={editingEntry}
          onSave={handleSave}
          onClose={() => setEditingEntry(null)}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}
