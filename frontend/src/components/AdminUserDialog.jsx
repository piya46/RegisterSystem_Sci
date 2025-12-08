// src/components/AdminUserDialog.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Typography,
  Avatar, Stack, Divider, Chip, LinearProgress, InputAdornment, Tooltip, IconButton, Box
} from "@mui/material";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import BadgeIcon from "@mui/icons-material/Badge";

const roles = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
  { value: "kiosk", label: "Kiosk" }
];

const Y = {
  main: "#FFC107",
  dark: "#FFB300",
  pale: "#FFF8E1",
  border: "rgba(255,193,7,.35)",
  text: "#6B5B00",
};

export default function AdminUserDialog({
  open, onClose, onSave, initialData, isEdit
}) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setUsername(initialData.username || "");
      setFullName(initialData.fullName || "");
      setEmail(initialData.email || "");
      setRole(Array.isArray(initialData.role) ? initialData.role[0] : initialData.role || "staff");
      setPassword("");
    } else {
      setUsername("");
      setFullName("");
      setEmail("");
      setRole("staff");
      setPassword("");
    }
    setErrors({});
  }, [initialData, open]);

  // password strength (เฉพาะตอนเพิ่ม)
  const pwdStrength = useMemo(() => {
    if (isEdit || !password) return 0;
    let score = 0;
    if (password.length >= 8) score += 25;
    if (/[A-Z]/.test(password)) score += 15;
    if (/[a-z]/.test(password)) score += 15;
    if (/\d/.test(password)) score += 20;
    if (/[^A-Za-z0-9]/.test(password)) score += 25;
    return Math.min(score, 100);
  }, [password, isEdit]);

  const strengthLabel = pwdStrength >= 80 ? "Very Strong"
                      : pwdStrength >= 60 ? "Strong"
                      : pwdStrength >= 40 ? "Medium"
                      : pwdStrength > 0   ? "Weak"
                      : "";

  const validate = () => {
    const e = {};
    if (!username.trim()) e.username = "กรุณาระบุ Username";
    if (!email.trim()) e.email = "กรุณาระบุ Email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Email Format ไม่ถูกต้อง";
    if (!isEdit && !password) e.password = "กรุณาระบุ Password";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      username: username.trim(),
      fullName: fullName.trim(),
      email: email.trim(),
      role,
      ...(!isEdit && password ? { password } : {})
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          border: `1px solid ${Y.border}`,
          boxShadow: "0 14px 36px rgba(255,193,7,0.25)"
        }
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          py: 1.5,
          background: "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(255,248,225,.95) 100%)",
          borderBottom: `1px solid ${Y.border}`,
          position: "relative"
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Avatar
            src="/logo.svg"
            alt="Logo"
            sx={{ width: 44, height: 44, bgcolor: "#fff", border: `2px solid ${Y.border}` }}
          />
          <Box sx={{ flex: 1 }}>
            {/* ปรับแก้: ใช้ภาษาอังกฤษ/ทับศัพท์ */}
            <Typography variant="h6" fontWeight={900} sx={{ color: Y.text, letterSpacing: .3 }}>
              {isEdit ? "Edit User" : "Add New User"}
            </Typography>
            <Typography variant="caption" sx={{ color: "#8b7a1a" }}>
              Form สำหรับ {isEdit ? "Update ข้อมูล Admin/Staff" : "Create Account Admin/Staff ใหม่"}
            </Typography>
          </Box>
          <Tooltip title="Close">
            <IconButton onClick={onClose} size="small" sx={{ color: Y.text }}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, backgroundColor: "#fffefa" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={`Role: ${roles.find(r => r.value === role)?.label || role}`}
              sx={{ bgcolor: Y.pale, border: `1px solid ${Y.border}`, color: Y.text, fontWeight: 800 }}
              size="small"
            />
            {isEdit ? (
              // ปรับแก้: Edit Mode
              <Chip label="Edit Mode" color="warning" size="small" />
            ) : (
              // ปรับแก้: Add Mode
              <Chip label="Add Mode" color="success" size="small" />
            )}
          </Stack>

          <TextField
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            fullWidth
            autoFocus={!isEdit}
            error={!!errors.username}
            helperText={errors.username || "ใช้สำหรับ Login (แก้ไขไม่ได้)"}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <BadgeIcon fontSize="small" />
                </InputAdornment>
              )
            }}
            margin="dense"
            disabled={isEdit}
            sx={tfStyle}
          />

          <TextField
            // ปรับแก้: Full Name
            label="Full Name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            fullWidth
            margin="dense"
            placeholder="เช่น นิสิต วิทยาศาสตร์"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AlternateEmailIcon fontSize="small" sx={{ opacity: 0 }} />
                </InputAdornment>
              )
            }}
            sx={tfStyle}
          />

          <TextField
            label="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            fullWidth
            margin="dense"
            error={!!errors.email}
            helperText={errors.email || "ใช้รับ Notification / Reset Password"}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AlternateEmailIcon fontSize="small" />
                </InputAdornment>
              )
            }}
            sx={tfStyle}
          />

          <TextField
            select
            // ปรับแก้: Role
            label="Role"
            value={role}
            onChange={e => setRole(e.target.value)}
            fullWidth
            margin="dense"
            helperText="Select Role ของ User"
            sx={tfStyle}
          >
            {roles.map(option => (
              <MenuItem value={option.value} key={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          {!isEdit ? (
            <>
              <TextField
                // ปรับแก้: Password
                label="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                fullWidth
                margin="dense"
                type="password"
                autoComplete="new-password"
                error={!!errors.password}
                // ปรับแก้: คำแนะนำ Password แบบทับศัพท์
                helperText={errors.password || "อย่างน้อย 8 characters แนะนำให้มี Uppercase, Number และ Special Character"}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <VpnKeyIcon fontSize="small" />
                    </InputAdornment>
                  )
                }}
                sx={tfStyle}
              />
              {!!password && (
                <Stack spacing={0.5}>
                  <LinearProgress
                    variant="determinate"
                    value={pwdStrength}
                    sx={{
                      height: 8, borderRadius: 6, bgcolor: Y.pale,
                      "& .MuiLinearProgress-bar": { bgcolor: Y.main }
                    }}
                  />
                  {/* ปรับแก้: Password Strength */}
                  <Typography variant="caption" sx={{ color: Y.text, fontWeight: 700 }}>
                    Password Strength: {strengthLabel}
                  </Typography>
                </Stack>
              )}
            </>
          ) : (
            <Typography sx={{ mt: 1.5, color: "text.secondary", fontSize: 14 }}>
              ต้องการ Change Password? กดปุ่ม{" "}
              <VpnKeyIcon fontSize="small" sx={{ verticalAlign: "middle" }} /> ในตาราง User List
            </Typography>
          )}

          <Divider sx={{ mt: 1, borderColor: Y.border }} />

          <Box sx={{ px: 1 }}>
            <Typography variant="caption" sx={{ color: "#8b7a1a" }}>
              Tips: ใช้ Role <b>Staff</b> สำหรับเจ้าหน้าที่ทั่วไป และ <b>Kiosk</b> สำหรับจุด Registration หน้างาน
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2, backgroundColor: "#fffefa", borderTop: `1px solid ${Y.border}` }}>
        {/* ปรับแก้: ปุ่ม Cancel / Save */}
        <Button onClick={onClose} color="inherit" startIcon={<CloseIcon />}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={isEdit ? <SaveIcon /> : <PersonAddIcon />}
          sx={{ bgcolor: Y.main, color: "#3E2723", fontWeight: 900, ":hover": { bgcolor: Y.dark } }}
        >
          {isEdit ? "Save" : "Add User"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ----- shared textfield style ----- */
const tfStyle = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#fff",
    borderRadius: 2,
    "& fieldset": { borderColor: "rgba(255,193,7,.35)" },
    "&:hover fieldset": { borderColor: "rgba(255,193,7,.8)" },
    "&.Mui-focused fieldset": { borderColor: "#FFC107" }
  }
};