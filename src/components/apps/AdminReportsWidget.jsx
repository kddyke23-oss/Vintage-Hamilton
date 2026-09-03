import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export default function AdminReportsWidget() {
  const { user, isAdmin } = useAuth()
  const [isEligible, setIsEligible] = useState(false)
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  // Clubhouse: anyone with a 'clubhouse' app_access row (RCP admin or Social
  // Committee user) gets a home-screen highlight — see Reservations/REQUIREMENTS.md
  // §2.10. Kept as its own eligibility flag since a committee-only member isn't
  // a general admin. The badge count is role-aware: RCP sees everything in their
  // queue needing action (new requests, payment follow-ups, escalations, pending
  // refunds — the same set as the "Needs action" filter on the Reservations admin
  // page), while the committee only ever sees escalated bookings, since that's
  // all they're able to act on.
  const [clubhouseEligible, setClubhouseEligible] = useState(false)
  const [isClubhouseRcp, setIsClubhouseRcp] = useState(false)
  const [clubhouseCount, setClubhouseCount] = useState(0)
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
        (a.app_id === 'blog' && a.role === 'admin') ||
        (a.app_id === 'recommendations' && a.role === 'admin')
      )
      const clubhouseAccess = access?.some(a => a.app_id === 'clubhouse')
      const clubhouseRcp = isAdmin || access?.some(a => a.app_id === 'clubhouse' && a.role === 'admin')

      const queries = []
      if (eligible) {
        setIsEligible(true)
        queries.push(
          supabase.from('blog_reports').select('id', { count: 'exact', head: true }).eq('resolved', false),
          supabase.from('rec_reports').select('id', { count: 'exact', head: true }).eq('resolved', false),
          supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('pending_review', true).eq('removed', false),
        )
      }
      if (clubhouseAccess) {
        setClubhouseEligible(true)
        setIsClubhouseRcp(clubhouseRcp)
        if (clubhouseRcp) {
          queries.push(
            supabase.from('clubhouse_reservations').select('id', { count: 'exact', head: true }).in('status', ['pending_rcp', 'pending_payment', 'escalated']),
            supabase.from('clubhouse_reservations').select('id', { count: 'exact', head: true }).eq('status', 'cancelled').not('check_received_at', 'is', null).is('refund_issued_at', null),
          )
        } else {
          queries.push(
            supabase.from('clubhouse_reservations').select('id', { count: 'exact', head: true }).eq('status', 'escalated')
          )
        }
      }

      if (queries.length === 0) { setLoading(false); return }
      const results = await Promise.all(queries)

      if (eligible) {
        const [{ count: blogCount }, { count: recReportCount }, { count: steerClearCount }] = results
        setUnresolvedCount((blogCount || 0) + (recReportCount || 0) + (steerClearCount || 0))
      }
      if (clubhouseAccess) {
        if (clubhouseRcp) {
          const { count: needsActionCount } = results[results.length - 2]
          const { count: needsRefundCount } = results[results.length - 1]
          setClubhouseCount((needsActionCount || 0) + (needsRefundCount || 0))
        } else {
          const { count } = results[results.length - 1]
          setClubhouseCount(count || 0)
        }
      }

      setLoading(false)
    }
    load()
  }, [user, isAdmin])

  if (loading || (!isEligible && !clubhouseEligible)) return null

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-700" style={{ fontFamily: "'Playfair Display', serif" }}>
          Admin
        </h2>
        {isEligible && (
          <Link to="/admin/reports" className="text-sm text-blue-600 hover:text-blue-800">
            Admin panel →
          </Link>
        )}
      </div>

      {isEligible && (
        <Link
          to="/admin/reports"
          className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚩</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">Content Reports</p>
              <p className="text-xs text-gray-400 mt-0.5">Flagged posts, comments, events and recommendations</p>
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
      )}

      {clubhouseEligible && (
        <Link
          to="/admin/reservations"
          className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏛️</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">
                {isClubhouseRcp ? 'Clubhouse Reservations' : 'Clubhouse Escalations'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isClubhouseRcp
                  ? 'New requests, payment follow-ups and refunds waiting on you'
                  : 'Bookings RCP believes may be private, awaiting review'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {clubhouseCount > 0 ? (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
                {clubhouseCount}
              </span>
            ) : (
              <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                All clear
              </span>
            )}
            <span className="text-gray-400 text-sm">→</span>
          </div>
        </Link>
      )}
    </div>
  )
}
