import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [error, setError]               = useState(null)
  const [loading, setLoading]           = useState(false)
  const [done, setDone]                 = useState(false)
  const [validSession, setValidSession] = useState(false)

  // Supabase puts the token in the URL hash — we need to let it process
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setValidSession(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    setLoading(true)

    // Update the password
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Mark password as set in profiles
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      await supabase
        .from('profiles')
        .update({ password_set: true })
        .eq('id', session.user.id)
    }

    setLoading(false)
    setDone(true)
    setTimeout(() => navigate('/'), 3000)
  }

  return (
    <div className="min-h-screen bg-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-semibold text-white mb-1">
            Vintage <span className="text-gold-400">@</span> Hamilton
          </h1>
          <p className="text-brand-300 text-sm">Community Portal · Hamilton, NJ</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <p className="text-brand-700 font-medium mb-2">Password updated!</p>
              <p className="text-sm text-brand-500">Redirecting you to the portal…</p>
            </div>
          ) : !validSession ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">⏳</div>
              <p className="text-sm text-brand-500">Verifying your reset link…</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl text-brand-800 mb-2">Set New Password</h2>
              <p className="text-sm text-brand-500 mb-6">Choose a strong password for your account.</p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-700 mb-1">New Password</label>
                  <input
                    type="password" required value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-700 mb-1">Confirm Password</label>
                  <input
                    type="password" required value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="w-full border border-brand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
