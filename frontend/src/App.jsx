import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Box, Typography } from "@mui/material"; 
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import NotFoundPage from "./pages/NotFoundPage";
import AdminPage from "./pages/AdminPage";
import RegistrationPointPage from "./pages/RegistrationPointPage";
import SystemSettingsPage from "./pages/SystemSettingsPage"; 
import ProtectedRoute from "./components/ProtectedRoute";
import ProfilePage from "./pages/ProfilePage";
import CheckinStaffPage from "./pages/CheckinStaffPage";
import KioskPage from "./pages/KioskPage"; 
import SelectPointPage from './pages/SelectPointPage';
import AdminParticipantsPage from './pages/AdminParticipantsPage';
import PreRegistrationPage from './pages/PreRegistrationPage';
import DonationListPage from './pages/DonationListPage';
import CronStatusPage from "./pages/CronStatusPage";
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import SessionManagerPage from "./pages/SessionManagerPage";

// [เพิ่ม] หน้าใหม่ที่สร้างขึ้น
import KioskJoinPage from "./pages/KioskJoinPage";
import PublicReportPage from "./pages/PublicReportPage";
import LuckyDrawPage from "./pages/LuckyDrawPage";
import PublicDashboardPage from "./pages/PublicDashboardPage";
import PrizeManagementPage from "./pages/PrizeManagementPage"; // 🌟 [เพิ่มบรรทัดนี้]

export default function App() {
  return (
    <Router>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Box sx={{ flex: 1 }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<PreRegistrationPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms-of-service" element={<TermsPage />} />
            
            {/* [เพิ่ม] Route สำหรับแชร์ลิงก์ Public (ไม่ต้อง Login) */}
            {/* <Route path="/public/report" element={<PublicReportPage />} /> */}
            <Route path="/public/dashboard" element={<PublicDashboardPage />} />
            <Route path="/kiosk/join/:token" element={<KioskJoinPage />} />

            <Route path="/dashboard" element={<ProtectedRoute roles={["admin", "staff", "kiosk"]}><DashboardPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute roles={["admin", "staff", "kiosk"]}><ProfilePage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute roles={["admin"]}><SystemSettingsPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminPage /></ProtectedRoute>} />
            <Route path="/registration-points" element={<ProtectedRoute roles={["admin"]}><RegistrationPointPage /></ProtectedRoute>} />
            
            {/* [เพิ่ม] Route สำหรับสุ่มรางวัล */}
            <Route path="/admin/lucky-draw" element={<ProtectedRoute roles={["admin"]}><LuckyDrawPage /></ProtectedRoute>} />
            {/* <Route path="/admin/prizes" element={<ProtectedRoute roles={["admin"]}><PrizeManagementPage /></ProtectedRoute>} /> 🌟 [เพิ่มบรรทัดนี้] */}

            <Route path="/staff" element={<ProtectedRoute roles={["admin", "staff"]}><CheckinStaffPage /></ProtectedRoute>} />
            <Route path="/kiosk" element={<ProtectedRoute roles={["kiosk", "admin", "staff"]}><KioskPage /></ProtectedRoute>} />
            <Route path="/select-point" element={<ProtectedRoute roles={["kiosk", "staff", "admin"]}><SelectPointPage /></ProtectedRoute>} />
            <Route path="/admin/participants" element={<ProtectedRoute roles={["admin"]}><AdminParticipantsPage /></ProtectedRoute>} />
            <Route path="/admin/donations" element={<ProtectedRoute roles={["admin"]}><DonationListPage /></ProtectedRoute>} />
            <Route path="/staff/select-point" element={<ProtectedRoute roles={["admin", "staff"]}><SelectPointPage mode="staff" /></ProtectedRoute>} />
            <Route path="/admin/cron-status" element={<ProtectedRoute roles={["admin"]}><CronStatusPage /></ProtectedRoute>} />
            <Route path="/admin/sessions" element={<ProtectedRoute roles={["admin"]}><SessionManagerPage /></ProtectedRoute>} />

            <Route path="/unauthorized" element={<Box p={5} textAlign="center"><Typography variant="h5">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</Typography></Box>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Box>
        
        <Box component="footer" sx={{ textAlign: 'center', py: 2, bgcolor: '#f5f5f5', borderTop: '1px solid #e0e0e0' }}>
          <Typography variant="body2" color="text.secondary" fontWeight="500">
            &copy; copyright 2026 PSTDEV
          </Typography>
        </Box>
      </Box>
    </Router>
  );
}