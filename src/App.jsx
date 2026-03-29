import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import ProtectedRoute from '@/components/ui/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'
import AdminShell from '@/components/layout/AdminShell'
import HelpPage from '@/pages/HelpPage'
import LoginPage from '@/pages/auth/LoginPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import RequestAccessPage from '@/pages/auth/RequestAccessPage'
import HomePage from '@/pages/HomePage'
import DirectoryPage from '@/pages/apps/DirectoryPage'
import CalendarPage from '@/pages/apps/CalendarPage'
import LottoPage from '@/pages/apps/LottoPage'
import BlogPage from '@/pages/apps/BlogPage'
import RecommendationsPage from '@/pages/apps/RecommendationsPage'
import BudgetPage from '@/pages/apps/BudgetPage'
import AccessPage from '@/pages/admin/AccessPage'
import AccessRequestsPage from '@/pages/admin/AccessRequestsPage'
import ReportsPage from '@/pages/admin/ReportsPage'

function ResidentShell({ children }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

function AdminRoute({ children }) {
  return (
    <ProtectedRoute requireAdmin>
      <AdminShell>{children}</AdminShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/request-access" element={<RequestAccessPage />} />

              {/* Resident routes */}
              <Route path="/" element={<ResidentShell><HomePage /></ResidentShell>} />
              <Route path="/apps/directory" element={<ResidentShell><DirectoryPage /></ResidentShell>} />
              <Route path="/apps/calendar" element={<ResidentShell><CalendarPage /></ResidentShell>} />
              <Route path="/apps/lotto" element={<ResidentShell><LottoPage /></ResidentShell>} />
              <Route path="/apps/blog" element={<ResidentShell><BlogPage /></ResidentShell>} />
              <Route path="/apps/recommendations" element={<ResidentShell><RecommendationsPage /></ResidentShell>} />
              <Route path="/apps/budget" element={<ResidentShell><BudgetPage /></ResidentShell>} />
              <Route path="/help" element={<ResidentShell><HelpPage /></ResidentShell>} />
              {/* Admin routes */}
              <Route path="/admin" element={<AdminRoute><AccessPage /></AdminRoute>} />
              <Route path="/admin/access" element={<AdminRoute><AccessPage /></AdminRoute>} />
              <Route path="/admin/requests" element={<AdminRoute><AccessRequestsPage /></AdminRoute>} />
              <Route path="/admin/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
