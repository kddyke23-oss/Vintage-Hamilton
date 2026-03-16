# Vintage @ Hamilton — Community Portal

A full-stack web portal for the Vintage @ Hamilton over-55 community in Hamilton, NJ. The platform provides a central hub for community residents with modular sub-applications for the directory, lotto syndicate tracker, social calendar, community blog, and residents' recommendations — all behind a single sign-on system with per-user, per-app access control.

---

## How It Works

### Authentication
Residents sign in with an email and password managed through Supabase Auth. There is no self-registration — accounts are created by the community administrator via invite or direct account creation. A forgot password / reset flow is built into the login page.

### Access Control
Access is managed at two levels:
- **Super admin** (`profiles.is_admin = true`) — full access to everything including the admin portal
- **App-level access** — each resident must be explicitly granted access to each sub-application, with a role of `user` or `admin`

Residents without an auth account appear in the App Access screen as locked (🔒). Access toggles unlock automatically after their first login, when the `on_auth_user_created` trigger links their auth UUID to their existing profile by matching email.

### Resident Directory
The directory stores resident contact information (name, address, phones, emails, tags) separately from auth credentials, so residents can be pre-loaded before they have accounts. Each resident can edit their own entry; directory admins and super admins can edit, add, or remove any entry. Features include search, tag filtering, print (full or filtered view), and select mode for bulk email/phone actions.

### Admin Portal — Residents
The Residents admin page supports three actions:
- **Invite** — sends a Supabase invite email to an existing or new resident
- **Add to Directory** — creates a profile record only (no auth account), for residents who don't want platform access
- **Create Account** — creates a full auth user linked to a profile

Directory-only residents show an **Invite** link in their row, pre-filled with their email, so they can be onboarded later if they choose.

### Lotto Syndicate Tracker
A full Powerball syndicate management tool for the community's lottery group. Tracks 12 member households, draw results, winnings distribution, and subscription payments across multiple periods. Features include:
- Draw entry wizard with automatic match checking against all member tickets
- Per-member winnings calculated and distributed equally among active members at draw time
- Payment tracking with balance calculations per member per period
- Period Summary generator producing a formatted email/text update with draw results, next period subscription requests, and per-member amounts owed or in credit
- Charts showing member winnings, win counts, and cumulative investment vs winnings over time

### Social Calendar
Community events with RSVP, attendee lists, category colour coding, and an upcoming events widget on the homepage. Admins can add, edit, and remove events.

### Community Blog
Resident posts with categories, tags, comments, and photo support. Admins can moderate posts and comments via the reports panel. Blog posts can be linked to calendar events.

### Residents' Recommendations
A community recommendations board with two post types:
- **Recommend** — positive recommendations (contractors, services, restaurants, etc.)
- **Steer Clear** — warnings about bad experiences

Residents can react to posts (❤️ or 👎 on recommendations; 👍 or 🤔 on steer clears). Negative reactions require a mandatory comment which is routed to the admin reports panel. Admins can make comments public, dismiss them, or remove the post entirely.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Charts | Recharts |
| Auth + DB | Supabase (Postgres + Auth) |
| Routing | React Router v6 |
| Hosting | Vercel |
| Domain | vintageathamilton.com |

---

## Project Structure

```
src/
  context/
    AuthContext.jsx          # Supabase auth state, isAdmin, hasAppAccess(), isAppAdmin()
  components/
    layout/
      AppShell.jsx           # Main app layout — header, sidebar nav, footer
      AdminShell.jsx         # Admin portal layout
    apps/
      LottoTracker.jsx       # Lotto Tracker sub-application component
      AdminReportsWidget.jsx # Homepage widget showing unresolved report counts
    ui/
      ProtectedRoute.jsx     # Auth guard (supports requireAdmin flag)
      Toast.jsx              # Toast notification system
      ErrorBoundary.jsx      # Top-level error boundary
  pages/
    auth/
      LoginPage.jsx          # Email/password login + forgot password flow
      ResetPasswordPage.jsx  # Password reset landing (Supabase redirect target)
    apps/
      LottoPage.jsx          # Lotto Tracker access wrapper
      CalendarPage.jsx       # Social Calendar
      BlogPage.jsx           # Community Blog
      RecommendationsPage.jsx # Residents' Recommendations (Phase 5 — in progress)
    admin/
      AdminDashboard.jsx     # Stats and counts
      ResidentsPage.jsx      # Resident management (invite, add to directory, create account)
      AccessPage.jsx         # Per-app access control with role cycling
    ResidentDirectory.jsx    # Full directory component (search, CRUD, print, select mode)
    HomePage.jsx             # Welcome dashboard + quick links + upcoming events
    HelpPage.jsx             # User help and FAQs
  lib/
    supabase.js              # Supabase client
  App.jsx                    # Router + route definitions
  main.jsx                   # React entry point
  index.css                  # Tailwind directives + CSS variables
```

---

## Database Schema (Supabase)

### `profiles`
Extends Supabase `auth.users`. Contains both auth-facing fields and directory fields.

| Column | Type | Notes |
|--------|------|-------|
| resident_id | bigserial | Primary key |
| id | uuid nullable | FK to auth.users — null until resident registers |
| is_active | boolean | Whether resident is active |
| is_admin | boolean | Super admin flag |
| surname, names, address | text | Directory fields |
| phones, emails, tags | text[] | Directory arrays |
| directory_visible | boolean | Show in resident directory |
| photo_url | text | Avatar photo — populated in Phase 5 Session 4 |
| password_set | boolean | Whether resident has set their own password |
| notify_calendar | boolean | Notification preference for calendar events |
| notify_blog | boolean | Notification preference for blog posts |

> **Note:** The legacy fields `full_name`, `email`, `phone`, and `unit_number` were removed in Phase 5. All data is held in `surname`/`names`, `emails[]`, `phones[]`, and `address`.

> **Important pattern:** All foreign keys to `profiles` must reference `resident_id` (bigint), not `id` (uuid). The `id` column is itself a FK to `auth.users` and has no unique constraint.

### `app_access`
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | FK to auth.users |
| app_id | text | 'directory', 'lotto', 'calendar', 'blog', 'recommendations', 'admin' |
| role | text | 'user' or 'admin' |

### `lotto_periods`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| label | text | e.g. "Period 8" |
| start_date | date | First draw date of the period |
| weeks | int | 3 (early periods) or 4 |

### `lotto_members`
| Column | Type | Notes |
|--------|------|-------|
| id | text | Primary key (A–L) |
| resident_id_1 | bigint | FK → profiles(resident_id) |
| resident_id_2 | bigint nullable | FK → profiles(resident_id) |
| join_date | date | When this member joined |
| exit_date | date nullable | Set when a member leaves |
| nums | int[] | 5 chosen numbers |
| pb | int | Chosen Powerball number |

### `lotto_draws`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| period_id | int | FK → lotto_periods |
| draw_num | int | Sequential draw number |
| draw_date | date | Draw date |
| winning | int[] | 5 winning numbers |
| powerball | int | Winning Powerball |
| prize | numeric(8,2) | Total prize for this draw |
| is_pending | boolean | True for placeholder draws |

### `lotto_payments`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| member_id | text | FK → lotto_members |
| period_id | int | FK → lotto_periods |
| amount | numeric(8,2) | Amount paid for this period |

### `rec_categories` / `rec_subcategories`
Admin-managed category hierarchy for recommendations.

| Seed categories | Subcategories |
|---|---|
| Contractors | Cleaners, Handyperson, Building, Electrician, Plumber, Landscaping, Painter |
| Home & Garden | Tools & Equipment, Gadgets, Furniture, Plants & Seeds |
| Services | Medical, Financial, Legal, Pet Care, Childcare |
| Leisure | Clubs & Teams, Classes, Restaurants, Days Out |
| Shopping | Online, Local Stores |

### `recommendations`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | Primary key |
| type | text | 'recommend' or 'avoid' |
| category_id | int | FK → rec_categories |
| subcategory_id | int nullable | FK → rec_subcategories |
| title | text | Required |
| description | text | Optional |
| external_url | text | Optional link |
| photo_url | text | Optional image (Phase 5 Session 4) |
| contact_phone, contact_email | text | Optional contact details |
| created_by | bigint | FK → profiles(resident_id) |
| removed | boolean | Soft delete flag |
| pending_review | boolean | Auto-set true on 'avoid' posts via trigger |

### `rec_reactions`
| Column | Type | Notes |
|--------|------|-------|
| recommendation_id | int | FK → recommendations |
| user_id | bigint | FK → profiles(resident_id) |
| reaction_type | text | 'heart', 'thumbsdown', 'agree', 'notmyexperience' |

One reaction per user per post (enforced by UNIQUE constraint).

### `rec_reports`
| Column | Type | Notes |
|--------|------|-------|
| recommendation_id | int | FK → recommendations |
| reporter_id | bigint | FK → profiles(resident_id) |
| reaction_type | text | Which negative reaction triggered this |
| comment | text | Mandatory comment from reporter |
| comment_public | boolean | Admin can make visible to all residents |
| resolved | boolean | Admin has actioned this report |
| resolved_by | bigint nullable | FK → profiles(resident_id) |

---

## RLS Helper Functions

| Function | Purpose |
|---|---|
| `has_recommendations_access()` | True if user has 'recommendations' or 'admin' app access |
| `is_recommendations_admin()` | True if user is recommendations admin or super admin |
| `has_blog_access()` | True if user has 'blog' or 'admin' app access |
| `is_blog_admin()` | True if user is blog admin or super admin |
| `has_calendar_access()` | True if user has 'calendar' or 'admin' app access |
| `is_calendar_admin()` | True if user is calendar admin or super admin |
| `has_lotto_access()` | True if user has 'lotto' or 'admin' app access |
| `is_lotto_admin()` | True if user is lotto admin or super admin |
| `my_resident_id()` | Returns current user's resident_id (bigint) from profiles |

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a free account at https://supabase.com
2. Create a new project
3. Go to **Settings → API** and copy your Project URL and anon key
4. Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

5. In **Supabase → Authentication → URL Configuration**:
   - Set Site URL to `http://localhost:5173`
   - Add `http://localhost:5173/reset-password` to Redirect URLs

### 3. Run locally
```bash
npm run dev
```

Open http://localhost:5173

---

## Build Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Project scaffold, Supabase auth, protected routing | ✅ Complete |
| 2 | Admin portal — resident management, app access control | ✅ Complete |
| 3 | Resident Directory — CRUD, search, tag filters, print, select/bulk actions | ✅ Complete |
| 4 | Social Calendar + Community Blog + Admin Reports panel | ✅ Complete |
| 5 | Residents' Recommendations | 🔧 In progress |

### Phase 5 Sessions
| Session | Scope | Status |
|---|---|---|
| 1 | Schema SQL + RLS + seed categories | ✅ Complete |
| 2 | Recommendations UI (list, cards, add post, filters) | ✅ Complete |
| 3 | Reactions, reports flow, public comments modal | ✅ Complete |
| 4 | Admin panel updates + homepage widget + photo upload hook | 🔲 Next |
| 5 | Help page update + retrofit photos into Blog and Profile | 🔲 Planned |

---

## Planned Enhancements
- **Text size toggle persistence** — save A/A+/A++ preference per user in Supabase (deferred Phase 2+)
- **Notifications sub-application** — per-user notification system (no spec yet)
- **Post-UAT schema cleanup** — ESLint config, directory tag input → dropdown

---

## Security Notes

- **Never commit `.env`** — it contains your Supabase keys. Only `.env.example` (with placeholders) should be in Git
- The `.gitignore` excludes `.env` and `.env.local`
- Supabase Row Level Security (RLS) is enabled on all tables
- The anon key is safe to expose in frontend code — RLS policies enforce all data access rules
- All foreign keys to `profiles` reference `resident_id` (bigint PK), not `id` (uuid FK to auth.users)
