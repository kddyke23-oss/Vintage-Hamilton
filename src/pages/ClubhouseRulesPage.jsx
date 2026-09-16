import { Link } from 'react-router-dom'

// Public, standalone page reproducing the Rules & Regulations from the
// signed "Clubhouse Lease Agreement" (Vintage at Hamilton Homeowners
// Association, Inc.). This intentionally covers ONLY the standing rules —
// not any specific booking's details, which are captured on the booking
// form itself and reproduced in the confirmation/acknowledgment emails.
//
// Dollar amounts and day-thresholds that are board-configurable settings
// (base fee, side room fee, additional-hour fee, security deposit, tables &
// chairs fee, payment deadline) are described here without being
// hardcoded, since the live, current values are always shown on the
// booking form itself — this avoids the page drifting out of sync with
// whatever the Board has actually set.
//
// Not wrapped in AppShell — reachable without being signed in (linked
// directly from booking-confirmation emails), same pattern as LoginHelpPage.
export default function ClubhouseRulesPage() {
  return (
    <div className="min-h-screen bg-brand-800 py-10 px-4">
      <div className="w-full max-w-3xl mx-auto">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-semibold text-white mb-1">
            Vintage <span className="text-gold-400">@</span> Hamilton
          </h1>
          <p className="text-brand-300 text-sm">Community Portal · Hamilton, NJ</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-7">

          <div>
            <h2 className="font-display text-2xl text-brand-800 mb-1">
              Clubhouse Rules &amp; Regulations
            </h2>
            <p className="text-sm text-brand-500">
              For leasing the Vintage at Hamilton Clubhouse. These are the standing rules
              every Leasing Resident agrees to when they submit a Clubhouse booking request.
              This page does not cover the details of any individual booking — those are
              confirmed on the booking form itself and included in your booking emails.
            </p>
          </div>

          {/* 1. General */}
          <section>
            <h3 className="font-semibold text-brand-800 mb-2">1. General</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-600">
              <li>A Clubhouse booking must be submitted and paid for in advance. Bookings submitted less than 60 days before the lease date can still be cancelled, but are subject to forfeiture of the security deposit (see the cancellation terms below).</li>
              <li>Payment is made as two amounts — the rental fee(s) and the security deposit — payable to the Homeowners Association. The current, board-set amounts for each fee are always shown on the booking form.</li>
              <li>If payment is made by personal check and the check fails to clear the bank, the Leasing Resident is responsible for an additional returned-check fee, and the booking is considered null and void.</li>
            </ul>
          </section>

          {/* 2. Leasing Fees, explanation */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">2. Leasing Fees, explanation</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-600">
              <li><strong>Clubhouse fee</strong> — the base fee to rent the Clubhouse (and/or Small Side Room, where available) for a maximum of 6 hours.</li>
              <li><strong>Additional Hour fee</strong> — charged for use beyond the standard 6-hour booking window, up to the latest vacate time shown on the booking form.</li>
              <li><strong>Tables &amp; Chairs fee</strong> — charged if extra tables or chairs are requested beyond what&apos;s normally set up.</li>
              <li><strong>Security Deposit</strong> — refundable, required to protect the Association in the event of a Rules violation or if the Clubhouse (or Side Room) is not left in its original, clean condition. The Security Deposit also covers cleaning should the space not be left as expected. Any amount not used to offset the above is returned to the Leasing Resident within two weeks of the end of the rental period.</li>
            </ul>
            <p className="text-sm text-brand-600 mt-3">
              The current amount for each fee is shown live on the booking form when you request a date.
            </p>
            <p className="text-sm text-brand-600 mt-3">
              <strong>Cancellations:</strong> provided not less than sixty (60) days&apos; notice of cancellation is
              given in writing to the Property Manager, 80% of the Security Deposit is returned. For
              cancellations of less than sixty (60) days but at least fourteen (14) days before the rental date,
              and for reasons acceptable to a majority of the Board, 50% of the Security Deposit is returned.
              In all other cases of cancellation, the Security Deposit is not refunded.
            </p>
          </section>

          {/* 3. Eligibility */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">3. Clubhouse, lease eligibility</h3>
            <p className="text-sm text-brand-600">
              Only a Member in good standing of the Homeowners Association may submit a Clubhouse
              booking, whether on behalf of themselves or a member of their immediate family.
            </p>
          </section>

          {/* 4. Clubhouse defined */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">4. Clubhouse, defined</h3>
            <p className="text-sm text-brand-600 mb-2">
              Areas available for use by the Leasing Resident and their guests:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-brand-600 mb-3">
              <li>Clubhouse room (and Small Side Room, where booked and available)</li>
              <li>Bathrooms (not for exclusive use), together with any hallway leading to them</li>
            </ul>
            <p className="text-sm text-brand-600 mb-2">
              All other areas of the community facility are off-limits to guests of the Leasing Resident,
              including but not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-brand-600">
              <li>Fitness room</li>
              <li>Swimming pool</li>
              <li>Office</li>
              <li>Patio</li>
              <li>Pickleball court</li>
              <li>Janitor&apos;s closet (if applicable)</li>
            </ul>
          </section>

          {/* 5. Insurance Indemnification */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">5. Insurance Indemnification</h3>
            <p className="text-sm text-brand-600 mb-3">
              The Leasing Resident expressly agrees to defend, indemnify and hold harmless the
              Homeowners Association, its members, agents, servants, employees and all those working in
              concert with the Homeowners Association, from and against any and all claims for loss or
              damage to property, or injury to or death of any person, resulting from or arising in any manner
              — including from the serving of alcoholic beverages — out of the Leasing Resident&apos;s (including
              but not limited to their guests, family, agents, invitees, and/or those on the premises) use,
              operation or possession of the Clubhouse. The Leasing Resident also assumes all costs of
              litigation, including attorney&apos;s fees, in connection with this indemnification.
            </p>
            <p className="text-sm text-brand-600 mb-3">
              The Leasing Resident agrees to release the Homeowners Association from responsibility and
              liability for personal property belonging to the Leasing Resident and/or their guests, family,
              agents, and invitees.
            </p>
            <p className="text-sm text-brand-600 font-medium">
              The Leasing Resident must confirm they carry liability insurance as part of the booking request
              and provide proof to RCP (the Property Manager) on request.
            </p>
          </section>

          {/* 6. Responsibilities of the Leasing Resident */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">6. Responsibilities of the Leasing Resident</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-600">
              <li>Schedule a pre-leasing inspection of the Clubhouse with the Property Manager or a member of the Recreational Committee at least one (1) day in advance.</li>
              <li>Conduct a post-leasing inspection of the Clubhouse with the Property Manager.</li>
              <li>Be present in the Clubhouse for the entire time the party or affair is in progress, from initial set-up to clean-up.</li>
              <li>Set up, take down, and if necessary clean, the tables and chairs used for the function. All furniture must be returned to its original location.</li>
              <li>Remove all personal items, decorations and equipment prior to the end of the rental period. Tacks, pins, pushpins, scotch tape and similar items are strictly prohibited for attaching decorations.</li>
              <li>Prohibit smoking within the Clubhouse, any other part of the building, or within 25 feet of any entrance.</li>
              <li>Prohibit special effects of any kind — including pyrotechnics, fireworks, firecrackers, sparklers, bonfires or open fires. A reasonable amount of candles on a cake or as part of a table centerpiece is permitted. Fireplaces, if applicable, cannot stay on for more than one (1) consecutive hour and must be shut off by the end of the rental period.</li>
              <li>Ensure guests park only in the designated parking area. Parking in reserved spaces, fire lanes, or undesignated spots may result in fines and/or towing, and is a violation of the Agreement.</li>
              <li>Remove all trash prior to vacating — trash cannot be left inside the Clubhouse and must be properly disposed of in the waste container provided in the parking facility.</li>
              <li>Vacate the Clubhouse by the standard vacate time shown on the booking form. Staying later requires advance written approval from the Board, requested via the booking form, and is never permitted past midnight regardless of approval. An additional fee applies for any approved time beyond the standard vacate time.</li>
              <li>Abide by these Rules and the Clubhouse Lease Agreement. Violations may result in forfeiture of all monies paid and a one (1) year suspension of the right to rent the Clubhouse or any portion of it.</li>
            </ul>
          </section>

          {/* 7. Non-Smoking */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">7. Non-Smoking Facility</h3>
            <p className="text-sm text-brand-600">
              The entire interior of the Clubhouse, including the restrooms, is non-smoking. Smoking
              outside is not permitted within 25 feet of any exterior building door. The Leasing Resident is
              responsible for any violations of this policy by their guests, who remain subject to applicable
              state, county and municipal laws.
            </p>
          </section>

          {/* 8. Alcohol + Additional Items + Waiver */}
          <section className="border-t border-brand-100 pt-6">
            <h3 className="font-semibold text-brand-800 mb-2">8. Alcohol Usage</h3>
            <p className="text-sm text-brand-600 mb-3">
              Alcoholic beverages are permitted. The Leasing Resident, and anyone in the Clubhouse
              including guests, agents, caterers or hired staff, may not serve or cause to be served alcohol to
              anyone under twenty-one (21) years of age, or to any person who appears intoxicated. The
              Board reserves the right, but is not obligated, to check identification of anyone consuming
              alcohol. <strong>Alcohol is only permitted inside the Clubhouse.</strong> Any violation of this rule can
              result in the immediate forfeiture of rights of the Leasing Resident, or members of their
              household, from future use of the entire common area of the Association.
            </p>

            <h4 className="font-semibold text-brand-800 mb-2 mt-4">Additional Items</h4>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-600">
              <li>A set number of chairs are available free of charge (see the booking form for the current amount, and any fee for chairs beyond that).</li>
              <li>Please be considerate of residents whose homes are close to the Clubhouse — no loud music or excessive noise. Violation of local noise ordinances is governed by the Association&apos;s rules as well as the local police department.</li>
              <li>Clubhouse leasing is available on a first-come, first-served basis.</li>
              <li>For a booking to be confirmed, the Property Manager must have received a properly completed request and all monies due within the payment window shown on the booking form.</li>
              <li>The Board must approve any recurring programs that use the Clubhouse in advance.</li>
              <li>Any games of chance — including card games, casino-style games, raffles, or Bingo — require advance written Board approval. Where a government license is required, a copy must be provided to the Board in advance.</li>
              <li>By submitting a booking request, the Leasing Resident agrees to abide by these Rules and Regulations, and by the Master Deed, By-Laws and Rules and Regulations of the Homeowners Association generally.</li>
            </ul>

            <h4 className="font-semibold text-brand-800 mb-2 mt-4">Waiver</h4>
            <p className="text-sm text-brand-600">
              The failure of either party to enforce any provision of the Clubhouse Lease Agreement shall not
              be construed as a waiver or limitation of that party&apos;s right to subsequently enforce and compel
              strict compliance with every provision of the Agreement.
            </p>
          </section>

          {/* Signature note */}
          <section className="border-t border-brand-100 pt-6">
            <p className="text-sm text-brand-600 bg-brand-50 border border-brand-100 rounded-lg px-4 py-3">
              There&apos;s no separate paper form to sign. When you submit a Clubhouse booking request, your
              acceptance of these Rules &amp; Regulations — together with RCP&apos;s acknowledgment of your
              booking on the Association&apos;s behalf — serves as the signed Clubhouse Lease Agreement. Both
              acceptances, with the name and date/time of each, are recorded on your booking and included
              in your booking emails.
            </p>
          </section>

        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-brand-300 hover:text-gold-400 text-sm transition-colors"
          >
            ← Back to Vintage @ Hamilton
          </Link>
        </div>

      </div>
    </div>
  )
}
