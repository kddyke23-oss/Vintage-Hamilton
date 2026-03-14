import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export default function AdminReportsWidget() {
  const { user } = useAuth()
  const [isEligible, setIsEligible] = useState(false)
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { data: access } = await supabase
        .from('app_access')
        .select('app_id, role')
        .eq('user_id', user.id)

      const eligible = access?.some(a =>
        a.app_id === 'admin' ||
        (a.app_id === 'calendar' && a.role === 'admin') ||
        (a.app_id === 'blog' && a.role === 'admin')
      )

      if (!eligible) { setLoading(false); return }
      setIsEligible(true)

      const { count } = await supabase
        .from('blog_reports')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', false)

      setUnresolvedCount(count || 0)
      setLoading(false)
    }
    load()
  }, [user])

  if (loading || !isEligible) return null

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-700" style={{ fontFamily: "'Playfair Display', serif" }}>
          Admin
        </h2>
        <Link to="/admin/reports" className="text-sm text-blue-600 hover:text-blue-800">
          Admin panel →
        </Link>
      </div>
      <Link
        to="/admin/reports"
        className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚩</span>
          <div>
            <p className="font-medium text-gray-800 text-sm">Content Reports</p>
            <p className="text-xs text-gray-400 mt-0.5">Flagged posts, comments, and events</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {unresolvedCount > 0 ? (
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
              {unresolvedCount}
            </span>
          ) : (
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
              All clear
            </span>
          )}
          <span className="text-gray-400 text-sm">→</span>
        </div>
      </Link>
    </div>
  )
}
