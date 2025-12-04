import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import NotFoundPage from "./pages/NotFoundPage";
import AdminPage from "./pages/AdminPage";
import RegistrationPointPage from "./pages/RegistrationPointPage";
import SystemSettingsPage from "./pages/ParticipantFieldManager";
import ProtectedRoute from "./components/ProtectedRoute";
import ProfilePage from "./pages/ProfilePage";
import CheckinStaffPage from "./pages/CheckinStaffPage";
import KioskPage from "./pages/KioskPage"; 
import SelectPointPage from './pages/SelectPointPage';
import AdminParticipantsPage from './pages/AdminParticipantsPage';
import PreRegistrationPage from './pages/PreRegistrationPage';

export default function App() {


  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PreRegistrationPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={["admin", "staff", "kiosk"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute roles={["admin", "staff", "kiosk"]}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={["admin"]}>
              <SystemSettingsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/registration-points"
          element={
            <ProtectedRoute roles={["admin"]}>
              <RegistrationPointPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff"
          element={
            <ProtectedRoute roles={["admin", "staff"]}>
              <CheckinStaffPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/kiosk"
          element={
            <ProtectedRoute roles={["kiosk", "admin", "staff"]}>
              <KioskPage />
            </ProtectedRoute>
          }
        />

         <Route path="/select-point" element={
          <ProtectedRoute roles={["kiosk", "staff", "admin"]}>
            <SelectPointPage />
          </ProtectedRoute>
        } />

        <Route
          path="/admin/participants"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminParticipantsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/staff/select-point" element={
         <ProtectedRoute roles={["admin", "staff"]}>
         <SelectPointPage mode="staff" />
          </ProtectedRoute>
        } />

        {/* Unauthorized (optional) */}
        <Route path="/unauthorized" element={<div>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>} />

        {/* Not found */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}