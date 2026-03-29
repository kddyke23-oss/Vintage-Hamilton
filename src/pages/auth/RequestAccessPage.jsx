import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { STREETS } from '@/config/constants'

const EMPTY_PERSON = {
  surname: '', names: '', email: '', phone: '',
  directoryVisible: true, notifyCalendar: false, notifyBlog: false,
}

export default function RequestAccessPage() {
  const [consent, setConsent]         = useState(false)
  const [address, setAddress]         = useState('')
  const [primary, setPrimary]         = useState({ ...EMPTY_PERSON })
  const [showSecondary, setShowSecondary] = useState(false)
  const [secondary, setSecondary]     = useState({ ...EMPTY_PERSON })
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState(null)

  const updatePrimary   = (field, value) => setPrimary(p => ({ ...p, [field]: value }))
  const updateSecondary = (field, value) => setSecondary(p => ({ ...p, [field]: value }))

  const validate = () => {
    if (!consent) return 'You must agree to the consent statement to continue.'
    if (!primary.surname.trim() || !primary.names.trim()) return 'Primary resident name is required.'
    if (!primary.email.trim()) return 'Primary resident email is required.'
    if (!address.trim()) return 'Street address is required.'
    if (showSecondary) {
      if (!secondary.surname.trim() || !secondary.names.trim()) return 'If adding a second resident, their name is required.'
      if (!secondary.email.trim()) return 'If adding a second resident, their email is required.'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setError(null)
    setSubmitting(true)

    const row = {
      address: address.trim(),
      primary_surname: primary.surname.trim().toUpperCase(),
      primary_names: primary.names.trim(),
      primary_email: primary.email.trim().toLowerCase(),
      primary_phone: primary.phone.trim() || null,
      primary_directory_visible: primary.directoryVisible,
      primary_notify_calendar: primary.notifyCalendar,
      primary_notify_blog: primary.notifyBlog,
      consent_given: true,
    }

    if (showSecondary && secondary.surname.trim()) {
      row.secondary_surname = secondary.surname.trim().toUpperCase()
      row.secondary_names   = secondary.names.trim()
      row.secondary_email   = secondary.email.trim().toLowerCase()
      row.secondary_phone   = secondary.phone.trim() || null
      row.secondary_directory_visible = secondary.directoryVisible
      row.secondary_notify_calendar   = secondary.notifyCalendar
      row.secondary_notify_blog       = secondary.notifyBlog
    }

    const { error: insertError } = await supabase.from('access_requests').insert(row)
    setSubmitting(false)

    if (insertError) {
      setError('Something went wrong submitting your request. Please try again or contact the community administrator.')
      console.error('access_request insert error:', insertError)
      return
    }

    setSubmitted(true)
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-800 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Header />
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="font-display text-xl text-brand-800 mb-3">Request Submitted!</h2>
            <p className="text-sm text-brand-600 mb-2">
              Thank you for requesting access to the Vintage at Hamilton Community Portal.
            </p>
            <p className="text-sm text-brand-500 mb-6">
              A community administrator will review your request and you'll receive an email
              with your login details once approved.
            </p>
            <Link
              to="/login"
              className="inline-block bg-brand-600 hover:bg-brand-500 text-white font-medium py-2.5 px-6 rounded-lg transition-colors text-sm"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──
  return (
    <div className="min-h-screen bg-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Header />

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="font-display text-xl text-brand-800 mb-2">Request Access</h2>
          <p className="text-sm text-brand-500 mb-6">
            Fill in the form below to request access to the community portal.
            An administrator will review your request.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* ── Consent ── */}
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
                />
                <span className="text-sm text-brand-700 leading-relaxed">
                  By providing the data below I consent to my information being distributed
                  to others within the Vintage at Hamilton Community via the community portal
                  and directory.
                </span>
              </label>
            </div>

            {/* ── Street Address ── */}
            <fieldset className="mb-6">
              <legend className="text-sm font-semibold text-brand-700 mb-2">Street Address *</legend>
              <input
                type="text" required value={address} onChange={e => setAddress(e.target.value)}
                placeholder="e.g. 42 Kay Chiarello Way"
                className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="text-xs text-brand-400 mt-1">
                Community streets: {STREETS.join(', ')}
              </p>
            </fieldset>

            {/* ── Primary Resident ── */}
            <PersonSection
              title="Primary Resident *"
              person={primary}
              onChange={updatePrimary}
              required
            />

            {/* ── Secondary Resident toggle ── */}
            {!showSecondary ? (
              <button
                type="button"
                onClick={() => setShowSecondary(true)}
                className="text-sm text-brand-500 hover:text-brand-700 underline mb-6 block"
              >
                + Add a second resident at this address
              </button>
            ) : (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-brand-700">Second Resident</span>
                  <button
                    type="button"
                    onClick={() => { setShowSecondary(false); setSecondary({ ...EMPTY_PERSON }) }}
                    className="text-xs text-red-500 hover:text-red-700 underline"
                  >
                    Remove
                  </button>
                </div>
                <PersonSection
                  title=""
                  person={secondary}
                  onChange={updateSecondary}
                  required={false}
                />
              </div>
            )}

            {/* ── Submit ── */}
            <button
              type="submit" disabled={submitting || !consent}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <Link
            to="/login"
            className="text-brand-300 hover:text-gold-400 text-xs underline transition-colors"
          >
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Reusable person fields ──────────────────────────────────────────────────

function PersonSection({ title, person, onChange, required }) {
  return (
    <fieldset className="mb-6 space-y-3">
      {title && <legend className="text-sm font-semibold text-brand-700 mb-1">{title}</legend>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-brand-600 mb-1">Last Name {required && '*'}</label>
          <input
            type="text" required={required} value={person.surname}
            onChange={e => onChange('surname', e.target.value)}
            className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder="Last name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-600 mb-1">First Name(s) {required && '*'}</label>
          <input
            type="text" required={required} value={person.names}
            onChange={e => onChange('names', e.target.value)}
            className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder="First name(s)"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-600 mb-1">Email Address {required && '*'}</label>
        <input
          type="email" required={required} value={person.email}
          onChange={e => onChange('email', e.target.value)}
          className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-600 mb-1">Phone Number</label>
        <input
          type="tel" value={person.phone}
          onChange={e => onChange('phone', e.target.value)}
          className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="(555) 123-4567"
        />
      </div>

      {/* Preferences */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-brand-600 mb-1">Preferences</p>
        <label className="flex items-center gap-2 text-sm text-brand-700 cursor-pointer">
          <input
            type="checkbox" checked={person.directoryVisible}
            onChange={e => onChange('directoryVisible', e.target.checked)}
            className="w-4 h-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
          />
          Display my details in the community directory
        </label>
        <label className="flex items-center gap-2 text-sm text-brand-700 cursor-pointer">
          <input
            type="checkbox" checked={person.notifyCalendar}
            onChange={e => onChange('notifyCalendar', e.target.checked)}
            className="w-4 h-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
          />
          Email me about new calendar events
        </label>
        <label className="flex items-center gap-2 text-sm text-brand-700 cursor-pointer">
          <input
            type="checkbox" checked={person.notifyBlog}
            onChange={e => onChange('notifyBlog', e.target.checked)}
            className="w-4 h-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
          />
          Email me about new blog posts
        </label>
      </div>
    </fieldset>
  )
}

// ── Header (reused on both form and success screen) ──

function Header() {
  return (
    <div className="text-center mb-8">
      <h1 className="font-display text-4xl font-semibold text-white mb-1">
        Vintage <span className="text-gold-400">@</span> Hamilton
      </h1>
      <p className="text-brand-300 text-sm">Community Portal · Hamilton, NJ</p>
    </div>
  )
}
