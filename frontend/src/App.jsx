// frontend/src/App.jsx
import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from "react-router";
import { Box, Typography, CircularProgress, Button } from "@mui/material";
import ProtectedRoute from "./components/ProtectedRoute";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const RegistrationPointPage = lazy(() => import("./pages/RegistrationPointPage"));
const SystemSettingsPage = lazy(() => import("./pages/SystemSettingsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const CheckinStaffPage = lazy(() => import("./pages/CheckinStaffPage"));
const KioskPage = lazy(() => import("./pages/KioskPage"));
const SelectPointPage = lazy(() => import('./pages/SelectPointPage'));
const AdminParticipantsPage = lazy(() => import('./pages/AdminParticipantsPage'));
const PreRegistrationPage = lazy(() => import('./pages/PreRegistrationPage'));
const DonationListPage = lazy(() => import('./pages/DonationListPage'));
const CronStatusPage = lazy(() => import("./pages/CronStatusPage"));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const SessionManagerPage = lazy(() => import("./pages/SessionManagerPage"));
const KioskJoinPage = lazy(() => import("./pages/KioskJoinPage"));
const KioskDiagnosticPage = lazy(() => import("./pages/KioskDiagnosticPage"));
const PublicReportPage = lazy(() => import("./pages/PublicReportPage"));
const LuckyDrawPage = lazy(() => import("./pages/LuckyDrawPage"));
const PublicDashboardPage = lazy(() => import("./pages/PublicDashboardPage"));
const SelfRegisterPage = lazy(() => import("./pages/SelfRegisterPage"));
const PublicLuckyDrawPage = lazy(() => import("./pages/PublicLuckyDrawPage"));
const EventPlatformPage = lazy(() => import("./pages/EventPlatformPage"));
const EventWorkspacePage = lazy(() => import("./pages/EventWorkspacePage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const GuestWalletPage = lazy(() => import("./pages/GuestWalletPage"));
const VerifyPage = lazy(() => import("./pages/VerifyPage"));
const CertificateDownloadPage = lazy(() => import("./pages/CertificateDownloadPage"));
const UserLoginPage = lazy(() => import("./pages/UserLoginPage"));
const UserHomePage = lazy(() => import("./pages/UserHomePage"));
const LineCallbackPage = lazy(() => import("./pages/LineCallbackPage"));

const EventAdminLayout = lazy(() => import("./components/EventAdminLayout"));
const EventSettingsPage = lazy(() => import("./pages/EventSettingsPage"));
const EventLayoutsPage = lazy(() => import("./pages/EventLayoutsPage"));
const ParticipantFieldManager = lazy(() => import("./pages/ParticipantFieldManager"));

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Global Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" p={3}>
          <Typography variant="h5" color="error" gutterBottom>ขออภัย เกิดข้อผิดพลาดในระบบ</Typography>
          <Typography variant="body1" color="text.secondary" align="center" mb={3}>
            กรุณาลองรีเฟรชหน้าเว็บ หรือกลับไปที่หน้าหลัก
          </Typography>
          <Button variant="contained" onClick={() => window.location.href = '/'}>
            กลับหน้าหลัก
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

const LegacyParticipantsRedirect = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const eventId = searchParams.get('eventId');
  if (eventId) {
    return <Navigate to={`/admin/events/${eventId}/participants`} replace />;
  }
  return <Navigate to="/admin/events" replace />;
};

const withShell = (roles, page) => (
  <ProtectedRoute roles={roles} shell>{page}</ProtectedRoute>
);

function AppFrame() {
  const { pathname } = useLocation();
  const showFooter = ["/privacy-policy", "/terms-of-service"].includes(pathname);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Box sx={{ flex: 1 }}>
        <GlobalErrorBoundary>
          <Suspense fallback={<Box display="flex" justifyContent="center" alignItems="center" height="100vh"><CircularProgress /></Box>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<PreRegistrationPage />} />
              <Route path="/e/:eventSlug" element={<PreRegistrationPage mode="landing" />} />
              <Route path="/e/:eventSlug/register" element={<PreRegistrationPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="/terms-of-service" element={<TermsPage />} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/verify/:id" element={<VerifyPage />} />
              <Route path="/user/login" element={<UserLoginPage />} />
              <Route path="/user/home" element={<UserHomePage />} />
              <Route path="/user/profile" element={<UserHomePage />} />
              <Route path="/user/security" element={<UserHomePage />} />
              <Route path="/user/line/callback" element={<LineCallbackPage />} />

              <Route path="/public/report" element={<PublicReportPage />} />
              <Route path="/public/dashboard" element={<PublicDashboardPage />} />
              <Route path="/public/lucky-draw" element={<PublicLuckyDrawPage />} />
              <Route path="/kiosk/join" element={<KioskJoinPage />} />
              <Route path="/kiosk/diagnostic" element={<KioskDiagnosticPage />} />
              <Route path="/self-register" element={<SelfRegisterPage />} />

              <Route path="/dashboard" element={withShell(["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff", "kiosk"], <DashboardPage embedded />)} />
              <Route path="/workspace" element={withShell(["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff"], <EventWorkspacePage />)} />
              <Route path="/workspace/events/:eventId" element={withShell(["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff"], <EventWorkspacePage />)} />
              <Route path="/profile" element={withShell(["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff", "kiosk"], <ProfilePage />)} />
              <Route path="/settings" element={withShell(["admin"], <SystemSettingsPage />)} />
              <Route path="/admin" element={withShell(["admin"], <AdminPage />)} />
              <Route path="/registration-points" element={withShell(["admin"], <RegistrationPointPage />)} />
              <Route path="/admin/events" element={withShell(["admin", "org_admin", "event_admin", "event_manager"], <EventPlatformPage section="portal" />)} />
              <Route path="/admin/events/new" element={withShell(["admin", "org_admin", "event_admin", "event_manager"], <EventPlatformPage section="create" />)} />
              <Route path="/admin/events/migration" element={withShell(["admin"], <EventPlatformPage section="migration" />)} />

              {/* 🌟 New Event Admin Layout Routes */}
              <Route path="/admin/events/:eventId" element={withShell(["admin", "org_admin", "event_admin", "event_manager"], <EventAdminLayout />)}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage embedded />} />
                <Route path="settings" element={<EventSettingsPage />} />
                <Route path="layouts" element={<EventLayoutsPage />} />
                <Route path="registration-fields" element={<ParticipantFieldManager />} />
                <Route path="registration-points" element={<RegistrationPointPage />} />
                <Route path="participants" element={<AdminParticipantsPage />} />
                <Route path="lucky-draw" element={<LuckyDrawPage />} />
                <Route path="donations" element={<DonationListPage />} />
              </Route>

              {/* 🌟 Legacy Redirect */}
              <Route path="/admin/participants" element={<LegacyParticipantsRedirect />} />

              <Route path="/staff" element={withShell(["admin", "staff"], <CheckinStaffPage />)} />
              <Route path="/kiosk" element={<ProtectedRoute roles={["kiosk", "admin", "staff"]}><KioskPage /></ProtectedRoute>} />
              <Route path="/select-point" element={withShell(["kiosk", "staff", "admin"], <SelectPointPage />)} />
              <Route path="/staff/select-point" element={withShell(["admin", "staff"], <SelectPointPage mode="staff" />)} />
              <Route path="/admin/cron-status" element={withShell(["admin"], <CronStatusPage />)} />
              <Route path="/admin/sessions" element={withShell(["admin"], <SessionManagerPage />)} />

              {/* Wallet Routes */}
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/liff/wallet" element={<WalletPage />} />
              <Route path="/liff/profile" element={<UserHomePage />} />
              <Route path="/guest-wallet" element={<GuestWalletPage />} />
              <Route path="/guest-wallet/:token" element={<GuestWalletPage />} />
              <Route path="/certificate/download" element={<CertificateDownloadPage />} />
              <Route path="/certificate/download/:verificationId" element={<CertificateDownloadPage />} />

              <Route path="/unauthorized" element={<Box p={5} textAlign="center"><Typography variant="h5">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</Typography></Box>} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </GlobalErrorBoundary>
      </Box>

      {showFooter && (
        <Box component="footer" sx={{ textAlign: 'center', py: 2, bgcolor: '#f5f5f5', borderTop: '1px solid #e0e0e0' }}>
          <Typography variant="body2" color="text.secondary" fontWeight="500">
            &copy; copyright 2026 PSTDEV
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default function App() {
  return (
    <Router>
      <AppFrame />
    </Router>
  );
}
