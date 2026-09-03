import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import LoadingSpinner from '@/components/LoadingSpinner'

// ─── Court configuration ────────────────────────────────────────────────────
// NOT YET CONFIRMED with Keith: actual court operating hours. This is a
// placeholder 8am–8pm window — change this one constant to adjust; the
// database doesn't care what the actual times are (see
// pickleball_reservations.sql), it only enforces the fixed 1.5h length and
// prevents any two active reservations from overlapping.
const COURT_OPEN_MINUTES  = 8 * 60   // 8:00 AM
const COURT_CLOSE_MINUTES = 20 * 60  // 8:00 PM
const SLOT_MINUTES = 90              // fixed 1.5-hour reservation length
const START_STEP_MINUTES = 30        // granularity a resident can pick a start time at
                                      // (2026-09-03, Keith: any start time should be
                                      // choosable, e.g. 9:00–10:30, not just the original
                                      // fixed 8:00/9:30/11:00… grid)
const BOOKING_WINDOW_DAYS = 8         // can book up to 8 days ahead (confirmed)

const COURT_RULES = [
  'There is no fee to use the pickleball court.',
  'You can reserve a 1.5-hour block in advance, starting at any available time, up to 8 days ahead, as long as it doesn\'t overlap someone else\'s reservation.',
  "You can turn up to play without a booking, but if other residents are also waiting to play without a booking, you're limited to 1 hour before giving up the court.",
  'Guests are welcome to play, but at least one resident must remain at the court for the entire time guests are playing.',
]

function minutesToTime(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTimeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  const mins = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
  return `${hour}${mins}${suffix}`
}

// Every start time a resident could possibly pick, at START_STEP_MINUTES
// granularity — availability against existing bookings is computed per date,
// per candidate, in the component below (rangesOverlap).
const CANDIDATE_STARTS_MIN = (() => {
  const starts = []
  for (let start = COURT_OPEN_MINUTES; start + SLOT_MINUTES <= COURT_CLOSE_MINUTES; start += START_STEP_MINUTES) {
    starts.push(start)
  }
  return starts
})()

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateLabel(iso) {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d - today) / 86400000)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diffDays === 0) return `Today · ${dateStr}`
  if (diffDays === 1) return `Tomorrow · ${dateStr}`
  return `${weekday} · ${dateStr}`
}

const BOOKING_DATES = Array.from({ length: BOOKING_WINDOW_DAYS + 1 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() + i)
  return toISODate(d)
})

// ─── Booking confirmation modal ─────────────────────────────────────────────
function BookingModal({ date, slot, onClose, onConfirm, saving }) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <h2 className="font-display text-xl text-brand-800 mb-1">Confirm Reservation</h2>
          <p className="text-sm text-brand-500 mb-4">
            {formatDateLabel(date)} · {formatTimeLabel(slot.start)}–{formatTimeLabel(slot.end)}
          </p>

          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-brand-700 mb-2">Court rules</p>
            <ul className="space-y-1.5 text-sm text-brand-600 list-disc list-inside">
              {COURT_RULES.map((rule, i) => <li key={i}>{rule}</li>)}
            </ul>
          </div>

          <label className="flex items-start gap-2 text-sm text-brand-700 cursor-pointer mb-5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
            />
            I have read and agree to the court rules above.
          </label>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-brand-200 text-brand-600 rounded-lg py-2.5 text-sm font-medium hover:bg-brand-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(agreed)}
              disabled={!agreed || saving}
              className="flex-1 bg-brand-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Booking…' : 'Confirm Booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function PickleballCourt() {
  const { user } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState(null)
  const [reservations, setReservations] = useState([]) // active reservations across the booking window
  const [loading, setLoading] = useState(true)
  const [pendingSlot, setPendingSlot] = useState(null) // { date, slot }
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user) return
    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('id, resident_id, names, surname, address')
        .eq('id', user.id)
        .single()
      if (profErr) throw profErr
      setProfile(prof)

      const firstDate = BOOKING_DATES[0]
      const lastDate = BOOKING_DATES[BOOKING_DATES.length - 1]
      const { data: resData, error: resErr } = await supabase
        .from('pickleball_reservations')
        .select('id, reserved_by, household_address, play_date, start_time, end_time')
        .is('cancelled_at', null)
        .gte('play_date', firstDate)
        .lte('play_date', lastDate)
      if (resErr) throw resErr

      // Look up display names for whoever else has booked, so residents can
      // see who has the court (useful for the walk-up hand-off rule).
      const otherIds = [...new Set((resData || []).map(r => r.reserved_by).filter(id => id !== user.id))]
      let namesById = {}
      if (otherIds.length > 0) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, names, surname')
          .in('id', otherIds)
        namesById = Object.fromEntries((people || []).map(p => [p.id, `${p.names} ${p.surname}`.trim()]))
      }

      setReservations((resData || []).map(r => ({
        ...r,
        bookedByName: r.reserved_by === user.id ? 'You' : (namesById[r.reserved_by] || 'A neighbor'),
      })))
    } catch (e) {
      console.error('Failed to load pickleball reservations', e)
      toast.error('Failed to load the court schedule')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => { fetchData() }, [fetchData])

  // Active reservations grouped by date, so the grid below can check each
  // candidate start time for a real overlap rather than an exact-slot match.
  const reservationsByDate = useMemo(() => {
    const map = {}
    for (const r of reservations) {
      (map[r.play_date] ||= []).push(r)
    }
    return map
  }, [reservations])

  const hasAddress = !!(profile?.address && profile.address.trim())

  const openBooking = (date, slot) => {
    if (!hasAddress) {
      toast.error("We don't have an address on file for your household — please contact an administrator before booking.")
      return
    }
    setPendingSlot({ date, slot })
  }

  const confirmBooking = async (agreed) => {
    if (!agreed || !pendingSlot) return
    setSaving(true)
    const { date, slot } = pendingSlot
    const { error } = await supabase.from('pickleball_reservations').insert({
      reserved_by: user.id,
      household_address: profile.address.trim(),
      play_date: date,
      start_time: slot.start,
      end_time: slot.end,
      rules_acknowledged_at: new Date().toISOString(),
    })
    setSaving(false)

    if (error) {
      if (error.message?.includes('no_double_book_pickleball_court')) {
        toast.error('That time was just booked by someone else — please pick another.')
      } else if (error.message?.includes('idx_pickleball_household_per_day')) {
        toast.error('Your household already has a reservation for that day.')
      } else {
        console.error('Failed to book pickleball slot', error)
        toast.error('Failed to book that slot')
      }
      await fetchData()
      return
    }

    toast.success('Court reserved!')
    setPendingSlot(null)
    await fetchData()
  }

  const cancelReservation = async (reservation) => {
    if (!window.confirm(`Cancel your ${formatDateLabel(reservation.play_date)} ${formatTimeLabel(reservation.start_time)} reservation?`)) return
    const { error } = await supabase
      .from('pickleball_reservations')
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: user.id })
      .eq('id', reservation.id)
    if (error) {
      console.error('Failed to cancel pickleball reservation', error)
      toast.error('Failed to cancel that reservation')
      return
    }
    toast.success('Reservation cancelled')
    await fetchData()
  }

  if (loading) return <LoadingSpinner label="Loading the court schedule…" />

  const myUpcoming = reservations
    .filter(r => r.reserved_by === user.id)
    .sort((a, b) => (a.play_date + a.start_time).localeCompare(b.play_date + b.start_time))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-brand-800 mb-1">Pickleball Court</h1>
        <p className="text-brand-500 text-sm">Free to use. Reserve any available 1.5-hour block (in 30-minute increments) up to 8 days ahead, or just walk up.</p>
      </div>

      {!hasAddress && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          We don&apos;t have an address on file for your household, so we can&apos;t check the one-reservation-per-household rule. Please contact an administrator before booking.
        </div>
      )}

      {/* Court rules — always visible, not just at booking time */}
      <div className="bg-white border border-brand-100 rounded-2xl p-5">
        <p className="text-sm font-medium text-brand-700 mb-2">Court rules</p>
        <ul className="space-y-1.5 text-sm text-brand-600 list-disc list-inside">
          {COURT_RULES.map((rule, i) => <li key={i}>{rule}</li>)}
        </ul>
      </div>

      {/* My upcoming reservations */}
      {myUpcoming.length > 0 && (
        <div className="bg-white border border-brand-100 rounded-2xl p-5">
          <p className="text-sm font-medium text-brand-700 mb-3">Your upcoming reservations</p>
          <div className="space-y-2">
            {myUpcoming.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-brand-50 rounded-lg px-3 py-2">
                <span className="text-sm text-brand-700">
                  {formatDateLabel(r.play_date)} · {formatTimeLabel(r.start_time)}–{formatTimeLabel(r.end_time)}
                </span>
                <button
                  onClick={() => cancelReservation(r)}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule — any 30-minute mark is a valid start time for a 1.5-hour
          booking; a candidate is blocked if that window would overlap any
          active reservation for the day, not just an exact-slot match. */}
      <div className="space-y-4">
        {BOOKING_DATES.map(date => {
          const dayReservations = reservationsByDate[date] || []
          return (
            <div key={date} className="bg-white border border-brand-100 rounded-2xl p-5">
              <p className="font-medium text-brand-800 mb-3">{formatDateLabel(date)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CANDIDATE_STARTS_MIN.map(startMin => {
                  const endMin = startMin + SLOT_MINUTES
                  const startStr = minutesToTime(startMin)
                  const endStr = minutesToTime(endMin)
                  const label = `${formatTimeLabel(startStr)}–${formatTimeLabel(endStr)}`

                  const conflict = dayReservations.find(r => rangesOverlap(
                    startMin, endMin, timeToMinutes(r.start_time.slice(0, 5)), timeToMinutes(r.end_time.slice(0, 5))
                  ))

                  if (!conflict) {
                    return (
                      <button
                        key={startMin}
                        onClick={() => openBooking(date, { start: startStr, end: endStr })}
                        className="border border-brand-200 rounded-lg py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 hover:border-brand-400 transition-colors"
                      >
                        {label}
                      </button>
                    )
                  }

                  const isMine = conflict.reserved_by === user.id
                  const isExactMatch = timeToMinutes(conflict.start_time.slice(0, 5)) === startMin

                  return (
                    <div
                      key={startMin}
                      title={
                        isExactMatch
                          ? (isMine ? 'Your reservation' : `Booked by ${conflict.bookedByName}`)
                          : 'Overlaps an existing reservation'
                      }
                      className={`rounded-lg py-2 text-xs font-medium text-center ${
                        isMine
                          ? 'bg-gold-100 text-brand-800 border border-gold-300'
                          : 'bg-brand-100 text-brand-400 border border-brand-100'
                      }`}
                    >
                      {label}
                      {isExactMatch && (
                        <div className="text-[10px] mt-0.5 truncate px-1">
                          {isMine ? 'Yours' : conflict.bookedByName}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {pendingSlot && (
        <BookingModal
          date={pendingSlot.date}
          slot={pendingSlot.slot}
          saving={saving}
          onClose={() => setPendingSlot(null)}
          onConfirm={confirmBooking}
        />
      )}
    </div>
  )
}
