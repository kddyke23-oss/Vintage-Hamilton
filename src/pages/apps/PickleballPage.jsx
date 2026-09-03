import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import PickleballCourt from '@/components/apps/PickleballCourt'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function PickleballPage() {
  const { user } = useAuth()
  const [hasAccess, setHasAccess] = useState(null)

  useEffect(() => {
    if (!user) return
    async function checkAccess() {
      const { data } = await supabase
        .from('app_access')
        .select('app_id')
        .eq('user_id', user.id)
        .in('app_id', ['pickleball', 'admin'])
      setHasAccess(data && data.length > 0)
    }
    checkAccess()
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
          You don&apos;t have access to the Pickleball Court yet. Please contact your community administrator.
        </p>
      </div>
    )
  }

  return <PickleballCourt />
}
