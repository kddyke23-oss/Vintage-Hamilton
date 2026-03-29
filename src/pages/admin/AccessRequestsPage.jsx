import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'

const STATUS_STYLES = {
  pending:  { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
  approved: { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800',  badge: 'bg-green-100 text-green-800',   label: 'Approved' },
  rejected: { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    badge: 'bg-red-100 text-red-800',       label: 'Rejected' },
}

export default function AccessRequestsPage() {
  const toast = useToast()
  const { user } = useAuth()

  const [requests, setRequests]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [processing, setProcessing] = useState(null) // request id being processed
  const [filter, setFilter]         = useState('pending')
  const [rejectModal, setRejectModal] = useState(null) // { id, ... }
  const [rejectReason, setRejectReason] = useState('')
  const [myResidentId, setMyResidentId] = useState(null)

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (error) {
      toast.error('Failed to load requests: ' + error.message)
    } else {
      setRequests(data || [])
    }
    setLoading(false)
  }, [])

  // Get current user's resident_id for the reviewed_by field
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('resident_id').eq('id', user.id).maybeSingle()
        .then(({ data }) => { if (data) setMyResidentId(data.resident_id) })
    }
  }, [user?.id])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const filtered = requests.filter(r => filter === 'all' || r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  // ── Approve ──
  const handleApprove = async (req) => {
    setProcessing(req.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')

      // Build the people array from the request
      const people = [{
        surname: req.primary_surname,
        names: req.primary_names,
        email: req.primary_email,
        phone: req.primary_phone,
        address: req.address,
        directoryVisible: req.primary_directory_visible,
        notifyCalendar: req.primary_notify_calendar,
        notifyBlog: req.primary_notify_blog,
      }]

      if (req.secondary_surname && req.secondary_email) {
        people.push({
          surname: req.secondary_surname,
          names: req.secondary_names,
          email: req.secondary_email,
          phone: req.secondary_phone,
          address: req.address,
          directoryVisible: req.secondary_directory_visible,
          notifyCalendar: req.secondary_notify_calendar,
          notifyBlog: req.secondary_notify_blog,
        })
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            mode: 'approve-request',
            requestId: req.id,
            people,
            reviewerId: myResidentId,
          }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Something went wrong')

      toast.success(`Approved! ${people.length} resident(s) created with temporary password Pa55word.`)
      fetchRequests()
    } catch (e) {
      toast.error('Approval failed: ' + e.message)
    } finally {
      setProcessing(null)
    }
  }

  // ── Reject ──
  const handleReject = async () => {
    if (!rejectModal) return
    setProcessing(rejectModal.id)
    try {
      const { error } = await supabase
        .from('access_requests')
        .update({
          status: 'rejected',
          reviewed_by: myResidentId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectReason.trim() || null,
        })
        .eq('id', rejectModal.id)

      if (error) throw error
      toast.info('Request rejected.')
      setRejectModal(null)
      setRejectReason('')
      fetchRequests()
    } catch (e) {
      toast.error('Failed to reject: ' + e.message)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with back link */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link to="/admin/access" className="text-brand-400 hover:text-brand-600 text-sm">← Admin Portal</Link>
          </div>
          <h1 className="font-display text-3xl text-brand-800 mb-1">Access Requests</h1>
          <p className="text-brand-500">Review and approve new resident access requests.</p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-yellow-100 text-yellow-800 text-sm font-semibold px-3 py-1 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'pending', label: 'Pending' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'all', label: 'All' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
              filter === t.key
                ? 'bg-brand-700 text-white'
                : 'bg-brand-100 text-brand-600 hover:bg-brand-200'
            }`}
          >
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-400 text-brand-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request cards */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400 animate-pulse">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-brand-400">
          {filter === 'pending' ? 'No pending requests.' : 'No requests found.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              processing={processing === req.id}
              onApprove={() => handleApprove(req)}
              onReject={() => setRejectModal(req)}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-display text-lg text-brand-800 mb-3">Reject Request</h3>
            <p className="text-sm text-brand-500 mb-4">
              Rejecting request from <strong>{rejectModal.primary_names} {rejectModal.primary_surname}</strong>.
              You can optionally provide a reason.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-4"
              rows={3}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="px-4 py-2 text-sm text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={processing === rejectModal.id}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-60"
              >
                {processing === rejectModal.id ? 'Rejecting…' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Request Card ──

function RequestCard({ req, processing, onApprove, onReject }) {
  const style = STATUS_STYLES[req.status] || STATUS_STYLES.pending
  const hasSecondary = !!(req.secondary_surname && req.secondary_email)
  const submittedDate = new Date(req.submitted_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  return (
    <div className={`${style.bg} border ${style.border} rounded-2xl p-5`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge} mb-2`}>
            {style.label}
          </span>
          <h3 className="font-display text-lg text-brand-800">
            {req.primary_names} {req.primary_surname}
            {hasSecondary && <span className="text-brand-400 font-normal"> &amp; {req.secondary_names} {req.secondary_surname}</span>}
          </h3>
          <p className="text-sm text-brand-500">{req.address}</p>
        </div>
        <span className="text-xs text-brand-400 whitespace-nowrap">{submittedDate}</span>
      </div>

      {/* People details */}
      <div className={`grid ${hasSecondary ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3 mb-4`}>
        <PersonDetail label="Primary" person={{
          name: `${req.primary_names} ${req.primary_surname}`,
          email: req.primary_email,
          phone: req.primary_phone,
          directoryVisible: req.primary_directory_visible,
          notifyCalendar: req.primary_notify_calendar,
          notifyBlog: req.primary_notify_blog,
        }} />
        {hasSecondary && (
          <PersonDetail label="Secondary" person={{
            name: `${req.secondary_names} ${req.secondary_surname}`,
            email: req.secondary_email,
            phone: req.secondary_phone,
            directoryVisible: req.secondary_directory_visible,
            notifyCalendar: req.secondary_notify_calendar,
            notifyBlog: req.secondary_notify_blog,
          }} />
        )}
      </div>

      {/* Action buttons — only for pending */}
      {req.status === 'pending' && (
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            disabled={processing}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {processing ? 'Approving…' : '✅ Approve & Create Accounts'}
          </button>
          <button
            onClick={onReject}
            disabled={processing}
            className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {/* Rejection reason */}
      {req.status === 'rejected' && req.rejection_reason && (
        <p className="text-sm text-red-600 mt-2">
          <strong>Reason:</strong> {req.rejection_reason}
        </p>
      )}
    </div>
  )
}

function PersonDetail({ label, person }) {
  return (
    <div className="bg-white/70 rounded-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-brand-700">{label}: {person.name}</p>
      <p className="text-brand-500">📧 {person.email}</p>
      {person.phone && <p className="text-brand-500">📱 {person.phone}</p>}
      <div className="flex flex-wrap gap-2 mt-1.5">
        <Chip active={person.directoryVisible}>Directory visible</Chip>
        <Chip active={person.notifyCalendar}>Calendar notifications</Chip>
        <Chip active={person.notifyBlog}>Blog notifications</Chip>
      </div>
    </div>
  )
}

function Chip({ active, children }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
    }`}>
      {active ? '✓' : '✗'} {children}
    </span>
  )
}
