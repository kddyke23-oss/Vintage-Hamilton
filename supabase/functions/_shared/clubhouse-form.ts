// Shared helper: render the full "completed Clubhouse Lease Agreement" as an
// HTML fragment — every booking detail plus the resident/RCP acknowledgment
// record — for embedding directly in an email body (never a PDF attachment).
//
// Built 2026-09-17, replacing an earlier approach that just linked the old
// paper-template PDF. Keith's direction: the email itself should reproduce
// the whole completed form (all booking specifics), and the acknowledgment
// record (who + when, both sides) stands in for the paper's signature lines.
// The actual Rules & Regulations text lives at /clubhouse-rules on the site
// (not reproduced here) — this only covers this specific booking's details.
//
// Import with: import { buildBookingDetailsTable, buildSignatureBlock } from '../_shared/clubhouse-form.ts'

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${Number(n).toFixed(2)}`
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">${label}</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${value}</td></tr>`
}

export interface ClubhouseFormData {
  residentName: string
  when: string
  wantsMainClubhouse: boolean
  wantsSideRoom: boolean
  extraTables: number
  extraChairs: number
  privateAnswerLabel: string
  guestCount: number | null
  wantsLateEnd: boolean
  insuranceConfirmed: boolean
  feeMain: number | null
  feeSideRoom: number | null
  feeTablesChairs: number | null
  feeAdditionalHours: number | null
  deposit: number | null
  totalDue: number | null
}

/**
 * The full booking record — every field captured on the form, reproduced as
 * a table. Fee rows only render for fields that actually apply/are priced,
 * same as before; everything else always shows so both sides have the
 * complete picture of what was requested and agreed to.
 */
export function buildBookingDetailsTable(d: ClubhouseFormData): string {
  const resourceParts: string[] = []
  if (d.wantsMainClubhouse) resourceParts.push('Main Clubhouse')
  if (d.wantsSideRoom) resourceParts.push('Small Side Room')
  if (d.extraTables > 0) resourceParts.push(`${d.extraTables} extra table${d.extraTables === 1 ? '' : 's'}`)
  if (d.extraChairs > 0) resourceParts.push(`${d.extraChairs} extra chair${d.extraChairs === 1 ? '' : 's'}`)
  const resources = resourceParts.join(', ') || '(no resource on file)'

  const feeRows = [
    d.feeMain != null ? row('Main Clubhouse fee', money(d.feeMain)) : '',
    d.feeSideRoom != null ? row('Side Room fee', money(d.feeSideRoom)) : '',
    d.feeTablesChairs != null ? row('Extra Tables &amp; Chairs fee', money(d.feeTablesChairs)) : '',
    d.feeAdditionalHours != null ? row('Additional hours fee', money(d.feeAdditionalHours)) : '',
    d.deposit != null ? row('Security deposit', `${money(d.deposit)} (also covers cleaning if the space isn't left as required)`) : '',
    d.totalDue != null ? `<tr><td style="padding:6px 12px 3px;font-size:13px;color:#1A3F5C;font-weight:700;">Total due</td><td style="padding:6px 12px 3px;font-size:13px;color:#1A3F5C;font-weight:700;">${money(d.totalDue)}</td></tr>` : '',
  ].filter(Boolean).join('')

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
    ${row('Resident', `<strong>${d.residentName}</strong>`)}
    ${row('When', d.when)}
    ${row('Resources requested', resources)}
    ${d.guestCount != null ? row('Expected guests', String(d.guestCount)) : ''}
    ${row('Private event?', d.privateAnswerLabel)}
    ${row('Liability insurance confirmed', d.insuranceConfirmed ? 'Yes' : 'No')}
    ${d.wantsLateEnd ? row('Requested to stay past vacate time', 'Yes — subject to Board approval') : ''}
    ${feeRows}
  </table>`
}

/**
 * The acknowledgment record — who accepted the Rules & Regulations (the
 * resident, at submission) and who acknowledged the booking on the
 * Association's behalf (RCP), each with a name and timestamp. This is the
 * durable stand-in for the two signature lines on the paper agreement.
 * Renders whichever half has actually happened; call it again once RCP has
 * acted to get the completed two-sided version.
 */
export function buildSignatureBlock(opts: {
  residentName: string | null
  residentSignedAt: string | null
  rcpName: string | null
  rcpSignedAt: string | null
  rulesUrl: string
}): string {
  const { residentName, residentSignedAt, rcpName, rcpSignedAt, rulesUrl } = opts
  if (!residentName || !residentSignedAt) return ''

  const rcpLine = (rcpName && rcpSignedAt)
    ? `Acknowledged on the Association's behalf by <strong>${rcpName}</strong> on ${rcpSignedAt}.`
    : `Awaiting acknowledgment from RCP.`

  return `<div style="margin:14px 0 0;padding:10px 12px;background:#FBF3E4;border-radius:6px;">
    <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:#5C4419;">
      Accepted by <strong>${residentName}</strong> on ${residentSignedAt}.<br/>
      ${rcpLine}
    </p>
    <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#5C4419;">
      Together these serve as the signed Clubhouse Lease Agreement. The Rules &amp; Regulations are posted at
      <a href="${rulesUrl}" style="color:#8a5a00;">${rulesUrl}</a>.
    </p>
  </div>`
}
