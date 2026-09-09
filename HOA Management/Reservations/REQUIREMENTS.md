# Clubhouse & Pickleball Reservations — Requirements (DRAFT)

Status: RCP has replied (Al Pellegrino, 2026-09-02) and agreed to the approach — clubhouse routing/integration questions that were "PENDING RCP" are now largely settled (see section 2.0). Full thread saved at `HOA Management/RE_ Subject_ Recap of Open RCP Action Items — Welcome Back!.eml`. Several new open items came out of the reply — see section 2.12. Nothing in section 2 is built yet.

**Target date: announced at the September 21, 2026 board meeting, live from October 1, 2026** (per Keith's email to Al). This is a real deadline, not a placeholder.

**Pickleball has a first-draft build (2026-09-02, unattended overnight session) — see "Build status" at the end of section 3.**

## 1. Problem

Clubhouse (and other bookable-space) reservations and pickleball court reservations currently live on two separate calendars: our portal and RCP's (the management company's) booking site. This creates duplicate, out-of-sync calendars and forces residents to enter the same request twice when a fee applies. Goal: make the portal the single system of record for all reservations. RCP confirmed they don't need a duplicate booking system as long as their staff can act on requests through the portal — see section 2.0. Pickleball has no fee and needs no RCP involvement at all.

## 2. Clubhouse / Bookable-Space Reservation Flow

### 2.0 Correspondence with RCP (2026-09-02) — read this first

Thread: Keith → Al Pellegrino (RCP Director) & board, cc Mariesol Soliguen (RCP — handles all bookings today), Sudhir Kalra (board), Bill Linder, Walter Sawka. Full .eml saved in `HOA Management/`. Key outcomes, superseding the "PENDING RCP" markers that were in this doc before:

- **RCP doesn't need its own booking system.** Al: "If you are providing booking through the website portal, there is no need to duplicate, as long as we have access to the booking schedule."
- **Integration mechanism is decided: portal accounts for RCP staff** (not webhook, not email fallback). Mariesol is the likely primary account holder since she already handles bookings; Al and others may also get access. Testing planned before cutover.
- **Payment is by check, not card.** "Confirm receipt of payment" means an RCP staff member marks a check as received in the portal — not a payment gateway integration. No card data, no PCI scope, in the portal at any point.
- **RCP's existing rental-application process:** fee must accompany the rental application up front, booking stays "pending" until received, at least 60 days before the event (Al, describing their current paper-based process). Reconciled by Keith's own decision below (2.0b #2/#4).
- **Fee amount:** RCP considers the current $150/6hrs adequate today (covers utilities), isn't proposing a change. Board sets the price going forward, as a variable it can adjust over time — a real change from the original assumption that the portal wouldn't store a dollar figure at all. See 2.5.
- **Money stays with RCP.** Per Keith: "centralize all processing on our portal but still record any monetary process within RCP." The portal holds status markers (fee snapshot, check-received flag, refund-issued flag) — not a financial ledger.
- **Cancellations must return money, not just release the slot** (Keith) — see 2.9.
- Board member Sudhir Kalra asked whether some of the fee should be allocated to the reserve fund for furniture replacement — a board finance/accounting question, agreed as a board follow-up (2.0b #5), not a system requirement.
- Pickleball wasn't itemized in Al's numbered reply — worth a one-line confirmation it's actually off on RCP's side, see 2.12.

### 2.0b Board decisions in response (Keith, 2026-09-02)

1. **RCP reviews every booking, not just self-flagged private ones, and can escalate.** This closes the gap flagged earlier ("who checks a false 'No'?"): RCP's portal role covers the full queue, and they can escalate any entry they believe is actually private-but-unmarked to the social committee. The social committee's role is narrow and reactive — they only see and act on RCP's escalations, not the whole queue.
2. **Payment deadline: 30 days before the event.** The booking form must clearly state, at submission, that the reservation is not confirmed until payment is received. Any booking where funds haven't been received within 30 days of the event date is liable for cancellation.
3. **Resource selection added to the booking form** — "the clubhouse" isn't one bookable thing:
   - Main clubhouse.
   - Small side room — **not currently available at all**. Build the booking capability now, but keep it visibly disabled / marked "coming soon" until an admin turns on availability, so no further dev work is needed to switch it on later.
   - Extra tables and chairs — an add-on checkbox on the booking form. Who actually sets these up is an open board discussion (staffing, not software) — the portal only needs to capture that it was requested.
4. Keith will reconcile his 30-day figure against Al's 60-day figure directly with Mariesol, "to ensure there are not 2 processes." Build the payment-deadline window as a configurable setting, not a hardcoded number, so whatever they land on doesn't need a code change.
5. Sudhir's reserve-fund question — agreed as a board follow-up, no system change needed.

### 2.1 Single system of record — confirmed, and built into the existing Social Calendar (Keith, 2026-09-02)
All requests are submitted and tracked entirely in the portal. RCP's own resident-facing booking calendar is retired.

**UI decision:** this is not a separate "book the clubhouse" app. It's built into the existing Add/Edit Event flow in Social Calendar (`SocialCalendar.jsx`), which today already lets any signed-in resident create an event (`canCreate = isCalendarAdmin || !!profile` — not admin-gated) and already has a `location` free-text field carrying a warning that a location doesn't reserve anything. That warning is what this closes: picking **Main Clubhouse** or **Clubhouse Side Room** (coming soon) as the location — instead of typing free text — reveals the reservation questions inline in the same modal (private event Y/N, extra tables & chairs). Every other location stays exactly as it works today, unchanged.

**Data model stays split, even though the UI doesn't:** submitting creates the normal `calendar_events` row (so it shows on the shared calendar like any other event, keeps working with comments etc.) plus a linked row in a new `clubhouse_reservations` table holding everything reservation-specific — private flag, resource selection, fee/deposit snapshot, payment status, RCP acknowledgment, escalation, refund. Reasoning: `calendar_events` is used by every community event today (garage sales, meetups, board notices) and most of those new columns would be meaningless for the vast majority of them; keeping reservation data in its own table also scopes RCP's limited role to just that table rather than needing any access to general calendar data, and keeps payment/fee detail off the same broad surface that calendar comments and event browsing already use.

**Private-event display, resolved (Keith, 2026-09-02):** a private booking shows on the shared calendar as **"Private Event"** — not the resident's actual title/description — **but does list the name of the person who made the reservation.** So other residents can see the space is taken, by whom, without the private details (what it's for, who else is invited) being broadcast community-wide. Every non-private event — which is the large majority of what's on the calendar today — is completely unaffected and keeps showing full title/description as normal.

**"My Events" filter, built 2026-09-03 (not clubhouse-specific, but built alongside this work), revised 2026-09-05:** since residents now use this same calendar for reservations, a resident wants an easy way to see just what they've booked/created without scanning the whole community calendar. Added a "My Events" toggle to `SocialCalendar.jsx` — switches into list view filtered to `created_by = <current user>`. Originally started today-forward, same as the unfiltered list (today + 3 months, in the same rolling window described in 2.13's testing notes) — but Keith found while testing that a reservation made months out (e.g. a clubhouse booking for Jan 2027) wouldn't show under My Events until the calendar was manually scrolled to that specific month, since the 3-month cap applied there too. Fixed: turning My Events on now also turns "Show All" on, so it always shows every event the resident has ever created, unbounded, no scrolling needed — that's specifically what a "my stuff" view should do. Turning My Events back off turns Show All back off too, restoring the normal today-forward community list. Month-nav scrolling still exits both, same as it already exits Show All elsewhere.

### 2.2 Intake — updated: multi-resource
Resident submits: date, time, headcount (if relevant), contact info, which resource(s) are wanted (Main Clubhouse / Small Side Room — shown as "coming soon" until enabled / Extra Tables & Chairs as an add-on), and answers "Is this a private event?" (Yes / No / Not sure).

**Resolved (Keith, 2026-09-02):** Main Clubhouse, Small Side Room (once enabled), and Extra Tables & Chairs are independently selectable — any combination on one request. Main Clubhouse and the Small Side Room can be booked by **different residents at the same time**, as long as neither resource is already booked for that slot — no shared exclusivity between them. Double-booking is checked per resource, not per booking.

### 2.3 Routing — updated: RCP sees everything, can escalate
- **Not private** → auto-confirms directly in the portal, same shape as pickleball — *unless* RCP escalates it.
- **Private** → goes through the fee/payment workflow (2.5–2.7).
- **RCP escalation**: RCP staff can flag any "not private" booking they believe is actually private. It goes to the social committee to confirm (booking flips into the fee/payment workflow) or dismiss (booking stands as submitted). The committee only ever sees escalated items, not the full queue.

### 2.4 Slot holding — per resource
The moment a request is submitted, the portal soft-locks the specific resource(s) requested (Main Clubhouse and/or Small Side Room) for that date/time, so two residents can't request the same resource while one is pending.

### 2.5 Fee, deposit & payment deadline — board-editable settings, priced per resource
**Resolved (Keith, 2026-09-02):** each resource attracts its own independent fee, not one flat clubhouse charge — Main Clubhouse, Small Side Room, and Extra Tables & Chairs are each a separate board-editable amount, all charged together when selected together. The Tables & Chairs fee is meant to cover paying someone to set up and take back down (the board still needs to decide who actually does that — 2.0b #3/2.12). The security deposit and the payment-deadline window (days-before-event) are also board-editable settings, same mechanism as the clubhouse WiFi password already is (`community_settings`, edited from the admin Reports page).

Current values (`clubhouse_main_fee`, `clubhouse_side_room_fee`, `clubhouse_tables_chairs_fee`, `clubhouse_security_deposit`, `clubhouse_payment_deadline_days`, all in `community_settings`), set by Keith 2026-09-03, **pending board review before go-live**:
- Main Clubhouse: **$200.00**
- Small Side Room: **$50.00** — priced, but the room itself still shows "coming soon" until the separate `clubhouse_side_room_available` toggle is switched on
- Extra Tables & Chairs: **$50.00** — intended to cover paying someone to set up and take back down (2.0b #3/2.12 — who does that is still an open board discussion)
- Security deposit: **$250.00** (existing figure, carried over)
- Payment-deadline window: **30 days** — Keith's figure, kept as-is; still pending reconciliation with RCP's stated 60-day figure (2.0b #4) — a number change here is a one-field settings edit, not a code change

All of the above are board-editable at any time from the Reports page's Clubhouse settings card — Keith is reviewing this full set with the board before residents see it.

**Each reservation snapshots the fee/deposit/deadline that applied at the moment a fee becomes owed** (submission, for a "yes"/"not sure" private-event answer; escalation-resolution time, for a "no" answer RCP successfully escalates), not a live read — so a later board change to any of these settings never retroactively affects an existing booking.

**Time-of-day and duration limits, added 2026-09-05 (Keith, found while testing Scenario 1):** every clubhouse reservation (Main Clubhouse and/or Side Room) must end by 10:00 PM. A private (or not-sure) reservation additionally can't run longer than 6 hours — a non-private/baseline booking has no duration cap. Enforced client-side in the Add Event form (`SocialCalendar.jsx`); not yet backed by a DB constraint (the existing `clubhouse_reservations_time_order` CHECK only guarantees `ends_at > starts_at`) — worth adding as a matching CHECK constraint for defense-in-depth if this ever needs to be bulletproof against something other than the app's own UI.

The booking form and confirmation must clearly state that the reservation is **not confirmed until payment is received**. **Resolved (Keith, 2026-09-02):** cancellation itself stays a human decision, not automatic — but the moment a booking crosses the payment-deadline window still unpaid, the portal automatically emails both the resident and RCP: the booking is late, subject to cancellation, please remediate ASAP. RCP or the board then decides whether to actually cancel it. This notice fires once per booking (deduped), not as a repeating nag.

### 2.6 Closing the loop — RCP + social committee actions
RCP staff (Mariesol primarily, Al/others as needed) get `clubhouse` app_access role='admin'. Their actions:
- **Acknowledge a booking.**
- **Confirm receipt of payment** — mark the check received (accounting stays in RCP's own systems).
- **Escalate** a "not private" booking to the social committee (2.3).
- **Mark a refund issued** on cancellation (2.9).
- **Cancel/decline** a request.

**Resolved (Keith, 2026-09-03):** the Social Committee gets a genuinely separate, narrower role, not just an instruction to only touch escalations — this is an over-55 volunteer community, and "please don't touch the rest" isn't something to rely on. Committee members get `clubhouse` app_access role='user' (repurposing the existing role value rather than adding a third one), which RLS restricts to reservations with status='escalated' only — they cannot see or act on anything else in the queue, enforced at the database level, not just hidden in the UI. Their only actions are **Confirm** (this is actually private → moves into the fee/payment workflow) or **Dismiss** (booking stands as submitted). No `clubhouse` row at all = an ordinary resident, no admin visibility of any kind. Built in `supabase/migrations/clubhouse_committee_role.sql` and `src/pages/admin/ClubhouseReservationsPage.jsx`.

A directory entry for the RCP booking contact is still worth adding once account setup happens.

### 2.7 Status states (updated)
`Requested` → (not private → `Confirmed`, or `Escalated — Awaiting Social Committee` if RCP flags it, resolving to `Confirmed` or back to standing) OR (private → `Pending — Payment Not Received`) → `Acknowledged by RCP` → `Check Received (Confirmed)` → `Payment Overdue` (if unpaid inside the deadline window) → `Cancelled` + `Refund Issued` (if funds had already been collected).

### 2.8 Unpaid-fee timeout — resolved
Keith's 30-day-before-the-event rule answers this, pending his reconciliation with RCP's 60-day figure (2.0b #4). Build as a configurable setting, not a hardcoded number. Crossing the deadline unpaid triggers an automatic "late — subject to cancellation" email to the resident and RCP (2.5) — it does **not** auto-cancel the booking; an RCP/board admin cancels it manually if it stays unresolved (2.9). Built as `supabase/functions/clubhouse-payment-check`, a scheduled Edge Function (same `pg_cron` mechanism as `daily-digest`, see `supabase/clubhouse-payment-check-cron.sql`), runs once daily, dedupes per booking via `late_notice_sent_at`.

### 2.9 Cancellations — must include the money coming back
Cancellation isn't complete in the portal until any fee/deposit already collected is marked returned (`Refund Issued`, set by RCP staff, mirroring `Check Received`) — applies whether the resident, RCP, or the board initiates the cancellation.

**Bug found and fixed (2026-09-03):** RCP's Cancel action only updated `clubhouse_reservations.status` — the linked `calendar_events` row was untouched, so a cancelled booking kept showing on the shared calendar as if it still stood (found via Keith's 1/1/27 test booking). Fixed in `ClubhouseReservationsPage.jsx`'s `cancelReservation`: now also sets `calendar_events.removed = true` for the linked event, same mechanism the resident-facing "Remove event" action already uses. Deliberately a soft removal (`removed = true`), not a hard delete — `clubhouse_reservations.calendar_event_id` is `ON DELETE CASCADE`, so deleting the calendar row would have destroyed the reservation record (and its cancellation/refund history) along with it. Keith's existing 1/1/27 test event needed a one-time manual SQL fix to catch up, since it was cancelled before this fix landed.

**Full cancellation policy — built 2026-09-04 (Keith: "the flow for RCP cancels a reservation is not built yet — we should build that now"):**
- **RCP cancels** — only offered *before* a fee has been received (the Cancel button in `ClubhouseReservationsPage.jsx` is now hidden once `check_received_at` is set — see the note above it). RCP is prompted for a reason, same as before; it's now emailed to the resident via `supabase/functions/notify-clubhouse-cancellation`. Since RCP only ever cancels pre-payment, there's nothing to refund.
- **Resident cancels their own booking** — new: `SocialCalendar.jsx`'s `handleRemove`, when the event has a linked reservation, now cancels the reservation (not just removes the calendar event), prompting for an optional reason.
  - *Before* a fee is received: the reservation is simply cancelled — it drops out of RCP's "needs action" queue on its own (no email; nothing further owed).
  - *After* a fee is received: same cancellation, plus `notify-clubhouse-cancellation` emails every clubhouse `role='admin'` reviewer that a refund needs processing — RCP marks it `Refund Issued` from the existing "needs refund" row, same as today.
- **One Edge Function, both directions** — `notify-clubhouse-cancellation` inspects `cancelled_by` vs `reserved_by` on the row to decide who to email and what to say (RCP's reason to the resident, or a refund-needed notice to RCP), rather than two separate functions.
- RLS already supported this — `clubhouse_reservations`' owner-update policy was written "cancel only, enforced client-side" from the start (see `clubhouse_reservations.sql`), so no migration was needed, only the client-side + notification code.

### 2.9b Editing an existing reservation — built 2026-09-05
Keith found while testing that the Edit Event popup never let a resident change the End time, resource checkboxes (Main Clubhouse/Side Room/Tables & Chairs), or the private-event answer on a clubhouse booking — those fields simply didn't render when editing, by original design (the reservation panel only ever showed for a brand-new event). His policy: allow those changes as long as RCP hasn't accepted the request yet or a fee hasn't been paid; if it's already been paid, cancel and rebook instead.

**Built:**
- `SocialCalendar.jsx`'s Edit Event modal now looks up the linked `clubhouse_reservations` row (if any) when it opens. It's editable when `status !== 'cancelled'` **and** `check_received_at` is null — i.e. RCP may already have acknowledged it (`pending_payment`) or the committee may be reviewing it (`escalated`), but no money has changed hands yet. Once editable, the same resource chips / end time / private-answer question a new booking uses are shown, pre-filled from the existing reservation.
- **Saving a change re-runs the same logic a brand-new submission would** — status resets to `pending_rcp` (private/not-sure) or `confirmed` (non-private), fees/deposit/payment-deadline are re-snapshotted from current settings (or cleared, if no longer private), and any prior RCP acknowledgement or committee escalation is cleared (`acknowledged_at`, `escalated_at`, `escalation_resolved_at`/`_outcome`, `late_notice_sent_at` all reset to null). RCP gets a fresh `notify-clubhouse-rcp` email if the edited booking is still (or newly) private/not-sure — treated exactly like a new request, since the underlying facts changed. The double-booking exclusion constraints apply to the update the same as an insert, so a conflicting new time is rejected with the same friendly message.
- Once a fee's been received (or the reservation's cancelled), the modal shows a lock notice instead and disables Date/Start time too (not just End time/resources/private answer) — a paid reservation's actual time slot is controlled entirely by `clubhouse_reservations.starts_at`/`ends_at`, so leaving Date/Start time editable in that state would have silently desynced the calendar display from what RCP and the exclusion constraints actually see. The path to change anything at this point is to cancel (starts the refund flow, 2.9) and create a new booking.
- **Known gap, not addressed here:** Description/Location remain freely editable through the generic edit path even on a paid, masked private reservation. Pre-existing behavior; worth tightening later if it matters in practice.

**Masked title now has somewhere real to live — built 2026-09-05.** Keith: "the original event title can be displayed/edited [by the owner] — masking should only be for events that are not yours." Previously there was no "original title" at all for a masked booking to bring back — the title input wasn't even shown when creating one, and `calendar_events.title` was overwritten with "Private Event — Name" at submission time with nothing else stored. Fixed with a new nullable column, `clubhouse_reservations.actual_title` (migration: `supabase/migrations/clubhouse_actual_title.sql`, not yet applied):
- The resident now sees a title input for a masked booking too (both when creating one and editing it), labelled as their own reference and explicitly explained as visible only to them and RCP — never shown on the shared calendar. Useful in its own right for the current testing phase: this is what lets "Test scenario 1" actually be typed and traced for a *private* test booking, which wasn't possible before.
- Saved to `actual_title`, never to `calendar_events.title` — the shared calendar keeps showing the masked placeholder to everyone, exactly as before.
- Editable regardless of payment status (unlike everything else on a paid reservation) — it carries no workflow weight, so there's no reason to lock it the way time/resources/private-answer are locked post-payment.
- Surfaced to RCP/committee too, in `ClubhouseReservationsPage.jsx`'s queue (as "Ref: {actual_title}") — otherwise they'd have no way to connect a masked booking back to what a resident actually meant by it.
- **Bug caught and fixed in the same pass:** the previous day's "lock a paid reservation" build (2.9b) only actually disabled the Date/Start-time inputs — the End time field, the Tables & Chairs checkbox, and the private-answer radios were still fully interactive once a fee had been received, contradicting what the lock notice told the resident. All three now correctly disable alongside Date/Start time.

**Owner sees their real title everywhere, not just the Edit modal — built 2026-09-05.** The previous build only surfaced `actual_title` inside the Edit modal; Keith pointed out the list card and detail card still showed "Private Event — Name" even to the booking's own owner, which felt backwards — masking should only apply to *other* residents. Fixed: `fetchEvents` now also pulls `actual_title`/`private_event_answer` for every fetched event's linked reservation (if any), and a shared `displayTitle(event, currentUserId)` helper substitutes the owner's real title in wherever an event's title renders — the list card (`EventCard`), the detail card (`EventDetailModal`), and the month-grid day dot's tooltip — falling back to the masked placeholder if the owner never set a title. Every other viewer, including RCP/admin browsing the calendar itself (not the reservations queue, which already showed `actual_title` separately), still sees exactly the masked title stored in `calendar_events.title` — nothing about what's actually stored or who else can see it changed.

### 2.9c Double-booking rollback bug — found and fixed 2026-09-05
Keith, testing Scenario 7 (double-booking rejection): got the expected "that time was just booked by someone else" error, but the rejected attempt's calendar entry stayed live anyway — two events visibly sitting at the same time, even though the actual double-booking protection (the `no_double_book_*` exclusion constraints) correctly prevented a second `clubhouse_reservations` row from ever being created.

**Root cause:** the rollback step that's supposed to remove the orphaned `calendar_events` row when the linked reservation insert fails was a hard `DELETE`, with its result never checked — every other removal in this app (resident self-cancel, RCP cancel) goes through the `removed = true` soft-delete flag instead, specifically because a resident's RLS permissions likely don't allow a hard delete of `calendar_events` at all. The delete silently failed, so the rejected attempt's event just sat there, fully visible, looking exactly like a second real booking.

**Fixed** in `SocialCalendar.jsx`: rollback now uses `removed = true`, same as everywhere else, with the result checked and logged if it ever fails.

**Cleanup still needed:** Keith's Scenario 7 test already created one of these stray orphaned events before the fix landed — needs a one-time manual SQL cleanup (find any `calendar_events` row with `removed = false`, a clubhouse-looking `location`, and no matching `clubhouse_reservations.calendar_event_id`, then set `removed = true` on it) once confirmed which row it is.

### 2.10 Notifications
**Built (2026-09-03):** both halves of "how do people know something's waiting on them" are covered now, each two ways:
- **Social Committee — escalations.** Email, immediately on escalation — `supabase/functions/notify-clubhouse-escalation`, fired from RCP's Escalate action, emails everyone with `clubhouse` role='user'. Plus a home-screen highlight (see below).
- **RCP — new bookings.** Email, immediately when a booking lands in `pending_rcp` (i.e. the resident said the event might be private) — `supabase/functions/notify-clubhouse-rcp`, fired from the resident's submission in `SocialCalendar.jsx`, emails everyone with `clubhouse` role='admin'. RCP doesn't need a separate notification for cancellations: today only RCP can cancel a booking (they're the ones doing it), and an overdue unpaid booking already emails them via the payment-deadline reminder (2.5/2.8) below.
- **Home-screen highlight**, role-aware — a "Clubhouse Reservations"/"Clubhouse Escalations" card on the dashboard (`AdminReportsWidget.jsx`, alongside the existing Content Reports card). RCP's badge counts everything needing their action (new requests, payment follow-ups, escalations, and cancellations still owed a refund — the same set as the admin page's "Needs action" filter); the committee's badge counts escalated bookings only, since that's all they can act on.
- **Resident — booking processed.** Built 2026-09-03 (Keith: "include it in a confirmation email but also... display on screen"). Two forms, same information, fired the moment RCP acknowledges a request or resolves an escalation:
  - **Email** — `supabase/functions/notify-clubhouse-resident-status`, fired from `acknowledgeFeeRequired`, `acknowledgeNoFee`, and both `resolveEscalation` outcomes in `ClubhouseReservationsPage.jsx`. If a fee is now due (`pending_payment`): resource/fee/deposit/total-due breakdown, payment deadline, and the check payable-to/mailing-address settings (2.5) — or a "RCP will follow up directly" line if those aren't filled in yet. If no fee is required (`confirmed`): a simple confirmation, no payment section.
  - **On screen** — `ClubhouseReservationPanel` in `SocialCalendar.jsx`'s event detail view, visible to the event's creator (and calendar admins) whenever the event has a linked clubhouse reservation. Shows the same status/fee/deadline/payee/address as the email, live from the database rather than frozen at send-time — so it stays correct even if settings change after the email went out. Not shown to other residents viewing the event (gated the same way Edit/Remove already are).

**Cancellation/refund notifications — built 2026-09-04**, per the full policy above (2.9): `notify-clubhouse-cancellation` covers both an RCP-initiated cancellation (reason → resident) and a resident-initiated one where a refund is now owed (→ RCP). Everything in the notification plan — RCP, committee, and the resident's own acknowledgment/confirmation/cancellation — now has both an email and an in-portal signal.

### 2.11 What the portal actually stores
No financial ledger (2.0). Only: which resource(s) were requested, the fee/deposit amount snapshotted at booking time, the payment-deadline date computed from the setting in force at booking time, a check-received flag (who/when), and a refund-issued flag (who/when).

### 2.12 Issues still open

- **Extra tables & chairs fulfillment** — who actually sets them up is an open board discussion (2.0b #3). Built the request checkbox and its own fee regardless; the fee is meant to cover paying whoever does this once the board decides.
- **Exact payment-deadline number** — Keith's 30 days vs. RCP's 60 days, being reconciled directly with Mariesol (2.0b #4). Built as a setting (`clubhouse_payment_deadline_days`), so reconciling this is a one-field change, not a code change.
- **Side Room and Tables & Chairs pricing** — now set ($50 each, 2026-09-03) but **pending board sign-off** as part of Keith's full review of all clubhouse variables before go-live. Side Room stays flagged "coming soon" until `clubhouse_side_room_available` is separately switched on regardless of price (2.0b #3).
- **Pickleball's RCP-side deactivation** — still not individually itemized by RCP; a quick confirmation would close this out.
- **Check payee/mailing address** — need to confirm with RCP who the check should be made out to and what address it should be mailed to. Built as two more board-editable settings (2026-09-03), same pattern as the fees: `clubhouse_check_payable_to` and `clubhouse_check_mailing_address` on `community_settings`, editable in Admin → Reports → Clubhouse Reservation Settings — so this is a one-time settings fill-in once RCP answers, not a code change, and stays easy to update again if the booking contact ever changes from RCP. Nothing resident-facing displays these yet — worth deciding where they should show (e.g. on a pending-payment reservation, or a follow-up email) once the values are known.
- **Timeline:** target is live October 1, announced September 21. Clubhouse is now built (2.14) but not applied/deployed — worth sequencing migration → code push → RCP/tester access → cutover with that date in mind.

### 2.13 Environment strategy and RCP testing (Keith, 2026-09-02)

Keith asked whether to stand up a separate test/staging Supabase project before iterating on this with RCP and the board, versus continuing in production with careful, additive-only changes.

**Recommendation: continue in production, gated — don't stand up a parallel environment.** Reasoning:
- There is currently **no existing clubhouse-reservation data in the portal at all** — clubhouse bookings have only ever lived on RCP's site. This is a brand-new table, not a migration touching live data, so the usual risk a staging environment protects against (breaking real records) doesn't apply here the way it would for an existing feature.
- The same discipline already used for pickleball — write migrations, get them reviewed, apply only when ready — carries over directly and has already proven out.
- A second Supabase project means an ongoing cost that doesn't go away after this feature ships: every future migration has to be applied twice and kept in sync, and it's a second source of schema drift risk to manage indefinitely, for a one-time testing need.
- **RCP needs to test using the same accounts and the same portal they'll actually use going forward** — Keith's own added requirement. Testing against a separate staging environment would mean RCP validating a workflow in a place they'll never use again, then re-learning the real one at cutover — less representative, not more, of what "confirm they can perform tasks successfully" needs to prove.

**How to keep it safe without a second environment:**
- Gate the whole clubhouse feature behind an `app_access` role (mirrors how pickleball access is scoped) — restricted to Keith, designated board/committee testers, and RCP's real accounts (Mariesol/Al) during the test phase. Widen to all residents only at actual cutover (October 1).
- Test bookings should be created only by consenting testers (Keith, board members) using their own household — never picked from an unaware resident — so any automated emails this triggers (2.5/2.8) only ever reach people who know it's a test.
- A lightweight `is_test` flag on each reservation is worth adding, so test bookings from this phase can be excluded from any later reporting/reconciliation without needing to delete them.
- If, once underway, this still feels too risky in practice (e.g. RCP wants to test independently without coordinating with Keith each time), a real staging project remains an option to add later — it's not a decision that forecloses anything.

RCP testing access itself (Mariesol/Al's limited portal role, per 2.6) should be set up early specifically so they can run through acknowledge / confirm payment / escalate against real test bookings before cutover, not just reviewed on paper.

**Addendum, 2026-09-05 — a plain resident tester can't be modeled as an `app_access` role.** Keith tried to give his own resident test account (kddyke23@gmail.com) clubhouse access without also making it RCP or committee, by granting a third `role` value (`'tester'`). Two things ruled that out:
- `app_access.role` has a DB check constraint (`app_access_role_check`) allowing only `'user'`/`'admin'` — those already mean Social Committee/RCP for the `clubhouse` app (per `clubhouse_committee_role.sql`), so a `'tester'` role isn't just unsupported, it would collide with real meanings if the constraint were widened.
- The Admin → Access page's per-app toggle only knows a `none → user → admin → none` cycle — a third state isn't representable there even if the DB allowed it.

**Fix:** the test-phase gate in `SocialCalendar.jsx` (`canRequestClubhouse`) now also accepts a short hardcoded allowlist of resident tester user IDs (`TEST_PHASE_TESTER_IDS`), checked only in that one place — no schema change, no interaction with RCP/committee roles, no escalation emails, no elevated RLS visibility. Kept deliberately temporary: removed in the same edit that removes the whole gate at the October 1 cutover.

### 2.14 Build status (2026-09-02/03)

First draft built and left uncommitted for Keith to review — nothing has been applied to the live database or deployed:

- `supabase/migrations/clubhouse_reservations.sql` — `community_settings` additions (per-resource fees, deposit, payment-deadline-days, side-room-available toggle), the `clubhouse_reservations` table, per-resource exclusion constraints (Main Clubhouse and Side Room independently), RLS. **Not yet applied to the Supabase project.**
- `supabase/functions/clubhouse-payment-check/index.ts` — the automated overdue-payment notice, plus `supabase/clubhouse-payment-check-cron.sql` to schedule it. **Not yet deployed or scheduled.**
- `src/components/apps/SocialCalendar.jsx` — Add Event now reveals the reservation panel when Main Clubhouse or Side Room is picked as the location: independent resource chips, private-event question, live cost breakdown, private-event masking (stores `"Private Event — {name}"` as the title, blanks the description) on submit.
- `src/pages/admin/ClubhouseReservationsPage.jsx` — the RCP/committee review queue (acknowledge, mark check received, escalate/resolve, cancel, mark refund issued), routed at `/admin/reservations` and linked from the sidebar for anyone with `clubhouse` app access.
- `src/pages/admin/AccessPage.jsx` — added `clubhouse` (and, from the earlier phase, `pickleball`) to the app-access grid.
- `src/pages/admin/ReportsPage.jsx` — added a Clubhouse settings card (fees, deposit, payment-deadline days, side-room-available toggle) next to the existing community-settings card.
- `src/App.jsx`, `src/components/layout/AppShell.jsx` — routing and sidebar link for the new admin page.
- `supabase/migrations/clubhouse_committee_role.sql` — replaces the two original RLS policies with ones that also let a role='user' (committee) account see/act on `status='escalated'` rows only, per 2.6. **Not yet applied.**
- `supabase/functions/notify-clubhouse-escalation/index.ts` — emails the committee on escalation, per 2.10. **Not yet deployed** (needs `--no-verify-jwt`).
- `supabase/functions/notify-clubhouse-rcp/index.ts` — emails RCP on a new pending_rcp booking, per 2.10. **Not yet deployed** (needs `--no-verify-jwt`).
- `src/pages/admin/ClubhouseReservationsPage.jsx` — reworked for the RCP/committee split: derives an actual role (not just a yes/no eligibility flag), gates each action button to the right role, fires the escalation email.
- `src/components/apps/SocialCalendar.jsx` — the resident-facing reservation panel is now gated behind `clubhouse` app access (closes the gap where it briefly had no gate of its own); a successful private/unsure booking now fires the RCP email.
- `src/components/apps/AdminReportsWidget.jsx` — the home-screen card is role-aware per 2.10.
- `src/components/layout/AppShell.jsx` — sidebar link shown to anyone with `clubhouse` access (RCP or committee), not admin-role only.
- `npx eslint` passes clean on all new/touched files. `npm run build` could not be verified in this session — same pre-existing rollup native-binary issue noted in 3.7, unrelated to these changes.
- Nobody has `clubhouse` app access yet — needs granting by hand (Keith first, then Mariesol/Al as role='admin', then committee members as role='user') once the migration is applied, per 2.13.

## 3. Pickleball Court Reservation Flow

Fully self-contained in the portal — no fee, no RCP touchpoint. Built as a separate calendar/app from the clubhouse flow (different structure: fixed-length resource slots vs. open-ended request/approval).

### 3.1 Resource
One court (single resource — no multi-court scheduling needed).

### 3.2 Advance booking
- Reservation length: fixed 1.5-hour block.
- Start time: **any available time, in 30-minute increments** (updated 2026-09-03, Keith — the original build only offered a fixed grid of 8:00/9:30/11:00… slots, which meant a resident wanting e.g. 9:00–10:30 couldn't get it since it fell between two grid marks; now any 30-minute mark works as a start time, checked for a true overlap against existing bookings rather than an exact-slot match).
- Booking window: up to 8 days in advance.
- Conflict rule: cannot book a time whose 1.5-hour window overlaps any other active reservation that day.

### 3.3 Household limit
A household may hold at most **one advance reservation per play-day**. A household may hold multiple reservations at once as long as each is for a **different** calendar day (so, in principle, up to one reservation per day across the 8-day window, but never two reservations for the same day).

**Implementation note:** "household" must be enforced by unit/address, not by individual login — otherwise two residents in the same household with separate portal accounts could each book a slot for the same day and bypass the limit. Need to confirm how the current data model links multiple resident accounts to one unit (`profiles.resident_id`?) before this can be built correctly — flagging as an open item, not blocking the rest of the design.

### 3.4 Cancellation
A household can cancel its own upcoming reservation to free the slot for others.

### 3.5 Walk-up rules — POLICY ONLY, not system-enforced
The portal cannot verify physical presence at the court, so these are displayed as posted rules on the booking page / confirmation, not enforced in software:
- Walk-up (unbooked) play is allowed any time the court is free.
- If other residents are waiting to play (also unbooked), a walk-up session is capped at 1 hour.
- Guests may play, but at least one resident must remain at the court for the entire duration of guest play.

**Acknowledgment at booking time.** Even though the system can't enforce these rules during play, the booking flow requires the household to actively acknowledge them (e.g. a mandatory "I have read and agree to the court rules" checkbox, not pre-checked) before a reservation is confirmed. The acknowledgment is timestamped and stored against that reservation. This doesn't make the rules enforceable in software, but it gives the board/committee a clear record that the resident was shown and agreed to the rules, which matters if an enforcement action is needed after the fact.

### 3.6 Possible future enhancement (out of scope for now)
A lightweight "currently playing" check-in so residents can see live court status before walking over. Not requested — noting as an option only.

### 3.7 Build status (2026-09-02)

First draft built and left uncommitted for Keith to review — nothing has been applied to the live database or deployed:

- `supabase/migrations/pickleball_reservations.sql` — new table, RLS, and a backfill granting all current active residents access. **Not yet applied to the Supabase project** — needs running via the SQL editor or `supabase db push`.
- `src/components/apps/PickleballCourt.jsx` + `src/pages/apps/PickleballPage.jsx` — the booking UI (schedule grid, rules acknowledgment modal, my-reservations list with cancel).
- Wired into `src/App.jsx` (route), `src/components/layout/AppShell.jsx` (sidebar), `src/pages/HomePage.jsx` (dashboard tile).
- `supabase/functions/create-user/index.ts` — added `pickleball` to `DEFAULT_APPROVED_APPS` so future approvals get access automatically. **This Edge Function needs redeploying** (`--no-verify-jwt`, per [[Supabase deploy gotcha]]) for that to take effect; the migration's backfill already covers everyone currently active.
- `npx eslint` passes clean on all new/touched files. `npm run build` could not be verified in this session — the mounted folder's `node_modules` hit a pre-existing rollup native-binary issue unrelated to these changes (see `Cannot find module @rollup/rollup-linux-x64-gnu`); worth a normal `npm run dev`/`npm run build` on your own machine before trusting it fully.
- Assumption baked in, not yet confirmed: court operating hours (placeholder 8am–8pm, giving eight 1.5h slots/day) — it's a single constant (`COURT_SLOTS` inputs) at the top of `PickleballCourt.jsx`, easy to change.
- Still open: how existing households with two accounts actually share `profiles.address` in practice — the one-reservation-per-day rule trusts that field to be identical across household members (it already is for the same reason in `access_requests`), but hasn't been spot-checked against real data.

## 4. Open Items Before Launch

Design/build items are resolved (2.14, 3.7). What's left is deployment and real-world setup:

- **Apply `clubhouse_reservations.sql`** to the live database (Keith, via SQL editor or `supabase db push`).
- **Apply `pickleball_reservations.sql`** to the live database (still pending from the earlier phase).
- **Push the code** to `main` — only after both migrations are applied, so the live Add Event flow never queries a table/column that doesn't exist yet.
- **Deploy Edge Functions** (`--no-verify-jwt`): `clubhouse-payment-check` (new), `create-user` (redeploy — `DEFAULT_APPROVED_APPS` now includes `pickleball`).
- **Schedule `clubhouse-payment-check`** via `supabase/clubhouse-payment-check-cron.sql`, after it's deployed.
- **Grant `clubhouse` app access**: Keith first (testing), then Mariesol/Al once their accounts exist, then committee members.
- **Set up Mariesol's (and Al's, if needed) RCP portal account(s)** — see the deployment summary given to Keith alongside this build for exact steps.
- **Board decisions still needed:** Side Room fee, Tables & Chairs fee (both currently unpriced/un-bookable on purpose), final payment-deadline-days reconciliation (30 vs. 60), who fulfills tables/chairs setup.
- **Pickleball:** confirm how household/unit is represented across multiple resident logins in the current schema (3.3) — believed fine (reuses `profiles.address`, same as `access_requests`), not spot-checked against real data.
- **Update the Help screens** to cover the new reservation flow (clubhouse/side-room/tables booking through Add Event, private-event masking, payment-by-check, and pickleball booking) once the feature actually goes live — not before, so Help doesn't describe something residents can't do yet. A reminder is scheduled for early October to catch this.

## 5. Out of Scope (this phase)

- Changing the clubhouse fee amount (board-directed, not a portal feature).
- Enforcing pickleball's physical-presence rules in software.
- Multi-court scheduling (only one court exists today).

## 6. Discussion Items for Future Rollouts (not this phase)

- **A durable "feature tester" mechanism, decided 2026-09-05.** This phase's clubhouse test-phase gate needed a way to let a plain resident try new functionality without full rollout — solved for now with a short-lived hardcoded allowlist in `SocialCalendar.jsx` (see 2.13 addendum), because `app_access.role` is DB-constrained to `'admin'`/`'user'` (meaningful values already, for clubhouse and every other app sharing that column) and can't safely absorb a third generic value. Keith's counterpoint: since there's no separate staging environment (deliberately, per 2.13, to avoid an ongoing cost) and won't be one, a reusable way to add/remove test users in production would help every future rollout of comparable size, not just this one. Agreed as worth doing properly next time something this big needs testing — likely as its own small table (e.g. `feature_testers(user_id, feature_key)`) kept separate from `app_access`/RLS entirely, rather than widening the role constraint. Revisit when the next big feature needs a test phase.
