import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import CommunityBlog from '@/components/apps/CommunityBlog'

export default function BlogPage() {
  const { user } = useAuth()
  const [hasAccess, setHasAccess] = useState(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('app_access')
      .select('app_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const granted = data?.some(a => a.app_id === 'blog' || a.app_id === 'admin')
        setHasAccess(!!granted)
      })
  }, [user])

  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <div className="text-3xl mb-2">⏳</div>
          <p>Checking access…</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Authorisation Required</h2>
          <p className="text-gray-500 text-sm">
            You don't have access to the Community Blog yet. Please contact an administrator.
          </p>
        </div>
      </div>
    )
  }

  return <CommunityBlog />
}
