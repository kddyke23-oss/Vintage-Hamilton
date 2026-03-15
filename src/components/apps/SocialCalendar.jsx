import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = ((hour % 12) || 12) + ':' + m + ' ' + ampm
  return display
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

function isToday(year, month, day) {
  const t = new Date()
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
}

function isFutureOrToday(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') >= today
}

// ─── Add/Edit Event Modal ────────────────────────────────────────────────────

function EventModal({ categories, editEvent, onClose, onSaved, profile, isCalendarAdmin, toast, user }) {
  const today = new Date().toISOString().split('T')[0]

  // Filter categories based on profile tags — compute before form init
  const allowedCategories = categories.filter(cat => {
    if (!cat.required_tag) return true           // NULL = open to all
    if (isCalendarAdmin) return true             // admins see everything
    if (!profile?.tags?.length) return false     // no tags = no restricted categories
    return profile.tags.includes(cat.required_tag)
  })

  const [form, setForm] = useState({
    title: editEvent?.title || '',
    description: editEvent?.description || '',
    location: editEvent?.location || '',
    event_date: editEvent?.event_date || today,
    event_time: editEvent?.event_time?.slice(0, 5) || '',
    category_id: editEvent?.category_id || (allowedCategories[0]?.id ?? ''),
    external_url: editEvent?.external_url || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // If categories load after modal opens, set default once available
  useEffect(() => {
    if (!editEvent && !form.category_id && allowedCategories.length > 0) {
      set('category_id', allowedCategories[0].id)
    }
  }, [allowedCategories.length])

  async function handleSubmit() {
    if (!form.title.trim()) return toast.error('Please enter a title')
    if (!form.event_date) return toast.error('Please select a date')
    if (!form.category_id) return toast.error('Please select a category')

    // Validate URL if provided
    if (form.external_url.trim()) {
      try {
        const url = form.external_url.trim()
        const withProtocol = url.startsWith('http') ? url : 'https://' + url
        new URL(withProtocol)
      } catch {
        return toast.error('Please enter a valid URL')
      }
    }

    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      event_date: form.event_date,
      event_time: form.event_time || null,
      category_id: parseInt(form.category_id),
      external_url: form.external_url.trim()
        ? (form.external_url.startsWith('http') ? form.external_url.trim() : 'https://' + form.external_url.trim())
        : null,
    }

    let error
    if (editEvent) {
      ;({ error } = await supabase.from('calendar_events').update(payload).eq('id', editEvent.id))
    } else {
      ;({ error } = await supabase.from('calendar_events').insert({ ...payload, created_by: user.id }))
    }

    setSaving(false)
    if (error) {
      toast.error('Failed to save event')
    } else {
      toast.success(editEvent ? 'Event updated' : 'Event added!')
      onSaved()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="font-display text-xl text-brand-800 mb-5">
            {editEvent ? 'Edit Event' : 'Add Event'}
          </h2>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Title *</label>
              <input
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="Event title"
                maxLength={100}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Category *</label>
              <select
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={form.category_id}
                onChange={e => set('category_id', e.target.value)}
              >
                {allowedCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">Date *</label>
                <input
                  type="date"
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.event_date}
                  onChange={e => set('event_date', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">Time <span className="text-brand-400">(optional)</span></label>
                <input
                  type="time"
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.event_time}
                  onChange={e => set('event_time', e.target.value)}
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Location <span className="text-brand-400">(optional)</span></label>
              <input
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Clubhouse, Pool deck…"
                maxLength={100}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Description <span className="text-brand-400">(optional)</span></label>
              <textarea
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                rows={3}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="More details about the event…"
                maxLength={500}
              />
            </div>

            {/* External URL */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">
                External Link <span className="text-brand-400">(optional)</span>
              </label>
              <input
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={form.external_url}
                onChange={e => set('external_url', e.target.value)}
                placeholder="https://example.com"
              />
              <p className="text-xs text-brand-400 mt-1">Link to an external website, ticketing page, or more info</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-brand-200 text-brand-600 text-sm hover:bg-brand-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : (editEvent ? 'Save Changes' : 'Add Event')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event Detail Modal ──────────────────────────────────────────────────────

function EventDetailModal({ event, categories, currentUserId, isCalendarAdmin, onClose, onEdit, onRemove, onReport, onRsvp, userRsvp }) {
  const cat = categories.find(c => c.id === event.category_id)
  const canModify = isCalendarAdmin || event.created_by === currentUserId
  const upcoming = isFutureOrToday(event.event_date)
  const [showAttendees, setShowAttendees] = useState(false)
  const [attendees, setAttendees] = useState([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)

  async function fetchAttendees() {
    if (attendees.length > 0) { setShowAttendees(true); return }
    setLoadingAttendees(true)
    const { data: rsvpRows } = await supabase
      .from('calendar_rsvps')
      .select('resident_id')
      .eq('event_id', event.id)
    if (rsvpRows && rsvpRows.length > 0) {
      const ids = rsvpRows.map(r => r.resident_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('resident_id, names, surname')
        .in('resident_id', ids)
      setAttendees(profiles?.map(p => [p.names, p.surname].filter(Boolean).join(' ')) || [])
    } else {
      setAttendees([])
    }
    setLoadingAttendees(false)
    setShowAttendees(true)
  }

  function toggleAttendees() {
    if (showAttendees) { setShowAttendees(false) }
    else { fetchAttendees() }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Category badge */}
          {cat && (
            <span
              className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3"
              style={{ backgroundColor: cat.color + '22', color: cat.color }}
            >
              {cat.name}
            </span>
          )}

          <h2 className="font-display text-2xl text-brand-800 mb-1">{event.title}</h2>

          <div className="space-y-2 mt-3 text-sm text-brand-600">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDate(event.event_date)}{event.event_time ? ' · ' + formatTime(event.event_time) : ''}</span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{event.location}</span>
              </div>
            )}
            {event.author_name && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Added by {event.author_name}</span>
              </div>
            )}
          </div>

          {event.description && (
            <p className="mt-4 text-sm text-brand-700 leading-relaxed">{event.description}</p>
          )}

          {/* External link */}
          {event.external_url && (
            <a
              href={event.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 underline underline-offset-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              More information
            </a>
          )}

          {/* RSVP + attendees */}
          {upcoming && (
            <div className="mt-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onRsvp(event)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    userRsvp
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-brand-700 text-white hover:bg-brand-600'
                  }`}
                >
                  {userRsvp ? '✓ I\'m going' : 'I\'m going'}
                </button>
                {event.rsvp_count > 0 && (
                  <button
                    onClick={toggleAttendees}
                    className="text-sm text-brand-500 hover:text-brand-700 underline underline-offset-2 transition-colors"
                  >
                    {event.rsvp_count} {event.rsvp_count === 1 ? 'person' : 'people'} going
                    <span className="ml-1">{showAttendees ? '▲' : '▼'}</span>
                  </button>
                )}
              </div>

              {/* Attendee list */}
              {showAttendees && (
                <div className="mt-3 p-3 bg-brand-50 rounded-lg">
                  {loadingAttendees ? (
                    <p className="text-xs text-brand-400">Loading…</p>
                  ) : attendees.length === 0 ? (
                    <p className="text-xs text-brand-400">No attendees found.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {attendees.map((name, i) => (
                        <span key={i} className="text-xs bg-white border border-brand-200 text-brand-700 px-2 py-1 rounded-full">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-brand-100">
            <div className="flex gap-2">
              {canModify && (
                <>
                  <button
                    onClick={() => { onEdit(event); onClose() }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onRemove(event)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </>
              )}
              {!canModify && (
                <button
                  onClick={() => onReport(event)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-200 text-brand-500 hover:bg-brand-50 transition-colors"
                >
                  Report
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-sm text-brand-400 hover:text-brand-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event Card (List View) ──────────────────────────────────────────────────

function EventCard({ event, categories, onSelect }) {
  const cat = categories.find(c => c.id === event.category_id)
  const upcoming = isFutureOrToday(event.event_date)

  return (
    <div
      onClick={() => onSelect(event)}
      className={`bg-white rounded-xl border border-brand-100 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer p-4 ${
        !upcoming ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Date column */}
        <div className="flex-shrink-0 w-14 text-center">
          <div className="text-xs text-brand-400 uppercase font-medium">
            {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div className="text-2xl font-bold text-brand-800 leading-tight">
            {new Date(event.event_date + 'T00:00:00').getDate()}
          </div>
          <div className="text-xs text-brand-400">
            {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {cat && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: cat.color + '22', color: cat.color }}
              >
                {cat.name}
              </span>
            )}
            {event.external_url && (
              <span className="text-xs text-brand-400" title="Has external link">
                <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            )}
          </div>
          <h3 className="font-semibold text-brand-800 text-sm leading-snug truncate">{event.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-brand-500 flex-wrap">
            {event.event_time && <span>{formatTime(event.event_time)}</span>}
            {event.location && <span>📍 {event.location}</span>}
          </div>
        </div>

        {/* RSVP pill */}
        {upcoming && event.rsvp_count > 0 && (
          <div className="flex-shrink-0 text-xs text-green-600 font-medium bg-green-50 rounded-full px-2 py-0.5 whitespace-nowrap">
            {event.rsvp_count} going
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Grid View ──────────────────────────────────────────────────────────────

function CalendarGrid({ events, categories, year, month, onSelect }) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  // Build event map: day → events[]
  const eventMap = {}
  events.forEach(ev => {
    const d = new Date(ev.event_date + 'T00:00:00')
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!eventMap[day]) eventMap[day] = []
      eventMap[day].push(ev)
    }
  })

  const cells = []
  // Empty leading cells
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-brand-400 py-1">{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7 gap-px bg-brand-100 border border-brand-100 rounded-xl overflow-hidden">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`bg-white min-h-[80px] p-1 ${day ? '' : 'bg-brand-50'}`}
          >
            {day && (
              <>
                <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                  isToday(year, month, day) ? 'bg-brand-700 text-white' : 'text-brand-600'
                }`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {(eventMap[day] || []).slice(0, 3).map(ev => {
                    const cat = categories.find(c => c.id === ev.category_id)
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelect(ev)}
                        className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium leading-tight"
                        style={{ backgroundColor: (cat?.color || '#2C5F8A') + '22', color: cat?.color || '#2C5F8A' }}
                        title={ev.title}
                      >
                        {ev.external_url && '🔗 '}{ev.title}
                      </button>
                    )
                  })}
                  {(eventMap[day] || []).length > 3 && (
                    <div className="text-xs text-brand-400 px-1">+{eventMap[day].length - 3} more</div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Report Modal ────────────────────────────────────────────────────────────

function ReportModal({ event, currentUserId, onClose, onSubmitted, toast }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!reason.trim()) return toast.error('Please provide a reason')
    setSaving(true)
    const { error } = await supabase.from('blog_reports').insert({
      target_type: 'event',
      target_id: event.id,
      reported_by: currentUserId,
      reason: reason.trim(),
    })
    setSaving(false)
    if (error) {
      toast.error('Failed to submit report')
    } else {
      toast.success('Report submitted — thank you')
      onSubmitted()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="font-display text-xl text-brand-800 mb-1">Report Event</h2>
        <p className="text-sm text-brand-500 mb-4">Let the admin team know why this event is inappropriate.</p>
        <textarea
          className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Describe the issue…"
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-brand-200 text-brand-600 text-sm hover:bg-brand-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SocialCalendar() {
  const { user } = useAuth()
  const toast = useToast()

  const now = new Date()
  const [viewMode, setViewMode] = useState(() => {
    // If arriving from blog with an event to open, force list mode so event is fetched
    const params = new URLSearchParams(window.location.search)
    if (params.get('openEvent')) return 'list'
    return window.innerWidth < 768 ? 'list' : 'grid'
  })
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [filterCategory, setFilterCategory] = useState('all')
  const [showPast, setShowPast] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return !!params.get('openEvent') // show past events if arriving from a blog link
  })

  const [categories, setCategories] = useState([])
  const [events, setEvents] = useState([])
  const [userRsvps, setUserRsvps] = useState(new Set())
  const [profile, setProfile] = useState(null)
  const [isCalendarAdmin, setIsCalendarAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [showAddModal, setShowAddModal] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [reportEvent, setReportEvent] = useState(null)

  const [searchParams, setSearchParams] = useSearchParams()

  // ── Auto-open event from ?openEvent=id (linked from blog) ─────────────────
  useEffect(() => {
    const openId = searchParams.get('openEvent')
    if (!openId || loading || events.length === 0) return
    const match = events.find(e => e.id === parseInt(openId))
    if (match) {
      setSelectedEvent(match)
      setSearchParams({}, { replace: true }) // clean up URL after opening
    }
  }, [searchParams, events, loading, setSearchParams])

  // ── Fetch profile + admin status ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    async function fetchProfile() {
      const [{ data: accessRows }, { data: prof }] = await Promise.all([
        supabase.from('app_access').select('app_id, role').eq('user_id', user.id),
        supabase.from('profiles').select('resident_id, names, surname, tags').eq('id', user.id).single(),
      ])
      setProfile(prof)
      const admin = accessRows?.some(r => r.app_id === 'admin' || (r.app_id === 'calendar' && r.role === 'admin'))
      setIsCalendarAdmin(!!admin)
    }
    fetchProfile()
  }, [user])

  // ── Fetch categories ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('calendar_categories').select('*').order('name').then(({ data }) => {
      setCategories(data || [])
    })
  }, [])

  // ── Fetch events ──────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true)

    // Build date range for current month view (grid) or broader window (list)
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('removed', false)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true, nullsFirst: true })

    if (viewMode === 'grid') {
      const start = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
      const end = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]
      query = query.gte('event_date', start).lte('event_date', end)
    } else {
      // List: show 3 months ahead + past if toggled
      if (!showPast) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        query = query.gte('event_date', today.toISOString().split('T')[0])
      }
      query = query.lte('event_date', new Date(currentYear, currentMonth + 3, 0).toISOString().split('T')[0])
    }

    if (filterCategory !== 'all') {
      query = query.eq('category_id', parseInt(filterCategory))
    }

    const { data: evData } = await query

    // Fetch RSVP counts + author names separately
    if (evData && evData.length > 0) {
      const eventIds = evData.map(e => e.id)

      // RSVP counts
      const { data: rsvpRows } = await supabase
        .from('calendar_rsvps')
        .select('event_id')
        .in('event_id', eventIds)

      const rsvpCounts = {}
      rsvpRows?.forEach(r => {
        rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] || 0) + 1
      })

      // User's own RSVPs
      if (user) {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('resident_id')
          .eq('id', user.id)
          .single()
        if (myProfile) {
          const { data: myRsvps } = await supabase
            .from('calendar_rsvps')
            .select('event_id')
            .eq('resident_id', myProfile.resident_id)
            .in('event_id', eventIds)
          setUserRsvps(new Set(myRsvps?.map(r => r.event_id) || []))
        }
      }

      // Author names — fetch profiles for created_by UUIDs
      const authorIds = [...new Set(evData.map(e => e.created_by).filter(Boolean))]
      const { data: authorProfiles } = await supabase
        .from('profiles')
        .select('id, names, surname')
        .in('id', authorIds)
      const authorMap = {}
      authorProfiles?.forEach(p => {
        authorMap[p.id] = [p.names, p.surname].filter(Boolean).join(' ')
      })

      setEvents(evData.map(ev => ({
        ...ev,
        rsvp_count: rsvpCounts[ev.id] || 0,
        author_name: authorMap[ev.created_by] || 'Resident',
      })))
    } else {
      setEvents([])
      setUserRsvps(new Set())
    }

    setLoading(false)
  }, [viewMode, currentYear, currentMonth, filterCategory, showPast, user])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── RSVP toggle ───────────────────────────────────────────────────────────
  async function handleRsvp(event) {
    if (!profile) return
    const has = userRsvps.has(event.id)
    if (has) {
      await supabase.from('calendar_rsvps').delete()
        .eq('event_id', event.id)
        .eq('resident_id', profile.resident_id)
    } else {
      await supabase.from('calendar_rsvps').insert({
        event_id: event.id,
        resident_id: profile.resident_id,
      })
    }
    fetchEvents()
    // Update detail modal if open
    if (selectedEvent?.id === event.id) {
      setSelectedEvent(ev => ev ? { ...ev, rsvp_count: has ? ev.rsvp_count - 1 : ev.rsvp_count + 1 } : null)
    }
  }

  // ── Remove event ──────────────────────────────────────────────────────────
  async function handleRemove(event) {
    if (!window.confirm(`Remove "${event.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('calendar_events').update({ removed: true }).eq('id', event.id)
    if (error) {
      toast.error('Failed to remove event')
    } else {
      toast.success('Event removed')
      setSelectedEvent(null)
      fetchEvents()
    }
  }

  // ── Month navigation ──────────────────────────────────────────────────────
  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }
  function goToToday() {
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
  }

  // ── Can current user create events ───────────────────────────────────────
  const canCreate = isCalendarAdmin || !!profile

  // ── Filtered events for list view ─────────────────────────────────────────
  const listEvents = events

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-brand-800">Social Calendar</h1>
          <p className="text-brand-500 text-sm mt-1">Community events and activities</p>
        </div>
        {canCreate && (
          <button
            onClick={() => { setEditEvent(null); setShowAddModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-brand-900 font-semibold text-sm rounded-lg transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Event
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* View toggle */}
        <div className="flex rounded-lg border border-brand-200 overflow-hidden text-sm">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-brand-700 text-white' : 'text-brand-600 hover:bg-brand-50'}`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-brand-700 text-white' : 'text-brand-600 hover:bg-brand-50'}`}
          >
            Grid
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-brand-200 hover:bg-brand-50 transition-colors">
            <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={goToToday} className="text-sm font-medium text-brand-700 min-w-[140px] text-center hover:text-brand-900 transition-colors">
            {monthLabel(currentYear, currentMonth)}
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-brand-200 hover:bg-brand-50 transition-colors">
            <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="all">All categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Show past toggle (list only) */}
        {viewMode === 'list' && (
          <button
            onClick={() => setShowPast(p => !p)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              showPast ? 'bg-brand-100 border-brand-300 text-brand-700' : 'border-brand-200 text-brand-500 hover:bg-brand-50'
            }`}
          >
            {showPast ? 'Hiding past' : 'Show past'}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-brand-400 text-sm">Loading events…</div>
      ) : viewMode === 'grid' ? (
        <CalendarGrid
          events={events}
          categories={categories}
          year={currentYear}
          month={currentMonth}
          onSelect={setSelectedEvent}
        />
      ) : (
        <div className="space-y-3">
          {listEvents.length === 0 ? (
            <div className="text-center py-16 text-brand-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-sm">No events found.</p>
              {canCreate && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 text-sm text-brand-600 underline hover:text-brand-800"
                >
                  Add the first event
                </button>
              )}
            </div>
          ) : (
            listEvents.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                categories={categories}
                onSelect={setSelectedEvent}
              />
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {(showAddModal || editEvent) && (
        <EventModal
          categories={categories}
          editEvent={editEvent}
          profile={profile}
          isCalendarAdmin={isCalendarAdmin}
          toast={toast}
          user={user}
          onClose={() => { setShowAddModal(false); setEditEvent(null) }}
          onSaved={fetchEvents}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          categories={categories}
          currentUserId={user?.id}
          isCalendarAdmin={isCalendarAdmin}
          onClose={() => setSelectedEvent(null)}
          onEdit={ev => { setEditEvent(ev); setSelectedEvent(null) }}
          onRemove={ev => handleRemove(ev)}
          onReport={ev => { setReportEvent(ev); setSelectedEvent(null) }}
          onRsvp={handleRsvp}
          userRsvp={userRsvps.has(selectedEvent.id)}
        />
      )}

      {reportEvent && (
        <ReportModal
          event={reportEvent}
          currentUserId={user?.id}
          toast={toast}
          onClose={() => setReportEvent(null)}
          onSubmitted={fetchEvents}
        />
      )}
    </div>
  )
}
