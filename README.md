# Vintage @ Hamilton — Community Portal

A web portal for the Vintage @ Hamilton over-55 community in Hamilton, NJ.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Auth + DB | Supabase |
| Routing | React Router v6 |

## Project Structure

```
src/
  assets/          # Images, icons
  components/
    layout/        # AppShell (header/nav/footer wrapper)
    ui/            # Reusable UI — ProtectedRoute, buttons, etc.
  context/
    AuthContext.jsx  # Supabase auth state + signIn/signOut
  hooks/
    useAuth.js       # Convenience re-export
  lib/
    supabase.js      # Supabase client (reads .env vars)
  pages/
    auth/
      LoginPage.jsx
    apps/
      DirectoryPage.jsx   # Phase 2
      CalendarPage.jsx    # Phase 2
      LottoPage.jsx       # Phase 2
      BlogPage.jsx        # Phase 2
    HomePage.jsx          # Dashboard / app launcher
  App.jsx          # Router + route definitions
  main.jsx         # React entry point
  index.css        # Tailwind directives + base styles
```

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

### 3. Run locally
```bash
npm run dev
```

Open http://localhost:5173

## Build Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Project scaffold, auth shell, routing | ✅ Done |
| 2 | Admin portal (user management, access grants) | Planned |
| 3 | Resident Directory | Planned |
| 4 | Social Calendar | Planned |
| 5 | Lotto Tracker | Planned |
| 6 | Community Blog | Planned |
| 7 | Notifications system | Planned |

## Notes

- **Never commit `.env`** — it contains secret keys. Only `.env.example` (with placeholders) should be in Git.
- Users are created and managed through Supabase Auth (email + password). The admin portal (Phase 2) will handle inviting residents.
