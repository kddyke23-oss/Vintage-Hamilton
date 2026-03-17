import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { deleteStoragePhoto } from '@/lib/storage'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (ts) => {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const TARGET_LABELS = { event: '📅 Calendar Event', post: '📝 Blog Post', comment: '💬 Blog Comment' }

const CATEGORY_COLORS = [
  { label: 'Ocean Blue',   value: '#2C5F8A' },
  { label: 'Deep Navy',    value: '#1A3F5C' },
  { label: 'Warm Gold',    value: '#C9922A' },
  { label: 'Forest Green', value: '#2E7D32' },
  { label: 'Purple',       value: '#7B3F9E' },
  { label: 'Teal',         value: '#00796B' },
  { label: 'Rose',         value: '#C62828' },
  { label: 'Slate',        value: '#546E7A' },
]

// ─── Tab: Reports ─────────────────────────────────────────────────────────────

function ReportsTab() {
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('blog_reports')
      .select('id, target_type, target_id, reason, resolved, created_at, reported_by')
      .eq('resolved', showResolved)
      .order('created_at', { ascending: false })

    if (error) { setLoading(false); return }

    // Fetch reporter names
    const userIds = [...new Set(data.map(r => r.reported_by).filter(Boolean))]
    let nameMap = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, names, surname')
        .in('id', userIds)
      if (profiles) {
        profiles.forEach(p => {
          const first = p.names?.split(' ')[0] || ''
          nameMap[p.id] = `${first} ${p.surname || ''}`.trim()
        })
      }
    }

    // Batch-fetch content previews by type (avoids N+1 queries)
    const eventIds = [...new Set(data.filter(r => r.target_type === 'event').map(r => r.target_id))]
    const postIds = [...new Set(data.filter(r => r.target_type === 'post').map(r => r.target_id))]
    const commentIds = [...new Set(data.filter(r => r.target_type === 'comment').map(r => r.target_id))]

    const [eventsRes, postsRes, commentsRes] = await Promise.all([
      eventIds.length > 0
        ? supabase.from('calendar_events').select('id, title').in('id', eventIds)
        : { data: [] },
      postIds.length > 0
        ? supabase.from('blog_posts').select('id, title').in('id', postIds)
        : { data: [] },
      commentIds.length > 0
        ? supabase.from('blog_comments').select('id, body').in('id', commentIds)
        : { data: [] },
    ])

    const previewMap = {}
    ;(eventsRes.data || []).forEach(ev => { previewMap[`event-${ev.id}`] = ev.title })
    ;(postsRes.data || []).forEach(p => { previewMap[`post-${p.id}`] = p.title })
    ;(commentsRes.data || []).forEach(c => {
      previewMap[`comment-${c.id}`] = c.body.slice(0, 80) + (c.body.length > 80 ? '…' : '')
    })

    const enriched = data.map(report => ({
      ...report,
      preview: previewMap[`${report.target_type}-${report.target_id}`] || '(content unavailable)',
      reporter_name: nameMap[report.reported_by] || 'Unknown',
    }))

    setReports(enriched)
    setLoading(false)
  }, [showResolved])

  useEffect(() => { fetchReports() }, [fetchReports])

  const handleResolve = async (report) => {
    const { error } = await supabase
      .from('blog_reports')
      .update({ resolved: true })
      .eq('id', report.id)
    if (error) { toast.error('Could not resolve report.'); return }
    toast.success('Report marked as resolved.')
    fetchReports()
  }

  const handleReopen = async (report) => {
    const { error } = await supabase
      .from('blog_reports')
      .update({ resolved: false })
      .eq('id', report.id)
    if (error) { toast.error('Could not reopen report.'); return }
    toast.success('Report reopened.')
    fetchReports()
  }

  const unresolved = reports.filter(r => !r.resolved)
  const resolved = reports.filter(r => r.resolved)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Content Reports</h2>
          <p className="text-sm text-gray-500 mt-0.5">Flagged content from calendar events, blog posts, and comments.</p>
        </div>
        <button
          onClick={() => setShowResolved(v => !v)}
          className={`text-sm px-4 py-2 rounded-lg border transition-colors ${showResolved ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          {showResolved ? 'Show Unresolved' : 'Show Resolved'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">{showResolved ? '📋' : '✅'}</div>
          <p className="text-gray-500 font-medium">
            {showResolved ? 'No resolved reports.' : 'No unresolved reports — all clear!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {TARGET_LABELS[report.target_type] || report.target_type}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(report.created_at)}</span>
                    <span className="text-xs text-gray-400">· reported by <span className="font-medium text-gray-600">{report.reporter_name}</span></span>
                  </div>
                  <p className="font-medium text-gray-800 text-sm mb-1 truncate">{report.preview}</p>
                  <p className="text-sm text-gray-500"><span className="font-medium">Reason:</span> {report.reason}</p>
                </div>
                <div className="flex-shrink-0">
                  {report.resolved ? (
                    <button
                      onClick={() => handleReopen(report)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResolve(report)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Category Modal (defined outside tab to prevent focus loss on re-render) ──

function CatModal({ editingCat, catForm, setCatForm, tags, onSave, onClose }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 1500, backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`:root { --modal-z: 1500; }`}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{editingCat === 'new' ? 'New Category' : 'Edit Category'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={catForm.name}
              onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={catForm.description}
              onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCatForm(f => ({ ...f, color: c.value }))}
                  title={c.label}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${catForm.color === c.value ? 'border-gray-900 scale-110' : 'border-transparent hover:border-gray-400'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full text-white font-medium" style={{ backgroundColor: catForm.color }}>
                Preview badge
              </span>
              <span className="text-xs text-gray-400">{catForm.color}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Required Directory Tag <span className="text-gray-400 font-normal">(optional — restricts who can post)</span>
            </label>
            <select
              value={catForm.required_tag}
              onChange={e => setCatForm(f => ({ ...f, required_tag: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="">— No restriction (anyone can post) —</option>
              {tags.map(t => (
                <option key={t.id} value={t.label}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={onSave}
            disabled={!catForm.name.trim()}
            className="px-5 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            Save Category
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Recommendations ─────────────────────────────────────────────────────

function RecommendationsTab({ onCountChange }) {
  const toast = useToast()
  const navigate = useNavigate()

  // Negative reaction reports
  const [reports, setReports] = useState([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [showResolvedReports, setShowResolvedReports] = useState(false)

  // Steer Clear pending review
  const [steerClear, setSteerClear] = useState([])
  const [steerLoading, setSteerLoading] = useState(true)

  const fetchReports = useCallback(async () => {
    setReportsLoading(true)
    const { data } = await supabase
      .from('rec_reports')
      .select(`
        id, reaction_type, comment, comment_public, resolved, created_at,
        profiles!reporter_id(names, surname),
        recommendations(id, title, type)
      `)
      .eq('resolved', showResolvedReports)
      .order('created_at', { ascending: false })
    setReports(data || [])
    setReportsLoading(false)
  }, [showResolvedReports])

  const fetchSteerClear = useCallback(async () => {
    setSteerLoading(true)
    const { data } = await supabase
      .from('recommendations')
      .select(`
        id, title, description, created_at, pending_review,
        profiles!created_by(names, surname),
        rec_categories(name)
      `)
      .eq('pending_review', true)
      .eq('removed', false)
      .order('created_at', { ascending: false })
    setSteerClear(data || [])
    setSteerLoading(false)
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])
  useEffect(() => { fetchSteerClear() }, [fetchSteerClear])

  // ── Report actions ──────────────────────────────────────────────────────────

  const handleMakePublic = async (report) => {
    const { error } = await supabase
      .from('rec_reports')
      .update({ comment_public: true, resolved: true })
      .eq('id', report.id)
    if (error) { toast.error('Could not update report.'); return }
    toast.success('Comment made public and report resolved.')
    fetchReports()
    onCountChange()
  }

  const handleDismissReport = async (report) => {
    const { error } = await supabase
      .from('rec_reports')
      .update({ resolved: true, comment_public: false })
      .eq('id', report.id)
    if (error) { toast.error('Could not dismiss report.'); return }
    toast.success('Report dismissed.')
    fetchReports()
    onCountChange()
  }

  const handleRemovePost = async (recId) => {
    if (!window.confirm('Remove this recommendation? This cannot be undone.')) return

    // Fetch photo_url before removing so we can clean up storage
    const { data: recData } = await supabase
      .from('recommendations')
      .select('photo_url')
      .eq('id', recId)
      .single()

    // Soft-delete the post — if it's already gone, treat that as success
    const { error } = await supabase
      .from('recommendations')
      .update({ removed: true })
      .eq('id', recId)

    if (error && error.code !== 'PGRST116') {
      toast.error('Could not remove post.')
      return
    }

    // Clean up photo from storage (fire and forget)
    if (recData?.photo_url) {
      deleteStoragePhoto(recData.photo_url, 'recommendations')
    }

    // Auto-resolve all associated rec_reports so they don't linger
    await supabase
      .from('rec_reports')
      .update({ resolved: true })
      .eq('recommendation_id', recId)

    toast.success('Post removed and associated reports resolved.')
    fetchReports()
    fetchSteerClear()
    onCountChange()
  }

  // ── Steer Clear actions ─────────────────────────────────────────────────────

  const handleAcknowledge = async (rec) => {
    const { error } = await supabase
      .from('recommendations')
      .update({ pending_review: false })
      .eq('id', rec.id)
    if (error) { toast.error('Could not acknowledge.'); return }
    toast.success('Steer Clear acknowledged — post stays live.')
    fetchSteerClear()
    onCountChange()
  }

  const reactionLabel = (type) => ({
    thumbsdown: '👎 Thumbs Down',
    notmyexperience: '🤔 Not My Experience',
  }[type] || type)

  return (
    <div className="space-y-10">

      {/* ── Steer Clear Pending Review ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">⚠️ Steer Clear — Pending Review</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              New Steer Clear warnings are live immediately but flagged for admin review.
            </p>
          </div>
          {steerClear.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {steerClear.length}
            </span>
          )}
        </div>

        {steerLoading ? (
          <div className="text-center py-8 text-gray-400">Loading…</div>
        ) : steerClear.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-gray-500 text-sm">No Steer Clear posts awaiting review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {steerClear.map(rec => {
              const author = rec.profiles
                ? `${rec.profiles.names ?? ''} ${rec.profiles.surname ?? ''}`.trim()
                : 'Unknown'
              return (
                <div key={rec.id} className="bg-white rounded-xl border border-red-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                          ⚠️ Steer Clear
                        </span>
                        {rec.rec_categories?.name && (
                          <span className="text-xs text-gray-400">{rec.rec_categories.name}</span>
                        )}
                        <span className="text-xs text-gray-400">{fmtDate(rec.created_at)}</span>
                      </div>
                      <p className="font-semibold text-gray-800 mb-1">{rec.title}</p>
                      {rec.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{rec.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">Posted by <span className="font-medium text-gray-600">{author}</span></p>
                      <button
                        onClick={() => navigate(`/apps/recommendations?openPost=${rec.id}`)}
                        className="text-xs text-[#2C5F8A] hover:text-[#1A3F5C] underline underline-offset-2 mt-1 transition"
                      >
                        View post →
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAcknowledge(rec)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
                      >
                        ✓ Acknowledge
                      </button>
                      <button
                        onClick={() => handleRemovePost(rec.id)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                      >
                        Remove Post
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Negative Reaction Reports ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">👎 Negative Reaction Reports</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Comments submitted with thumbs-down or "not my experience" reactions.
            </p>
          </div>
          <button
            onClick={() => setShowResolvedReports(v => !v)}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              showResolvedReports
                ? 'bg-gray-100 border-gray-300 text-gray-700'
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {showResolvedReports ? 'Show Unresolved' : 'Show Resolved'}
          </button>
        </div>

        {reportsLoading ? (
          <div className="text-center py-8 text-gray-400">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">{showResolvedReports ? '📋' : '✅'}</div>
            <p className="text-gray-500 text-sm">
              {showResolvedReports ? 'No resolved reports.' : 'No unresolved reports — all clear!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => {
              const reporter = report.profiles
                ? `${report.profiles.names ?? ''} ${report.profiles.surname ?? ''}`.trim()
                : 'Unknown'
              const recTitle = report.recommendations?.title ?? '(post unavailable)'
              const recId = report.recommendations?.id
              return (
                <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">
                          {reactionLabel(report.reaction_type)}
                        </span>
                        {report.comment_public && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            Public
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{fmtDate(report.created_at)}</span>
                        <span className="text-xs text-gray-400">
                          · by <span className="font-medium text-gray-600">{reporter}</span>
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">
                        On: <span className="font-medium text-gray-600">{recTitle}</span>
                        {recId && (
                          <button
                            onClick={() => navigate(`/apps/recommendations?openPost=${recId}`)}
                            className="ml-2 text-[#2C5F8A] hover:text-[#1A3F5C] underline underline-offset-2 transition"
                          >
                            View post →
                          </button>
                        )}
                      </p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 mt-2">
                        "{report.comment}"
                      </p>
                    </div>

                    {!report.resolved ? (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleMakePublic(report)}
                          className="text-sm px-3 py-1.5 rounded-lg bg-[#2C5F8A] text-white hover:bg-[#1A3F5C] transition-colors whitespace-nowrap"
                        >
                          Make Public
                        </button>
                        <button
                          onClick={() => handleDismissReport(report)}
                          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                        {recId && (
                          <button
                            onClick={() => handleRemovePost(recId)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                          >
                            Remove Post
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic flex-shrink-0">Resolved</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Categories & Tags ───────────────────────────────────────────────────

function CategoriesTagsTab() {
  const toast = useToast()

  // Categories state
  const [categories, setCategories] = useState([])
  const [catLoading, setCatLoading] = useState(true)
  const [editingCat, setEditingCat] = useState(null) // null | 'new' | category object
  const [catForm, setCatForm] = useState({ name: '', description: '', color: '#2C5F8A', required_tag: '' })

  // Rec categories state
  const [recCats, setRecCats] = useState([])
  const [recCatLoading, setRecCatLoading] = useState(true)
  const [recSubs, setRecSubs] = useState([])
  const [editingRecCat, setEditingRecCat] = useState(null) // null | 'new' | object
  const [recCatForm, setRecCatForm] = useState({ name: '' })
  const [recCatSaving, setRecCatSaving] = useState(false)
  // Subcategory inline add
  const [newSubName, setNewSubName] = useState('')
  const [newSubCatId, setNewSubCatId] = useState(null)
  const [editingSub, setEditingSub] = useState(null) // { id, name }

  const fetchRecCats = useCallback(async () => {
    setRecCatLoading(true)
    const { data: cats } = await supabase
      .from('rec_categories')
      .select('id, name')
      .order('id')
    const { data: subs } = await supabase
      .from('rec_subcategories')
      .select('id, category_id, name')
      .order('name')
    setRecCats(cats || [])
    setRecSubs(subs || [])
    setRecCatLoading(false)
  }, [])

  useEffect(() => { fetchRecCats() }, [fetchRecCats])
  const [tagLoading, setTagLoading] = useState(true)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [editingTag, setEditingTag] = useState(null)
  const [editTagLabel, setEditTagLabel] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    setCatLoading(true)
    const { data } = await supabase
      .from('calendar_categories')
      .select('id, name, description, color, required_tag')
      .order('id')
    setCategories(data || [])
    setCatLoading(false)
  }, [])

  const fetchTags = useCallback(async () => {
    setTagLoading(true)
    const { data } = await supabase
      .from('directory_tags')
      .select('id, label')
      .order('label')
    setTags(data || [])
    setTagLoading(false)
  }, [])

  useEffect(() => { fetchCategories(); fetchTags() }, [fetchCategories, fetchTags])

  // ── Category CRUD ──────────────────────────────────────────────────────────

  const openNewCat = () => {
    setEditingCat('new')
    setCatForm({ name: '', description: '', color: '#2C5F8A', required_tag: '' })
  }

  const openEditCat = (cat) => {
    setEditingCat(cat)
    setCatForm({ name: cat.name, description: cat.description || '', color: cat.color || '#2C5F8A', required_tag: cat.required_tag || '' })
  }

  const saveCat = async () => {
    if (!catForm.name.trim()) return
    const payload = {
      name: catForm.name.trim(),
      description: catForm.description.trim() || null,
      color: catForm.color,
      required_tag: catForm.required_tag || null,
    }
    let error
    if (editingCat === 'new') {
      ;({ error } = await supabase.from('calendar_categories').insert(payload))
    } else {
      ;({ error } = await supabase.from('calendar_categories').update(payload).eq('id', editingCat.id))
    }
    if (error) { toast.error('Could not save category.'); return }
    toast.success(editingCat === 'new' ? 'Category created.' : 'Category updated.')
    setEditingCat(null)
    fetchCategories()
  }

  const deleteCat = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"? Events using it will lose their category.`)) return
    const { error } = await supabase.from('calendar_categories').delete().eq('id', cat.id)
    if (error) { toast.error('Could not delete category.'); return }
    toast.success('Category deleted.')
    fetchCategories()
  }

  // ── Rec Category CRUD ──────────────────────────────────────────────────────

  const saveRecCat = async () => {
    if (!recCatForm.name.trim()) return
    setRecCatSaving(true)
    let error
    if (editingRecCat === 'new') {
      ;({ error } = await supabase.from('rec_categories').insert({ name: recCatForm.name.trim() }))
    } else {
      ;({ error } = await supabase.from('rec_categories').update({ name: recCatForm.name.trim() }).eq('id', editingRecCat.id))
    }
    setRecCatSaving(false)
    if (error) { toast.error('Could not save category.'); return }
    toast.success(editingRecCat === 'new' ? 'Category created.' : 'Category updated.')
    setEditingRecCat(null)
    fetchRecCats()
  }

  const deleteRecCat = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? All its subcategories will also be deleted.`)) return
    const { error } = await supabase.from('rec_categories').delete().eq('id', cat.id)
    if (error) { toast.error('Could not delete category.'); return }
    toast.success('Category deleted.')
    fetchRecCats()
  }

  const addRecSub = async (categoryId) => {
    if (!newSubName.trim()) return
    const { error } = await supabase.from('rec_subcategories').insert({ category_id: categoryId, name: newSubName.trim() })
    if (error) { toast.error('Could not add subcategory.'); return }
    toast.success('Subcategory added.')
    setNewSubName('')
    setNewSubCatId(null)
    fetchRecCats()
  }

  const saveRecSub = async (sub) => {
    if (!editingSub?.name?.trim()) return
    const { error } = await supabase.from('rec_subcategories').update({ name: editingSub.name.trim() }).eq('id', sub.id)
    if (error) { toast.error('Could not update subcategory.'); return }
    toast.success('Subcategory updated.')
    setEditingSub(null)
    fetchRecCats()
  }

  const deleteRecSub = async (sub) => {
    if (!window.confirm(`Delete subcategory "${sub.name}"?`)) return
    const { error } = await supabase.from('rec_subcategories').delete().eq('id', sub.id)
    if (error) { toast.error('Could not delete subcategory.'); return }
    toast.success('Subcategory deleted.')
    fetchRecCats()
  }

  // ── Tag CRUD ───────────────────────────────────────────────────────────────

  const addTag = async () => {
    if (!newTagLabel.trim()) return
    const { error } = await supabase.from('directory_tags').insert({ label: newTagLabel.trim() })
    if (error) { toast.error(error.code === '23505' ? 'That tag already exists.' : 'Could not add tag.'); return }
    toast.success('Tag added.')
    setNewTagLabel('')
    fetchTags()
  }

  const saveTag = async (tag) => {
    if (!editTagLabel.trim()) return
    const { error } = await supabase.from('directory_tags').update({ label: editTagLabel.trim() }).eq('id', tag.id)
    if (error) { toast.error('Could not update tag.'); return }
    toast.success('Tag updated.')
    setEditingTag(null)
    fetchTags()
  }

  const deleteTag = async (tag) => {
    if (!window.confirm(`Delete tag "${tag.label}"? It will be removed from the category required_tag dropdown but existing profile tags are unaffected.`)) return
    const { error } = await supabase.from('directory_tags').delete().eq('id', tag.id)
    if (error) { toast.error('Could not delete tag.'); return }
    toast.success('Tag deleted.')
    fetchTags()
  }

  // ── Category form modal ────────────────────────────────────────────────────

  // (CatModal is defined as a top-level component above to prevent focus loss)

  return (
    <div className="space-y-10">

      {/* ── Calendar Categories ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Calendar Categories</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage event categories and their posting restrictions.</p>
          </div>
          <button
            onClick={openNewCat}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + New Category
          </button>
        </div>

        {catLoading ? (
          <div className="text-sm text-gray-400 py-4">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Required Tag</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map(cat => (
                  <tr key={cat.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="font-medium text-gray-800">{cat.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{cat.description || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {cat.required_tag
                        ? <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">{cat.required_tag}</span>
                        : <span className="text-gray-400 text-xs">None</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCat(cat)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">Edit</button>
                        <button onClick={() => deleteCat(cat)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recommendation Categories ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recommendation Categories</h2>
            <p className="text-sm text-gray-500 mt-0.5">Categories and subcategories used in the Recommendations feature.</p>
          </div>
          <button
            onClick={() => { setEditingRecCat('new'); setRecCatForm({ name: '' }) }}
            className="bg-[#2C5F8A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1A3F5C] transition-colors"
          >
            + New Category
          </button>
        </div>

        {/* Inline new/edit category form */}
        {editingRecCat !== null && (
          <div className="bg-[#EAF0F7] border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3">
            <input
              type="text"
              value={recCatForm.name}
              onChange={e => setRecCatForm({ name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveRecCat(); if (e.key === 'Escape') setEditingRecCat(null) }}
              placeholder="Category name…"
              autoFocus
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]"
            />
            <button
              onClick={saveRecCat}
              disabled={recCatSaving || !recCatForm.name.trim()}
              className="bg-[#2C5F8A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1A3F5C] disabled:opacity-50 transition-colors"
            >
              {recCatSaving ? 'Saving…' : editingRecCat === 'new' ? 'Add' : 'Save'}
            </button>
            <button onClick={() => setEditingRecCat(null)} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">Cancel</button>
          </div>
        )}

        {recCatLoading ? (
          <div className="text-sm text-gray-400 py-4">Loading…</div>
        ) : recCats.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No categories yet.</p>
        ) : (
          <div className="space-y-3">
            {recCats.map(cat => {
              const catSubs = recSubs.filter(s => s.category_id === cat.id)
              const isAddingSub = newSubCatId === cat.id
              return (
                <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Category row */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <span className="font-semibold text-gray-800 text-sm">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingRecCat(cat); setRecCatForm({ name: cat.name }) }}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      >Edit</button>
                      <button
                        onClick={() => deleteRecCat(cat)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      >Delete</button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  <div className="divide-y divide-gray-50">
                    {catSubs.map(sub => (
                      <div key={sub.id} className="flex items-center justify-between px-5 py-2">
                        {editingSub?.id === sub.id ? (
                          <input
                            type="text"
                            value={editingSub.name}
                            onChange={e => setEditingSub(s => ({ ...s, name: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveRecSub(sub); if (e.key === 'Escape') setEditingSub(null) }}
                            autoFocus
                            className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 mr-3"
                          />
                        ) : (
                          <span className="text-sm text-gray-600">↳ {sub.name}</span>
                        )}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {editingSub?.id === sub.id ? (
                            <>
                              <button onClick={() => saveRecSub(sub)} className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50">Save</button>
                              <button onClick={() => setEditingSub(null)} className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditingSub({ id: sub.id, name: sub.name })} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">Edit</button>
                              <button onClick={() => deleteRecSub(sub)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Inline add subcategory */}
                    {isAddingSub ? (
                      <div className="flex items-center gap-2 px-5 py-2">
                        <input
                          type="text"
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addRecSub(cat.id); if (e.key === 'Escape') { setNewSubCatId(null); setNewSubName('') } }}
                          placeholder="Subcategory name…"
                          autoFocus
                          className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button onClick={() => addRecSub(cat.id)} className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50">Add</button>
                        <button onClick={() => { setNewSubCatId(null); setNewSubName('') }} className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100">Cancel</button>
                      </div>
                    ) : (
                      <div className="px-5 py-2">
                        <button
                          onClick={() => { setNewSubCatId(cat.id); setNewSubName('') }}
                          className="text-xs text-[#2C5F8A] hover:text-[#1A3F5C] hover:underline"
                        >
                          + Add subcategory
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Directory Tags ── */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">Directory Tags</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Standardised tags used on resident profiles and as category posting restrictions. Changes here affect what's available in the directory edit modal and category settings.
          </p>
        </div>

        {/* Add new tag */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTagLabel}
            onChange={e => setNewTagLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag() }}
            placeholder="New tag label…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={addTag}
            disabled={!newTagLabel.trim()}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            Add Tag
          </button>
        </div>

        {tagLoading ? (
          <div className="text-sm text-gray-400 py-4">Loading…</div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No tags yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tag</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tags.map(tag => (
                  <tr key={tag.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {editingTag?.id === tag.id ? (
                        <input
                          type="text"
                          value={editTagLabel}
                          onChange={e => setEditTagLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveTag(tag); if (e.key === 'Escape') setEditingTag(null) }}
                          autoFocus
                          className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-48"
                        />
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {tag.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingTag?.id === tag.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveTag(tag)} className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50">Save</button>
                          <button onClick={() => setEditingTag(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setEditingTag(tag); setEditTagLabel(tag.label) }}
                            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                          >
                            Rename
                          </button>
                          <button onClick={() => deleteTag(tag)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category modal */}
      {editingCat !== null && (
        <CatModal
          editingCat={editingCat}
          catForm={catForm}
          setCatForm={setCatForm}
          tags={tags}
          onSave={saveCat}
          onClose={() => setEditingCat(null)}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'reports', label: '🚩 Reports' },
  { id: 'recommendations', label: '⭐ Recommendations' },
  { id: 'categories', label: '🗂️ Categories & Tags' },
]

export default function ReportsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('reports')
  const [isEligible, setIsEligible] = useState(null)
  const [tabCounts, setTabCounts] = useState({ reports: 0, recommendations: 0 })

  const fetchTabCounts = useCallback(async () => {
    const [
      { count: blogCount },
      { count: recReportCount },
      { count: steerCount },
    ] = await Promise.all([
      supabase.from('blog_reports').select('id', { count: 'exact', head: true }).eq('resolved', false),
      supabase.from('rec_reports').select('id', { count: 'exact', head: true }).eq('resolved', false),
      supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('pending_review', true).eq('removed', false),
    ])
    setTabCounts({
      reports: blogCount || 0,
      recommendations: (recReportCount || 0) + (steerCount || 0),
    })
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('app_access')
      .select('app_id, role')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const ok = data?.some(a =>
          a.app_id === 'admin' ||
          (a.app_id === 'calendar' && a.role === 'admin') ||
          (a.app_id === 'blog' && a.role === 'admin') ||
          (a.app_id === 'recommendations' && a.role === 'admin')
        )
        setIsEligible(!!ok)
        if (ok) fetchTabCounts()
      })
  }, [user])

  if (isEligible === null) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Checking access…</div>
  }

  if (!isEligible) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Authorisation Required</h2>
          <p className="text-gray-500 text-sm">You need calendar or blog admin access to view this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
          Admin Panel
        </h1>
        <p className="text-gray-500 text-sm mt-1">Manage reports, calendar categories, and directory tags.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-8">
        {TABS.map(tab => {
          const count = tabCounts[tab.id] || 0
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'recommendations' && <RecommendationsTab onCountChange={fetchTabCounts} />}
      {activeTab === 'categories' && <CategoriesTagsTab />}
    </div>
  )
}
