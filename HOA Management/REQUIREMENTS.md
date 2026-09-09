# Vintage@Hamilton — HOA Ticketing & Vendor Management Module
## Requirements Document

| | |
|---|---|
| **Version** | 1.0 (draft for review) |
| **Date** | July 7, 2026 |
| **Author** | Keith Dyke, with Claude (research + drafting) |
| **Audience** | (1) Keith / HOA board for review; (2) Claude Code for design & build |
| **Companion documents** | `Blue Book.pdf` (this folder) — Public Offering Statement, DCA Reg. R-4905, containing the Declaration of Covenants and Bylaws |

### How to read this document
Every requirement has an ID (`FR-xx` functional, `NFR-xx` non-functional) and a **source tag**:

- **[K]** — decision made by Keith during requirements sessions (July 2026)
- **[BB §x.xx]** — mandated or constrained by the Blue Book (Declaration/Bylaws section)
- **[NJ]** — New Jersey law (Radburn/PREDFDA/N.J.A.C. 5:26) or federal law
- **[D]** — derived/proposed requirement, accepted during review

Requirements marked **(P2)** are Phase 2. Everything else is Phase 1.

---

## 1. Background & Context

**The community.** Vintage@Hamilton is a 120-unit, age-restricted (55+) townhome community in Hamilton, NJ (Mercer County). It is a **planned real estate development under PREDFDA** (N.J.S.A. 45:22A), *not* a condominium: owners hold fee-simple title to their house, lot, and fence. The association owns/manages common property (clubhouse, pool, common grounds) and provides defined services on the lots (snow clearing, lawn maintenance — see §6 responsibility matrix). Governed by a Declaration of Covenants + Bylaws (in the Blue Book) and incorporated under NJ Title 15A.

**Current state.** A third-party management company manages the community. The board is dissatisfied with transparency and responsiveness and is evaluating three futures: (1) keep the management company but hold it accountable, (2) hybrid self-management with outsourced financials, (3) full self-management.

**This module.** A ticketing and vendor-management system inside the existing community portal. It must be **operating-model neutral**: the "manager" role can be held by the management company today and by volunteers tomorrow without redesign. Its dashboards are also the evidence base for the management-company decision.

**Goals, in priority order:**
1. Transparency — every issue raised is visible, tracked, and measured through closure.
2. Accountability — SLA and performance data on the management company and vendors.
3. Compliance — NJ (Radburn) and Blue Book procedures encoded as workflows, not tribal knowledge.
4. Optionality — supports any of the three operating models.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Ticket** | Any tracked item: maintenance request, ARC application, board/committee action, governance task, vendor issue |
| **Raiser** | The person who created the ticket (or on whose behalf it was created) |
| **Triage** | First review: classify, set responsibility lane, route to assignee |
| **Assignee** | Party responsible for resolution: board, a committee, a vendor, or the management company |
| **Manager** | Whoever performs triage/coordination — management company staff today; configurable |
| **ARC** | Architectural Control Committee (Blue Book term: "Architectural Control Committee") |
| **Judiciary Committee** | The Bylaws-mandated ADR body (Bylaws Art. XV) — Phase 2 workflows |
| **Payer** | Who funds work on a ticket: `association` or `member-direct` |
| **COI** | Certificate of Insurance |
| **SLA** | Service level agreement (response/resolution targets per category) |

---

## 3. Regulatory & Governing-Document Constraints

These are legal/contractual facts the system must respect. Verified against primary sources July 2026.

| # | Constraint | Source |
|---|---|---|
| C-1 | ARC requests must be answered within **60 days of receipt; silence = automatic approval** (deemed approval). | BB §11.03 |
| C-2 | ARC submissions require **written acknowledgment of receipt** (Blue Book channels: personal delivery to managing agent w/ acknowledgment, or certified mail). Portal intake must generate an acknowledgment; board should formally designate the portal as an accepted channel (see Open Item OI-2). | BB §11.03 |
| C-3 | Municipal permit applications require **prior written ARC approval**; owner must furnish permit copy before work starts. | BB §11.03 |
| C-4 | ARC may charge a reasonable review fee and attach conditions to approvals. | BB §11.03 |
| C-5 | Owner exterior repairs must preserve "architectural harmony" and use materials of at least equivalent quality — even like-for-like replacements touch the ARC lane. | BB §3.03 |
| C-6 | Fines: notice to owner + offer of ADR required **before** any fine; each day may be a separate violation; fines collect as assessments. (P2) | BB §11.05; N.J.S.A. 45:22A-44(c) |
| C-7 | ADR runs through the **Judiciary Committee** with fixed timelines: complaint → copy to respondent within 7 days → response within 14 days → informal resolution → formal hearing on 14 days' notice → decision ~24h after hearing. (P2) | BB Bylaws Art. XV |
| C-8 | Board votes to spend association money are **binding votes** that must occur at an open meeting with ≥7 days' posted notice (Radburn). The portal records approvals against a meeting date; a portal click is not the legal act. | N.J.A.C. 5:26-8.12 |
| C-9 | Snow/ice service triggers: clear at **2" snow accumulation**, treat at **¼" ice** — association scope includes streets, sidewalks, and declarant-installed driveways/service walks/entrance porches. | BB §5.04/§8.07 |
| C-10 | Association records must be available to members within a reasonable time; immutable audit trails support this. | N.J.S.A. 46:8B-14 analog; DCA guidance |
| C-11 | HOPA 55+ exemption requires age-verification surveys **at least every 2 years** with retained records (compliance-calendar item). | 24 CFR 100.307 |
| C-12 | Elections follow the Radburn timeline (nomination notice ≥30 days before election-notice mailing; ≥14-day nomination window; election notice 14–60 days ahead) — compliance-calendar items. | N.J.S.A. 45:22A-45.2 |
| C-13 | Association disclaims liability for contractors hired by owners — the member-facing vendor list must display this disclaimer. | BB §11.03 |
| C-14 | Third-party collectors of assessments are subject to FDCPA/Reg F. Phase 1 only touches this via dunning-safe language in templates; collections workflow is out of scope. | 15 U.S.C. 1692; 12 CFR 1006 |

---

## 4. Roles & Permissions

Reuse the portal's existing Supabase auth, `profiles` (with `is_admin`), and per-app role pattern (`app_access` with `app_id`/`role`). This module registers as a new app.

| Role | Who | Can |
|---|---|---|
| **Resident** | Verified member (owner) | Raise tickets; view community-visible tickets; view/comment own tickets; accept/reject closure; rate satisfaction; browse approved-vendor list; submit ARC applications |
| **Tenant** | Renter in a unit | Raise maintenance tickets only (no governance/ARC) |
| **Committee member** | Per-committee assignment | Resident rights + full access to their committee's queue; comment; resolve; ARC members: review/approve/condition/deny ARC tickets |
| **Board member** | Board role | All tickets incl. private; approve expenses (recorded against meeting votes); manage vendors; view performance dashboards; act as triage backstop |
| **Manager** | Mgmt co staff (today) or designated volunteer | Triage/route/assign all tickets; update any ticket; no expense approval |
| **Vendor** | Vendor contact (portal login optional) | See **only tickets assigned to their vendor** — no resident contact details beyond what the ticket exposes; update status; comment; upload docs |
| **Admin** | Portal admin (Keith et al.) | Everything + configuration: ticket types, categories, committees, vendors, routing rules, SLAs, thresholds, templates |

Permission requirements:

- **FR-1** Committees are admin-definable entities (name, members, queue). Seed: Architecture (ARC), Finance, Social, Judiciary (P2). [K]
- **FR-2** Vendors are admin-definable entities with categories (seed: Landscaping, Snow Removal, Clubhouse Maintenance, Pool Maintenance, Insurance). [K]
- **FR-3** Vendor users are scoped to their vendor's tickets only, enforced at the database level (Supabase RLS), not just the UI. [K][D]
- **FR-4** Tickets can be raised **on behalf of** a resident by manager/board/admin (phone/paper intake — 55+ community). [D]

---

## 5. Functional Requirements — Ticket Core

### 5.1 Intake
- **FR-10** Any member can raise a ticket via the portal. [K]
- **FR-11** Ticket fields: type, category, title, description, location (unit # or named common area), priority (normal/urgent/emergency), attachments (photos/PDFs), payer (`association`/`member-direct`), visibility tier. [K][D]
- **FR-12** Email-in: sending/replying to the module's email address creates/updates tickets. Inbound replies append as comments with attachments preserved. This is the primary vendor/management-company channel. [K]
- **FR-13** Emergency priority immediately displays after-hours vendor/emergency contacts to the raiser and notifies manager + board backstop in parallel. [D]

### 5.2 Ticket types (admin-definable, each with its own workflow)
Seed types:

| Type | Workflow | Notes |
|---|---|---|
| Maintenance request | Standard | Routes by responsibility matrix (§6) |
| ARC application | ARC workflow (§7) | 60-day statutory clock |
| ARC notification (like-for-like) | Fast-track (§7.5) | Repairs w/ equivalent materials |
| Board/committee action | Standard, assigned to board/committee | Governance follow-through |
| Vendor issue | Standard, vendor-assigned | Complaints about vendor service |
| Billing/account inquiry | Standard, always private | |
| Compliance task | Auto-generated recurring (§10) | |
| Violation report | (P2) Judiciary workflow | Data model supports from day 1 |

- **FR-14** Each type defines: default assignee/queue, visibility default, SLA targets, required fields, workflow states. [K][D]

### 5.3 Status model
- **FR-15** States: `New → Triaged → Assigned → In Progress → [Pending Approval] → Resolved → Accepted/Closed`, plus `Reopened`, `Merged`, `Cancelled`. `Pending Approval` only for association-paid work (§8). [K][D]
- **FR-16** Every transition is timestamped and attributed (immutable event log). [D][C-10]

### 5.4 Triage & routing
- **FR-17** Manager triages new tickets: confirm type/category, set responsibility lane (§6), assign. [K]
- **FR-18** **Board backstop**: tickets untouched after N days (configurable, default 3 business days) auto-escalate to a designated board member. Escalations are logged — this measures management-company responsiveness. [K]
- **FR-19** Routing rules (admin-configurable): category → default assignee (e.g., `snow` → snow vendor queue). Humans handle exceptions. [D]
- **FR-20** Duplicate handling: manager can merge tickets; all raisers of merged tickets become subscribers of the master ticket and receive its updates. "Similar open tickets" hint shown at intake to reduce duplicates. [D]

### 5.5 Updates through closure
- **FR-21** All parties on a ticket (raiser, subscribers, assignee, manager) receive updates on state changes and comments, honoring notification preferences (default ON). [K]
- **FR-22** Comments have two tiers: **public** (visible per ticket visibility) and **internal** (board/committee/manager only). Vendors see public comments on their tickets only. [D]
- **FR-23** **Closure acceptance**: when Resolved, the raiser is asked to accept. Accept → Closed. Reject (with reason) → Reopened. [K]
- **FR-24** Acceptance timeout: no raiser response in 14 days (configurable) → auto-close, with a 14-day reopen window. [K][D]
- **FR-25** On acceptance, raiser gives a 1–5 satisfaction rating (optional but prompted) — feeds vendor/manager performance metrics. [K]

### 5.6 Visibility & privacy
- **FR-26** Routine tickets (maintenance, common-area, vendor issues) are **community-visible** by default: any resident can see title, status, category, location, public comments. [K]
- **FR-27** Always-private types: billing inquiries, anything person-vs-person, ADR/violation matters (P2), and any ticket the triager marks private. Private = raiser + assignee + board + manager. [K][D]
- **FR-28** Vendor users never see resident names/contact info on community-visible tickets beyond the service address. [D]

---

## 6. Maintenance Responsibility Matrix

Triage assigns every maintenance ticket to one of three lanes. Encoded as data (admin-editable), seeded from the Blue Book:

| Lane | Examples | Route to |
|---|---|---|
| **Owner responsibility** [BB §3.03] | Siding, roof, windows, doors, chimneys, HVAC/plumbing/electrical; driveway/walk *repair or replacement*; *replacement* of any lawn/shrubs/trees (even declarant-installed); owner-installed landscaping; utility laterals; snow on patios/other lot surfaces | Ticket converted to **owner notice** (courtesy info + approved-vendor suggestions + ARC reminder if exterior). Not a work order. |
| **Association service on lots** [BB §5.04/§8.07] | Snow/ice on declarant-installed driveways, service walks, entrance porches (2"/¼" triggers); routine *maintenance* of declarant-installed lawns, beds, trees; 5'×10' lawn-maintenance easements | HOA vendor queue (landscaping/snow) |
| **Common property** [BB §5.04] | Clubhouse, pool, streets, sidewalks, common grounds, stormwater, retaining walls | HOA vendor or committee queue |

- **FR-30** Triage records the lane determination on the ticket (dispute-proofing: "whose roof is it" answered once, in writing). [D]
- **FR-31** Owner-responsibility tickets auto-suggest the approved-vendor list (§9.6) and, for exterior work, prompt an ARC application/notification per C-5. [D]

---

## 7. ARC Workflow (Phase 1, legally load-bearing)

### 7.1 Application
- **FR-40** ARC application ticket: structured form — nature of change (from BB §11.03 list: structural addition/alteration, satellite dish, hot tub, shed, canopy, awning, trellis, arbor, deck, patio, landscaping, hardscaping, wall), plans/specs/photos attachments, contractor (optional, link to vendor list), payer is always `member-direct`. [K][BB §11.03]
- **FR-41** On submission the system **immediately issues a written acknowledgment of receipt** (portal + email, timestamped) and **starts the 60-day clock**. [C-1][C-2]

### 7.2 The 60-day clock
- **FR-42** Visible countdown on the ticket and on the ARC queue dashboard. Escalating alerts to ARC members and board at T-30, T-14, T-7, T-3 days. [C-1]
- **FR-43** If day 60 passes with no decision, the system records **"Approved by operation of Declaration §11.03 (deemed approval)"** and notifies all parties. This state is distinct from an affirmative approval. [C-1]

### 7.3 Decision
- **FR-44** ARC decisions: Approve / Approve with conditions (free-text conditions recorded and shown to owner) / Deny (with reason). Review fee recordable per C-4. [BB §11.03]
- **FR-45** Permit tracking: if a municipal permit is needed, ticket cannot progress to "work may begin" until ARC approval is recorded, and the owner must upload the permit copy before the ticket can be marked work-started. [C-3]

### 7.4 Property-linked history
- **FR-46** ARC tickets attach to the **property (unit), not the person**. Full ARC history per unit survives ownership changes and is exportable for resale disclosure packets. [D]

### 7.5 Fast-track / standards library
- **FR-47** **Standards library**: published architectural standards (approved colors, materials, pre-approved change list) browsable in the portal, admin-maintained. [D]
- **FR-48** **ARC notification type** for like-for-like repairs with equivalent materials (C-5): owner notifies, ARC has a short internal SLA (default 14 days) to object, else auto-acknowledged. Items on the pre-approved list can auto-approve instantly. Cuts committee load. [D]

---

## 8. Expense Approval

- **FR-50** Every ticket carries a **payer** field. `member-direct` (owner pays vendor directly, e.g., ARC work) never enters the approval gate. [K]
- **FR-51** `association`-paid work requires **board approval — no manager/committee discretion tier**. Ticket enters `Pending Approval` with quotes attached. [K]
- **FR-52** Approval record = decision + **open-meeting date of the binding vote** (C-8). The portal captures votes/ratification; it does not replace the meeting. [NJ]
- **FR-53** Configurable option to require N competing quotes above a threshold (admin-set; default: 3 quotes above $5,000 — confirm value, OI-3). [D]
- **FR-54** **Emergency expenditure procedure** (OI-1, board to define): proposed default — any two officers may authorize emergency work necessary to prevent property damage or safety risk; ticket flagged `emergency-authorized`, ratified at the next open meeting; portal tracks ratification. [D]

---

## 9. Vendor Module (Phase 1)

### 9.1 Registry
- **FR-60** Vendor record: name, category(ies), contacts, portal-login users (optional), contract (scope, term, start/end, value, renewal date), COI (file + expiry + additional-insured-named flag), NJ license/HIC registration number + expiry, W-9 on file, payment terms, emergency contact. [K][D]

### 9.2 Onboarding gates
- **FR-61** A vendor cannot be assigned tickets until: COI on file naming the association as additional insured, license/registration recorded, W-9 on file. Expired COI → **warn** on assignment (hard-block configurable). [D]
- **FR-62** Expiry alerts (COI, license, contract) to manager + Finance committee at 60/30/7 days. [D]

### 9.3 Interaction
- **FR-63** **Email-first**: ticket assignment/updates go to the vendor by email; vendor replies append to the ticket (FR-12). Portal login is optional per vendor. API integration deferred (P2). [K]

### 9.4 Performance measurement
- **FR-64** Per-vendor metrics computed from ticket data: response time (assignment → first action), resolution time, SLA breach count, reopen rate, ticket volume by category/season, average satisfaction rating. [K]
- **FR-65** SLA definitions per category, admin-configurable, seeded from Blue Book obligations — e.g., snow: response required when 2" accumulation reported (C-9). Breaches are logged automatically against the vendor and surfaced on dashboards. [K][C-9]
- **FR-66** Vendor ratings and comments are **internal only** (board/committee/manager). Members see no vendor scores. [K]

### 9.5 Contract renewal & RFP
- **FR-67** Renewal workflow: recurring ticket auto-created 90–120 days before contract end → board reviews the vendor performance dashboard → decision: renew / renegotiate / RFP. [K]
- **FR-68** **RFP generator**: produces a formatted RFP document (DOCX/PDF) from a per-category template populated with: scope of work (from Blue Book obligations + ticket history: volumes, seasonal patterns, hot spots), SLA terms, insurance/license requirements, contract term, evaluation criteria, response instructions. [K]
- **FR-69** Bid comparison: record received bids against the RFP's criteria; side-by-side comparison view; feeds the board approval workflow (FR-52). [K]

### 9.6 Member-facing approved-vendor list
- **FR-70** Directory of vendors members may use for **owner-funded work**, separate from contracted-vendor status. Listing criteria: license + insurance verified. Displays the BB §11.03 liability disclaimer prominently (C-13). No ratings shown (FR-66). [K]
- **FR-71** ARC tickets suggest approved vendors matching the work type. [D]

---

## 10. Compliance Calendar (recurring tickets)

- **FR-80** Admin-definable recurring ticket schedules; each generates a ticket with owner, due date, and reference notes. [D]
- **FR-81** Seed schedule:

| Item | Frequency | Assignee | Source |
|---|---|---|---|
| HOPA 55+ age-verification survey | Every 2 years | Board | C-11 |
| Annual election timeline (each Radburn deadline as a task chain) | Annual | Board | C-12 |
| Insurance renewal review | Annual | Finance | [D] |
| Pool permit (county health dept) + opening/closing | Annual/seasonal | Manager/vendor | [D] |
| Reserve study update | Every 5 years | Board/Finance | P.L.2023 c.214 as amended by P.L.2025 c.132 |
| Reserve funding % check (85%/100% election + owner notice if 85%) | Annual (budget season) | Finance | P.L.2025 c.132 |
| Tax filings: 1120-H election + NJ CBT-100 | Annual | Finance | IRC 528; NJ CBT |
| 1099-NECs to unincorporated vendors ($600+) | Annual (January) | Finance | IRS |
| NJ nonprofit annual report | Annual | Board | N.J.S.A. 15A:4-5 |
| Vendor contract renewals | Per contract (FR-67) | Board | [K] |
| COI/license expiry checks | Continuous (FR-62) | Manager | [D] |

---

## 11. Reporting & Dashboards

- **FR-90** Community dashboard (all residents): open tickets by category/status/age, recently closed, aggregate SLA stats. Transparency is the point. [K]
- **FR-91** Board dashboard: everything + private tickets, escalation log, SLA breaches, vendor performance, expense approvals pending, compliance calendar status. [K]
- **FR-92** **Monthly board report** auto-generated: tickets opened/closed, aging, SLA compliance by assignee (incl. the management company), escalations, spend approved. Exportable (PDF) for open-meeting distribution. [K][D]
- **FR-93** Immutable audit trail on every ticket; full export (CSV/PDF) to satisfy records-access requests (C-10). [NJ]

---

## 12. Non-Functional Requirements

- **NFR-1 Stack**: extend the existing portal — React 18 + Vite + Tailwind, Supabase (Postgres, Auth, RLS, Edge Functions), Resend for email, Vercel hosting. New module follows the existing `src/components/apps` + `src/pages/apps` pattern and the per-app role model in `AuthContext`. No new frameworks.
- **NFR-2 Security**: all visibility/permission rules enforced via Supabase RLS, not client-side. Vendor scoping (FR-3) is RLS policy. Private tickets invisible at the API level to unauthorized roles.
- **NFR-3 Audit immutability**: ticket events are insert-only (no UPDATE/DELETE grants on the events table).
- **NFR-4 Accessibility**: 55+ user base — large default font sizes, high contrast, simple flows, works well on tablets/phones; phone/paper intake path via FR-4. WCAG 2.1 AA target.
- **NFR-5 Email**: outbound via existing Resend integration. Known operational notes: digest currently sends `to: noreply@` with BCC delivery (bounce noise is expected, not a bug); notification preferences default **ON** (established Spring Fling decision). Inbound email parsing (FR-12) will need a Resend inbound route or equivalent webhook → Edge Function.
- **NFR-6 Deploy gotcha (critical)**: `supabase functions deploy` re-enables "Verify JWT with legacy secret" causing 401s — always deploy with `--no-verify-jwt`.
- **NFR-7 Scale**: 120 units, ~500–2,000 tickets/year. Optimize for clarity and maintainability, not throughput.
- **NFR-8 Retention**: tickets and ARC records retained indefinitely (ARC history must survive ownership changes, FR-46). HOPA survey records retained per C-11.
- **NFR-9 Document generation**: RFP DOCX/PDF generation (FR-68) and monthly report PDF (FR-92) server-side via Edge Function or a build-time library; keep dependencies light.

---

## 13. Data Model Sketch (guidance, not prescription)

```
properties(id, unit_number, address, ...)            -- 120 rows; link to existing directory
tickets(id, type_id, category_id, property_id?, raiser_id, on_behalf_of?, title,
        description, location_text, priority, payer, visibility, status,
        responsibility_lane, assignee_kind[committee|vendor|board|manager],
        assignee_id, master_ticket_id?, sla_due_at, arc_deadline_at?, created_at)
ticket_events(id, ticket_id, actor_id, kind, payload, created_at)   -- insert-only
ticket_comments(id, ticket_id, author_id, body, tier[public|internal], created_at)
ticket_subscribers(ticket_id, profile_id)
ticket_types(id, name, workflow, defaults...)        -- admin-definable
categories(id, name, default_route...)               -- admin-definable
committees(id, name) / committee_members(committee_id, profile_id)
vendors(id, name, categories[], contacts, contract_*, coi_*, license_*, w9_on_file,
        approved_for_members bool, emergency_contact)
vendor_users(vendor_id, profile_id)
arc_applications(ticket_id, change_kind, conditions, decision, decided_at,
                 deemed_approved bool, review_fee, permit_required, permit_doc_id)
expense_approvals(ticket_id, amount, quotes[], decision, meeting_date, emergency bool,
                  ratified_meeting_date?)
vendor_ratings(ticket_id, vendor_id, rating, comment)      -- internal-only via RLS
rfps(id, vendor_category, template_id, generated_doc, status)
bids(rfp_id, vendor_id, amount, criteria_scores, docs)
recurring_schedules(id, name, cron/rule, ticket_template, assignee)
standards_library(id, title, body, pre_approved bool)
```

Email-in: inbound webhook → Edge Function → match `ticket+<id>@` address or thread token → append comment/attachments.

---

## 14. Phasing

**Phase 1 (this document, except items marked P2):**
ticket core, triage + board backstop, email-in/out, visibility model, ARC workflow with 60-day clock, expense approval, full vendor module (registry, gates, performance, renewal, RFP generation, member-facing list), compliance calendar, dashboards + monthly report, audit/export.

**Phase 2:**
violations/covenant enforcement (notice → cure → ADR offer → fine, per C-6/C-7 Judiciary Committee timelines — data model anticipates it via `violation report` type and property-linked tickets), vendor API integrations, resale disclosure packet generation, possible collections/dunning support (FDCPA-sensitive — legal review first).

**Suggested Phase 1 build order for Claude Code:**
1. Schema + RLS + roles (foundation everything depends on)
2. Ticket core: intake → triage → assign → resolve → accept (portal-only)
3. Email-out notifications, then email-in
4. ARC workflow + 60-day clock + property history
5. Vendor registry + gates + assignment
6. Expense approval workflow
7. Dashboards, SLA computation, monthly report
8. Compliance calendar / recurring tickets
9. RFP generator + bid comparison
10. Standards library + member-facing vendor list

---

## 15. Open Items (board decisions needed — do not block build start)

| ID | Item | Default until decided |
|---|---|---|
| OI-1 | Emergency expenditure procedure (who can authorize, cap, ratification) | FR-54 proposal |
| OI-2 | Board resolution designating the portal as an accepted ARC submission channel (BB §11.03 lists personal delivery/certified mail) | Portal acknowledgment (FR-41) + keep paper channel open |
| OI-3 | Competing-quote threshold value | 3 quotes above $5,000 |
| OI-4 | Board backstop escalation window (N days) | 3 business days |
| OI-5 | ARC review fee amount (C-4 allows one) | $0 |
| OI-6 | Which vendors get portal logins vs email-only | Email-only at launch |
| OI-7 | Tenant access confirmation (FR-4/roles: maintenance-only proposed) | Maintenance-only |

---

## 16. Build Guidance for Claude Code

- Read this document fully before designing. Requirements tagged [BB] and [NJ] are constraints, not preferences — do not "simplify" them (especially the 60-day ARC clock, acknowledgment of receipt, board-only expense approval, internal-only vendor ratings, and RLS-enforced privacy).
- The Blue Book PDF is in this folder for reference; §11.03 (ARC), §3.03/§5.04/§8.07 (maintenance matrix), §11.05 (fines), Bylaws Art. XV (ADR) are the load-bearing sections.
- Integrate with the existing portal: reuse auth/roles (`AuthContext`, `app_access`), UI components (`src/components/ui`), layout, and the Resend email path in `supabase/functions/daily-digest` as a reference implementation.
- Remember NFR-6: deploy Edge Functions with `--no-verify-jwt`.
- Definition of done per feature: RLS policies tested (especially vendor scoping and private tickets), state transitions logged to `ticket_events`, notifications fire per preferences, and the feature works at phone width.
- Where this document is silent, prefer the simplest design consistent with the goals in §1.
