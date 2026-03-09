# Vintage @ Hamilton — Community Portal

A full-stack web portal for the Vintage @ Hamilton over-55 community in Hamilton, NJ. The platform provides a central hub for community residents with modular sub-applications for the directory, social calendar, lotto syndicate tracker, and community blog — all behind a single sign-on system with per-user, per-app access control.

---

## How It Works

### Authentication
Residents sign in with an email and password managed through Supabase Auth. There is no self-registration — accounts are created by the community administrator via invite. A forgot password / reset flow is built into the login page.

### Access Control
Access is managed at two levels:
- **Super admin** (`profiles.is_admin = true`) — full access to everything including the admin portal
- **App-level access** — each resident must be explicitly granted access to each sub-application, with a role of `user` or `admin`

Residents who are in the directory but don't yet have an auth account are visible in the admin portal but cannot be granted access until their account is created.

### Resident Directory
The directory is the first fully built sub-application. It stores resident contact information (name, address, phones, emails, tags) separately from auth credentials, so residents can be pre-loaded into the directory before they have accounts. Each resident can edit their own entry; directory admins and super admins can edit, add, or remove any entry.

### Admin Portal
The admin portal provides:
- **Dashboard** — resident counts, admin counts, app access summary
- **Residents** — view all residents, toggle super-admin status
- **App Access** — grant or revoke per-app access for each resident, set user or admin role per app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Auth + DB | Supabase (Postgres + Auth) |
| Routing | React Router v6 |
| Hosting | Vercel / Netlify (planned) |
| CI/CD | GitHub Actions (planned) |

---

## Project Structure

```
src/
  context/
    AuthContext.jsx        # Supabase auth state, isAdmin, hasAppAccess(), isAppAdmin()
  components/
    layout/
      AppShell.jsx         # Main app layout — header, sidebar nav, footer
      AdminShell.jsx       # Admin portal layout
    ui/
      ProtectedRoute.jsx   # Auth guard (supports requireAdmin flag)
      Toast.jsx            # Toast notification system
      ErrorBoundary.jsx    # Top-level error boundary
  pages/
    auth/
      LoginPage.jsx        # Email/password login + forgot password flow
      ResetPasswordPage.jsx # Password reset landing (Supabase redirect target)
    apps/
      DirectoryPage.jsx    # Resident Directory (Phase 3 — complete)
      CalendarPage.jsx     # Social Calendar (Phase 4 — placeholder)
      LottoPage.jsx        # Lotto Tracker (Phase 5 — placeholder)
      BlogPage.jsx         # Community Blog (Phase 6 — placeholder)
    admin/
      AdminDashboard.jsx   # Stats and counts
      ResidentsPage.jsx    # Resident management, admin toggle
      AccessPage.jsx       # Per-app access control with role cycling
    ResidentDirectory.jsx  # Full directory component (search, CRUD, print, select mode)
    HomePage.jsx           # Welcome dashboard + quick links
  lib/
    supabase.js            # Supabase client
  App.jsx                  # Router + route definitions
  main.jsx                 # React entry point
  index.css                # Tailwind directives + CSS variables
```

---

## Database Schema (Supabase)

### `profiles`
Extends Supabase `auth.users`. Contains both auth-facing fields and directory fields.

| Column | Type | Notes |
|--------|------|-------|
| resident_id | bigserial | Primary key |
| id | uuid nullable | FK to auth.users — null until resident registers |
| full_name, email, phone, unit_number | text | Populated from auth on registration |
| is_active | boolean | Visible in admin portal |
| is_admin | boolean | Super admin flag |
| surname, names, address | text | Directory fields |
| phones, emails, tags | text[] | Directory fields (arrays) |
| directory_visible | boolean | Show in resident directory |

### `app_access`
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | FK to auth.users (requires auth account) |
| app_id | text | 'directory', 'calendar', 'lotto', 'blog' |
| role | text | 'user' or 'admin' |

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
| 2 | Admin portal — dashboard, resident management, app access control | ✅ Complete |
| 3 | Resident Directory — CRUD, search, tag filters, print, select/bulk email | ✅ Complete |
| 4 | Social Calendar | 🔲 Planned |
| 5 | Lotto Tracker | 🔲 Planned |
| 6 | Community Blog | 🔲 Planned |
| 7 | Notifications system | 🔲 Planned |
| 8 | Deploy to production (Vercel/Netlify + custom domain) | 🔲 Planned |

---

## Planned Enhancements

### Near Term
- **Admin invite flow** — admin enters resident email, Supabase sends setup link, profile auto-links on first login
- **Supabase trigger** — auto-links new auth account to existing directory profile by matching email
- **Text size toggle persistence** — save A/A+/A++ preference per user in Supabase

### Sub-Applications
- **Social Calendar** — community events, RSVP, admin event management
- **Lotto Tracker** — syndicate management, draw entry, winnings distribution
- **Community Blog** — resident posts, admin moderation
- **Notifications** — per-user read/dismiss notification system

### Infrastructure
- Production deployment to Vercel or Netlify
- Custom domain: vintagehamilton.com
- GitHub Actions CI/CD pipeline
- Consolidate legacy profile fields with directory fields (cleanup)

---

## Security Notes

- **Never commit `.env`** — it contains your Supabase keys. Only `.env.example` (with placeholders) should be in Git
- The `.gitignore` excludes `.env` and `.env.local`
- Supabase Row Level Security (RLS) is enabled on all tables
- The anon key is safe to expose in frontend code — RLS policies enforce all data access rules
