// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { Box, CircularProgress, Typography } from "@mui/material";
import ChangePasswordDialog from "./ChangePasswordDialog";
import ManagementShell from "./ManagementShell";

export default function ProtectedRoute({ children, roles, shell = false }) {
  const { user, loading, updateUser } = useAuth();
  const location = useLocation(); // [NEW] ดึงตำแหน่งปัจจุบัน

  // 1. Loading State (แต่งให้สวยขึ้นนิดนึง)
  if (loading)
    return (
      <Box 
        sx={{ 
          display: "flex", 
          flexDirection: "column",
          justifyContent: "center", 
          alignItems: "center", 
          minHeight: "100vh", // เต็มจอ
          bgcolor: "background.default",
          gap: 2
        }}
      >
        <CircularProgress size={40} thickness={4} color="primary" />
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
          กำลังยืนยันตัวตน...
        </Typography>
      </Box>
    );

  // 2. Not Logged In
  if (!user) {
    // [NEW] ส่ง state ไปด้วย เพื่อให้หน้า Login รู้ว่ามาจากไหน (Redirect back ได้)
    // [NEW] ใช้ replace เพื่อไม่ให้เก็บ History หน้านี้ไว้ (กด Back จะได้ไม่วน)
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Role Check
  if (roles) {
    const userRoles = Array.isArray(user.role) ? user.role : [user.role];
    if (!userRoles.includes('superadmin') && !roles.some(role => userRoles.includes(role))) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  const content = shell ? <ManagementShell>{children}</ManagementShell> : children;

  if (user.mustChangePassword) {
    return (
      <>
        {content}
        <ChangePasswordDialog
          open
          required
          onClose={() => {}}
          onSuccess={() => updateUser({ mustChangePassword: false })}
        />
      </>
    );
  }

  return content;
}
