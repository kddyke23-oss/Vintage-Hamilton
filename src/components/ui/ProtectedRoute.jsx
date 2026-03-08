import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <div className="text-brand-600 font-display text-xl">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Admin check will be expanded when roles are added to the DB
  // For now, requireAdmin is a placeholder
  if (requireAdmin && user?.user_metadata?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
