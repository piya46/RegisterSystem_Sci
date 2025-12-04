// src/components/ChangePasswordDialog.jsx
import React, { useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Alert } from "@mui/material";
import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";

export default function ChangePasswordDialog({ open, onClose }) {
  const { token } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSave = async () => {
    setError("");
    setSuccess("");
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านใหม่กับยืนยันรหัสไม่ตรงกัน");
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(
        { oldPassword, newPassword },
        token
      );
      setSuccess("เปลี่ยนรหัสผ่านสำเร็จ");
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err?.response?.data?.error || "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>เปลี่ยนรหัสผ่าน</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
        <TextField
          label="รหัสผ่านเดิม"
          type="password"
          fullWidth
          margin="normal"
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          autoFocus
        />
        <TextField
          label="รหัสผ่านใหม่"
          type="password"
          fullWidth
          margin="normal"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
        <TextField
          label="ยืนยันรหัสผ่านใหม่"
          type="password"
          fullWidth
          margin="normal"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={loading}>ยกเลิก</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={loading}
        >
          บันทึก
        </Button>
      </DialogActions>
    </Dialog>
  );
}
