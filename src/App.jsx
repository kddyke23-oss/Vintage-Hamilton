import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ui/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'

import LoginPage from '@/pages/auth/LoginPage'
import HomePage from '@/pages/HomePage'
import DirectoryPage from '@/pages/apps/DirectoryPage'
import CalendarPage from '@/pages/apps/CalendarPage'
import LottoPage from '@/pages/apps/LottoPage'
import BlogPage from '@/pages/apps/BlogPage'

function ProtectedShell({ children }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected */}
          <Route path="/" element={<ProtectedShell><HomePage /></ProtectedShell>} />
          <Route path="/apps/directory" element={<ProtectedShell><DirectoryPage /></ProtectedShell>} />
          <Route path="/apps/calendar" element={<ProtectedShell><CalendarPage /></ProtectedShell>} />
          <Route path="/apps/lotto" element={<ProtectedShell><LottoPage /></ProtectedShell>} />
          <Route path="/apps/blog" element={<ProtectedShell><BlogPage /></ProtectedShell>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
