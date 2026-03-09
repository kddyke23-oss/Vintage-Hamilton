import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]                     = useState(null)
  const [session, setSession]               = useState(null)
  const [isAdmin, setIsAdmin]               = useState(false)
  const [appAccess, setAppAccess]           = useState([]) // [{ app_id, role }]
  const [loading, setLoading]               = useState(true)

  const loadUserData = async (userId) => {
    if (!userId) {
      setIsAdmin(false)
      setAppAccess([])
      return
    }

    // Check super admin flag from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    setIsAdmin(profile?.is_admin === true)

    // Load all app access rows for this user
    const { data: access } = await supabase
      .from('app_access')
      .select('app_id, role')
      .eq('user_id', userId)
    setAppAccess(access || [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      loadUserData(session?.user?.id).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      loadUserData(session?.user?.id).finally(() => setLoading(false))
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      setIsAdmin(false)
      setAppAccess([])
    }
    return { error }
  }

  // Helper: check if user has access to a specific app
  const hasAppAccess = (appId) =>
    isAdmin || appAccess.some(a => a.app_id === appId)

  // Helper: check if user is admin of a specific app
  const isAppAdmin = (appId) =>
    isAdmin || appAccess.some(a => a.app_id === appId && a.role === 'admin')

  const value = {
    user,
    session,
    isAdmin,
    appAccess,
    hasAppAccess,
    isAppAdmin,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
