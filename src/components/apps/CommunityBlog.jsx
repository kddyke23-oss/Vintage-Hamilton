import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

const fmtDate = (ts) => {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── ReactionBar ────────────────────────────────────────────────────────────

function ReactionBar({ targetType, targetId, residentId, reactions, onReact }) {
  const likes = reactions.filter(r => r.target_type === targetType && r.target_id === targetId && r.reaction_type === 'like')
  const hearts = reactions.filter(r => r.target_type === targetType && r.target_id === targetId && r.reaction_type === 'heart')
  const myLike = likes.find(r => r.resident_id === residentId)
  const myHeart = hearts.find(r => r.resident_id === residentId)

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onReact(targetType, targetId, 'like', !!myLike)}
        className={`flex items-center gap-1 text-sm px-2 py-1 rounded-full transition-colors ${myLike ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        👍 <span>{likes.length || ''}</span>
      </button>
      <button
        onClick={() => onReact(targetType, targetId, 'heart', !!myHeart)}
        className={`flex items-center gap-1 text-sm px-2 py-1 rounded-full transition-colors ${myHeart ? 'bg-red-100 text-red-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        ❤️ <span>{hearts.length || ''}</span>
      </button>
    </div>
  )
}

// ─── PostCard (list view) ────────────────────────────────────────────────────

function PostCard({ post, residentId, reactions, onReact, onOpen, isBlogAdmin, onRemove, isOwnPost, onNavigateToEvent }) {
  const commentCount = post.comment_count || 0
  const likeCount = reactions.filter(r => r.target_type === 'post' && r.target_id === post.id && r.reaction_type === 'like').length
  const heartCount = reactions.filter(r => r.target_type === 'post' && r.target_id === post.id && r.reaction_type === 'heart').length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold text-gray-900 text-base cursor-pointer hover:text-blue-700 leading-snug"
            onClick={() => onOpen(post)}
          >
            {post.title}
          </h3>
          {post.calendar_event && (
            <button
              onClick={() => onNavigateToEvent(post.calendar_event.id)}
              className="mt-1 flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 w-fit hover:bg-amber-100 transition-colors"
            >
              <span>📅</span>
              <span className="truncate max-w-[200px]">{post.calendar_event.title}</span>
              <span className="text-amber-400">→</span>
            </button>
          )}
        </div>
        {(isBlogAdmin || isOwnPost) && (
          <button
            onClick={() => onRemove(post)}
            className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 text-sm"
            title="Remove post"
          >
            ✕
          </button>
        )}
      </div>

      {/* Preview */}
      <p
        className="text-sm text-gray-600 line-clamp-2 mb-3 cursor-pointer"
        onClick={() => onOpen(post)}
      >
        {post.body}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-600">{post.author_name || 'Resident'}</span>
          <span>·</span>
          <span>{fmt(post.created_at)}</span>
          {(likeCount > 0 || heartCount > 0) && (
            <>
              <span>·</span>
              {likeCount > 0 && <span>👍 {likeCount}</span>}
              {heartCount > 0 && <span>❤️ {heartCount}</span>}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpen(post)}
            className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            💬 <span>{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</span>
          </button>
          <ReactionBar
            targetType="post"
            targetId={post.id}
            residentId={residentId}
            reactions={reactions}
            onReact={onReact}
          />
        </div>
      </div>
    </div>
  )
}

// ─── PostModal (detail view) ─────────────────────────────────────────────────

function PostModal({ post, user, residentId, isBlogAdmin, reactions, onReact, onClose, onPostRemoved, onNavigateToEvent, toast }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [reportTargetType, setReportTargetType] = useState(null)
  const [reportTargetId, setReportTargetId] = useState(null)

  const fetchComments = useCallback(async () => {
    setLoadingComments(true)
    const { data, error } = await supabase
      .from('blog_comments')
      .select('id, body, created_by, created_at, removed')
      .eq('post_id', post.id)
      .eq('removed', false)
      .order('created_at', { ascending: true })

    if (error) { setLoadingComments(false); return }

    // Fetch author names
    const userIds = [...new Set(data.map(c => c.created_by).filter(Boolean))]
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

    setComments(data.map(c => ({ ...c, author_name: nameMap[c.created_by] || 'Resident' })))
    setLoadingComments(false)
  }, [post.id])

  useEffect(() => { fetchComments() }, [fetchComments])

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmitting(true)
    const { error } = await supabase
      .from('blog_comments')
      .insert({ post_id: post.id, body: newComment.trim(), created_by: user.id })
    setSubmitting(false)
    if (error) { toast.error('Could not add comment.'); return }
    setNewComment('')
    fetchComments()
  }

  const handleRemoveComment = async (comment) => {
    if (!window.confirm('Remove this comment?')) return
    const { error } = await supabase
      .from('blog_comments')
      .update({ removed: true })
      .eq('id', comment.id)
    if (error) { toast.error('Could not remove comment.'); return }
    toast.success('Comment removed.')
    fetchComments()
  }

  const handleRemovePost = async () => {
    if (!window.confirm('Remove this post? This cannot be undone.')) return
    // Soft-delete the post and any attached comments together
    const [{ error: postError }, { error: commentError }] = await Promise.all([
      supabase.from('blog_posts').update({ removed: true, calendar_event_id: null }).eq('id', post.id),
      supabase.from('blog_comments').update({ removed: true }).eq('post_id', post.id),
    ])
    if (postError || commentError) { toast.error('Could not remove post.'); return }
    toast.success('Post removed.')
    onPostRemoved(post.id)
    onClose()
  }

  const openReport = (type, id) => {
    setReportTargetType(type)
    setReportTargetId(id)
    setReportReason('')
    setShowReport(true)
  }

  const submitReport = async () => {
    if (!reportReason.trim()) return
    const { error } = await supabase
      .from('blog_reports')
      .insert({ target_type: reportTargetType, target_id: reportTargetId, reported_by: user.id, reason: reportReason.trim() })
    if (error) { toast.error('Could not submit report.'); return }
    toast.success('Report submitted. Thank you.')
    setShowReport(false)
  }

  const isOwnPost = post.created_by === user.id
  const canRemovePost = isBlogAdmin || isOwnPost

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-start justify-center p-4 pt-10 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`:root { --modal-z: 1500; }`}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-xl font-bold text-gray-900 leading-snug">{post.title}</h2>
            {post.calendar_event && (
              <button
                onClick={() => { onClose(); onNavigateToEvent(post.calendar_event.id) }}
                className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 w-fit hover:bg-amber-100 transition-colors"
              >
                <span>📅</span>
                <span>Related event: <strong>{post.calendar_event.title}</strong> · {fmtDate(post.calendar_event.event_date)}</span>
                <span className="text-amber-400 ml-1">→</span>
              </button>
            )}
            <div className="mt-2 text-sm text-gray-400">
              <span className="font-medium text-gray-600">{post.author_name || 'Resident'}</span>
              <span className="mx-1">·</span>
              <span>{fmtDate(post.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canRemovePost && (
              <button onClick={handleRemovePost} className="text-sm text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                Remove post
              </button>
            )}
            {!isOwnPost && (
              <button onClick={() => openReport('post', post.id)} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                🚩 Report
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none ml-1">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 border-b border-gray-100">
          <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{post.body}</p>
          <div className="mt-4">
            <ReactionBar
              targetType="post"
              targetId={post.id}
              residentId={residentId}
              reactions={reactions}
              onReact={onReact}
            />
          </div>
        </div>

        {/* Comments */}
        <div className="p-6">
          <h3 className="font-semibold text-gray-700 mb-4">
            Comments {!loadingComments && `(${comments.length})`}
          </h3>

          {loadingComments ? (
            <p className="text-sm text-gray-400">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-4">No comments yet — be the first!</p>
          ) : (
            <div className="space-y-4 mb-4">
              {comments.map(comment => {
                const isOwnComment = comment.created_by === user.id
                const canRemoveComment = isBlogAdmin || isOwnComment
                return (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700 flex-shrink-0 mt-0.5">
                      {(comment.author_name || 'R')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-50 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-700">{comment.author_name || 'Resident'}</span>
                          <span className="text-xs text-gray-400">{fmt(comment.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{comment.body}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 pl-1">
                        <ReactionBar
                          targetType="comment"
                          targetId={comment.id}
                          residentId={residentId}
                          reactions={reactions}
                          onReact={onReact}
                        />
                        {!isOwnComment && (
                          <button onClick={() => openReport('comment', comment.id)} className="text-xs text-gray-400 hover:text-gray-600">
                            🚩
                          </button>
                        )}
                        {canRemoveComment && (
                          <button onClick={() => handleRemoveComment(comment)} className="text-xs text-red-400 hover:text-red-600">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* New comment input */}
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-semibold text-amber-700 flex-shrink-0 mt-1">
              {(post.author_name || 'Y')[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment() }}
                placeholder="Add a comment…"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">Ctrl+Enter to submit</span>
                <button
                  onClick={handleAddComment}
                  disabled={submitting || !newComment.trim()}
                  className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report modal */}
      {showReport && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 1600, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowReport(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-1">Report {reportTargetType}</h3>
            <p className="text-sm text-gray-500 mb-3">Tell us why this content is inappropriate.</p>
            <textarea
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Reason…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowReport(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={submitReport}
                disabled={!reportReason.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AddPostModal ────────────────────────────────────────────────────────────

function AddPostModal({ user, onClose, onSaved, toast }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkedEventId, setLinkedEventId] = useState('')
  const [events, setEvents] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load recent + upcoming events for linking
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    supabase
      .from('calendar_events')
      .select('id, title, event_date')
      .eq('removed', false)
      .gte('event_date', cutoff.toISOString().split('T')[0])
      .order('event_date', { ascending: false })
      .limit(50)
      .then(({ data }) => setEvents(data || []))
  }, [])

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    const payload = {
      title: title.trim(),
      body: body.trim(),
      created_by: user.id,
      calendar_event_id: linkedEventId ? parseInt(linkedEventId) : null,
    }
    const { error } = await supabase.from('blog_posts').insert(payload)
    setSaving(false)
    if (error) { toast.error('Could not save post.'); return }
    toast.success('Post published!')
    onSaved()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 1500, backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`:root { --modal-z: 1500; }`}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">New Post</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Give your post a title…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body <span className="text-red-500">*</span></label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your post…"
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link to Calendar Event <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={linkedEventId}
              onChange={e => setLinkedEventId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="">— No linked event —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Shows events from the last 30 days and upcoming.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !body.trim()}
            className="px-5 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Publishing…' : 'Publish Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CommunityBlog() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [posts, setPosts] = useState([])
  const [reactions, setReactions] = useState([])
  const [residentId, setResidentId] = useState(null)
  const [isBlogAdmin, setIsBlogAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [selectedPost, setSelectedPost] = useState(null)
  const [showAddPost, setShowAddPost] = useState(false)
  const [search, setSearch] = useState('')

  const handleNavigateToEvent = (eventId) => {
    navigate(`/apps/calendar?openEvent=${eventId}`)
  }

  // ── Fetch resident_id & role ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const loadMeta = async () => {
      // resident_id from profile
      const { data: p } = await supabase
        .from('profiles')
        .select('resident_id')
        .eq('id', user.id)
        .single()
      if (p) setResidentId(p.resident_id)

      // blog admin?
      const { data: access } = await supabase
        .from('app_access')
        .select('app_id, role')
        .eq('user_id', user.id)
      if (access) {
        const isAdmin = access.some(a => a.app_id === 'admin') ||
          access.some(a => a.app_id === 'blog' && a.role === 'admin')
        setIsBlogAdmin(isAdmin)
      }
    }
    loadMeta()
  }, [user])

  // ── Fetch posts ───────────────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('blog_posts')
      .select(`
        id, title, body, created_by, created_at, locked, removed,
        calendar_event_id,
        calendar_events ( id, title, event_date )
      `)
      .eq('removed', false)
      .order('created_at', { ascending: false })

    if (error) { setLoading(false); return }

    // comment counts
    const postIds = data.map(p => p.id)
    let countMap = {}
    if (postIds.length > 0) {
      const { data: counts } = await supabase
        .from('blog_comments')
        .select('post_id')
        .in('post_id', postIds)
        .eq('removed', false)
      if (counts) {
        counts.forEach(c => { countMap[c.post_id] = (countMap[c.post_id] || 0) + 1 })
      }
    }

    // author names
    const userIds = [...new Set(data.map(p => p.created_by).filter(Boolean))]
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

    const enriched = data.map(p => ({
      ...p,
      comment_count: countMap[p.id] || 0,
      author_name: nameMap[p.created_by] || 'Resident',
      calendar_event: p.calendar_events || null,
    }))

    setPosts(enriched)
    setLoading(false)
  }, [])

  // ── Fetch reactions ───────────────────────────────────────────────────────
  const fetchReactions = useCallback(async () => {
    const { data } = await supabase
      .from('blog_reactions')
      .select('id, target_type, target_id, resident_id, reaction_type')
    setReactions(data || [])
  }, [])

  useEffect(() => {
    fetchPosts()
    fetchReactions()
  }, [fetchPosts, fetchReactions])

  // ── React handler ─────────────────────────────────────────────────────────
  const handleReact = async (targetType, targetId, reactionType, alreadyReacted) => {
    if (!residentId) return
    if (alreadyReacted) {
      await supabase
        .from('blog_reactions')
        .delete()
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('resident_id', residentId)
        .eq('reaction_type', reactionType)
    } else {
      // Upsert — replace any existing reaction from this resident on this target
      await supabase
        .from('blog_reactions')
        .upsert(
          { target_type: targetType, target_id: targetId, resident_id: residentId, reaction_type: reactionType },
          { onConflict: 'target_type,target_id,resident_id' }
        )
    }
    fetchReactions()
  }

  // ── Remove post ───────────────────────────────────────────────────────────
  const handleRemovePost = async (post) => {
    if (!window.confirm('Remove this post?')) return
    const [{ error: postError }, { error: commentError }] = await Promise.all([
      supabase.from('blog_posts').update({ removed: true, calendar_event_id: null }).eq('id', post.id),
      supabase.from('blog_comments').update({ removed: true }).eq('post_id', post.id),
    ])
    if (postError || commentError) { toast.error('Could not remove post.'); return }
    toast.success('Post removed.')
    setPosts(prev => prev.filter(p => p.id !== post.id))
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = posts.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.body.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts…"
              className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
            />
          </div>
          <button
            onClick={() => setShowAddPost(true)}
            className="bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-800 transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <span className="text-base leading-none">✏️</span> Write Post
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading posts…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-500 font-medium">
              {search ? 'No posts match your search.' : 'No posts yet — be the first to write one!'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(post => (
              <PostCard
                key={post.id}
                post={post}
                residentId={residentId}
                reactions={reactions}
                onReact={handleReact}
                onOpen={setSelectedPost}
                isBlogAdmin={isBlogAdmin}
                onRemove={handleRemovePost}
                isOwnPost={post.created_by === user?.id}
                onNavigateToEvent={handleNavigateToEvent}
              />
            ))}
          </div>
        )}
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          user={user}
          residentId={residentId}
          isBlogAdmin={isBlogAdmin}
          reactions={reactions}
          onReact={handleReact}
          onClose={() => setSelectedPost(null)}
          onPostRemoved={id => {
            setPosts(prev => prev.filter(p => p.id !== id))
            setSelectedPost(null)
          }}
          onNavigateToEvent={handleNavigateToEvent}
          toast={toast}
        />
      )}

      {/* Add post modal */}
      {showAddPost && (
        <AddPostModal
          user={user}
          onClose={() => setShowAddPost(false)}
          onSaved={fetchPosts}
          toast={toast}
        />
      )}
    </div>
  )
}
