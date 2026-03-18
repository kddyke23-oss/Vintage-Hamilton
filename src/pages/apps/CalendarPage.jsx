import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import SocialCalendar from '@/components/apps/SocialCalendar'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function CalendarPage() {
  const { user } = useAuth()
  const [hasAccess, setHasAccess] = useState(null)

  useEffect(() => {
    if (!user) return
    async function checkAccess() {
      const { data } = await supabase
        .from('app_access')
        .select('app_id')
        .eq('user_id', user.id)
        .in('app_id', ['calendar', 'admin'])
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
          You don't have access to the Social Calendar yet. Please contact your community administrator.
        </p>
      </div>
    )
  }

  return <SocialCalendar />
}
