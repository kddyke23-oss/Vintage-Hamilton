import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import CommunityBlog from '@/components/apps/CommunityBlog'
import LoadingSpinner from '@/components/LoadingSpinner'

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
    return <LoadingSpinner label="Checking access…" />
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Authorisation Required</h2>
        <p className="text-brand-500 text-sm max-w-sm">
          You don't have access to the Community Blog yet. Please contact an administrator.
        </p>
      </div>
    )
  }

  return <CommunityBlog />
}
