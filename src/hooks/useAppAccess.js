import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export function useAppAccess() {
  const { user, isAdmin } = useAuth()
  const [accessList, setAccessList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }

    const fetch = async () => {
      const { data } = await supabase
        .from('app_access')
        .select('app_id')
        .eq('user_id', user.id)
      setAccessList(data?.map(r => r.app_id) ?? [])
      setLoading(false)
    }
    fetch()
  }, [user])

  const hasAccess = (appId) => isAdmin || accessList.includes(appId)

  return { accessList, hasAccess, loading }
}
