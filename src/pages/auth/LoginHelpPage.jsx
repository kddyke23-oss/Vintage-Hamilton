import { Link } from 'react-router-dom'
import { GENERAL_HELP_CONTACT } from '@/config/constants'

export default function LoginHelpPage() {
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
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">

          <div>
            <h2 className="font-display text-xl text-brand-800 mb-1">Need Help?</h2>
            <p className="text-sm text-brand-500">
              Here's how to get into the portal and who to contact if you're stuck.
            </p>
          </div>

          {/* Logging in for the first time */}
          <div>
            <h3 className="font-semibold text-brand-800 mb-3">Logging in for the first time</h3>
            <ol className="space-y-3">
              {[
                <>Click <strong>Set / Reset Password</strong> on the sign in screen.</>,
                <>Enter your email address and click <strong>Send Link</strong>.</>,
                <>Check your inbox for an email from Vintage @ Hamilton. If it's not there, check your spam or junk folder and mark it as safe.</>,
                <>Click the link in the email and choose your password.</>,
                <>You'll be signed in automatically.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-800 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-brand-600">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Forgot password */}
          <div className="border-t border-brand-100 pt-5">
            <h3 className="font-semibold text-brand-800 mb-2">Forgotten your password?</h3>
            <p className="text-sm text-brand-600">
              Use the <strong>Set / Reset Password</strong> button on the sign in screen,
              enter your email, and follow the link we send you.
            </p>
          </div>

          {/* No account */}
          <div className="border-t border-brand-100 pt-5">
            <h3 className="font-semibold text-brand-800 mb-2">Don't have an account yet?</h3>
            <p className="text-sm text-brand-600 mb-3">
              Access to the portal is managed by the community administrator.
              Please get in touch and they'll get you set up.
            </p>
            <div className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-xl">👤</span>
              <div>
                <p className="text-sm font-semibold text-brand-800">{GENERAL_HELP_CONTACT}</p>
                <p className="text-xs text-brand-500">Community Administrator</p>
              </div>
            </div>
          </div>

        </div>

        {/* Back to sign in */}
        <div className="text-center mt-6">
          <Link
            to="/login"
            className="text-brand-300 hover:text-gold-400 text-sm transition-colors"
          >
            ← Back to Sign In
          </Link>
        </div>

      </div>
    </div>
  )
}
