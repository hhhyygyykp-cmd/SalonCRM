import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAuth } from './context/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { CustomersPage } from './pages/CustomersPage'
import { CustomerProfilePage, NewCustomerPage } from './pages/CustomerProfilePage'
import { ForgotPasswordPage, LoginPage } from './pages/LoginPage'
import { NewVisitPage, VisitsPage } from './pages/VisitsPage'
import { EditVisitPage } from './pages/EditVisitPage'
import { ServicesPage } from './pages/ServicesPage'
import { WhatsAppPage } from './pages/WhatsAppPage'
import { ReportsPage } from './pages/ReportsPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { SettingsPage } from './pages/StaffSettingsPage'
import { WalletPassPage } from './pages/WalletPassPage'
import { UpdateProfilePage } from './pages/UpdateProfilePage'
import { MemberProfilePage, MembersPage, NewMemberPage } from './pages/MembersPage'

function ProtectedRoute() {
  const { user, loading, configured } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-sm text-muted">Loading…</div>
    )
  }
  if (!configured) return <Navigate to="/login" replace />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function AdminRoute() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/customers" replace />
  return <Outlet />
}

function HomeRoute() {
  const { isAdmin } = useAuth()
  if (isAdmin) return <DashboardPage />
  return <Navigate to="/customers" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/w/:token" element={<WalletPassPage />} />
      <Route path="/update/:token" element={<UpdateProfilePage />} />
      <Route path="/update" element={<UpdateProfilePage />} />
      <Route path="/u/:token" element={<UpdateProfilePage />} />
      <Route path="/u" element={<UpdateProfilePage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomeRoute />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/new" element={<NewCustomerPage />} />
          <Route path="customers/:id" element={<CustomerProfilePage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="members/new" element={<NewMemberPage />} />
          <Route path="members/:id" element={<MemberProfilePage />} />
          <Route path="visits" element={<VisitsPage />} />
          <Route path="visits/new" element={<NewVisitPage />} />
          <Route path="visits/:visitId/edit" element={<EditVisitPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="whatsapp" element={<WhatsAppPage />} />

          <Route element={<AdminRoute />}>
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
