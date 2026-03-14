import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  // Set/Reset password state
  const [showReset, setShowReset]       = useState(false)
  const [resetEmail, setResetEmail]     = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent]       = useState(false)
  const [resetError, setResetError]     = useState(null)
  const [isNewMember, setIsNewMember]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate(from, { replace: true })
    }
  }

  const handleResetRequest = async (e) => {
    e.preventDefault()
    setResetError(null)
    setResetLoading(true)

    // Look up profile by email — using RPC to handle text[] array search reliably
    const { data: profile, error: profileError } = await supabase
      .rpc('get_profile_by_email', { lookup_email: resetEmail.trim().toLowerCase() })
      .maybeSingle()

    if (profileError) {
      setResetError(`Unable to look up your account. Please try again or contact your administrator.`)
      setResetLoading(false)
      return
    }

    if (!profile) {
      setResetError('No account found for that email address. Please check and try again.')
      setResetLoading(false)
      return
    }

    // Send password reset email — works for both new and existing members
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setResetError(error.message)
      return
    }

    // Track whether this is a new member so we can show the right message
    setIsNewMember(profile.password_set === false)
    setResetSent(true)
  }

  const goBackToSignIn = () => {
    setShowReset(false)
    setResetSent(false)
    setResetError(null)
    setIsNewMember(false)
  }

  return (
    <div className="min-h-screen bg-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-semibold text-white mb-1">
            Vintage <span className="text-gold-400">@</span> Hamilton
          </h1>
          <p className="text-brand-300 text-sm">Community Portal · Hamilton, NJ</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* ── Sign In ── */}
          {!showReset && (
            <>
              <h2 className="font-display text-xl text-brand-800 mb-6">Welcome Back</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-brand-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowReset(true); setResetEmail(email) }}
                      className="text-xs text-brand-400 hover:text-brand-600 underline"
                    >
                      Set / Reset Password
                    </button>
                  </div>
                  <input
                    type="password" required value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {/* ── Set / Reset Password ── */}
          {showReset && (
            <>
              <button
                onClick={goBackToSignIn}
                className="text-sm text-brand-400 hover:text-brand-600 mb-4 flex items-center gap-1"
              >
                ← Back to sign in
              </button>

              <h2 className="font-display text-xl text-brand-800 mb-2">Set / Reset Password</h2>

              {!resetSent ? (
                <>
                  <p className="text-sm text-brand-500 mb-6">
                    Enter your email address and we'll send you a link to set or reset your password.
                  </p>

                  {resetError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                      {resetError}
                    </div>
                  )}

                  <form onSubmit={handleResetRequest} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-brand-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email" required value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                        placeholder="you@example.com"
                      />
                    </div>
                    <button
                      type="submit" disabled={resetLoading}
                      className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors"
                    >
                      {resetLoading ? 'Checking…' : 'Send Link'}
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="text-4xl mb-4">📬</div>
                  <p className="text-brand-700 font-medium mb-2">Check your inbox</p>
                  <p className="text-sm text-brand-500 mb-6">
                    {isNewMember
                      ? <>Welcome! We've sent a link to <strong>{resetEmail}</strong> to set up your password. Check your inbox and follow the link.</>
                      : <>We've sent a password reset link to <strong>{resetEmail}</strong>. The link will expire in 1 hour.</>
                    }
                  </p>
                  <button
                    onClick={goBackToSignIn}
                    className="text-sm text-brand-400 hover:text-brand-600 underline"
                  >
                    Back to sign in
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-brand-400 text-xs mt-6">
          Need access? Contact your community administrator.
        </p>
      </div>
    </div>
  )
}
