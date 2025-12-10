import React, { useState } from "react";
import {
  Box, Avatar, Stack, Typography, Button, Paper,
  Divider, CircularProgress, Snackbar, Alert, Fade
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import useAuth from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import getAvatarUrl from "../utils/getAvatarUrl";

export default function ProfilePage() {
  const { user, token, updateUser } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [snackbar, setSnackbar] = useState({ open: false, success: true, msg: "" });
  const navigate = useNavigate();

  const avatarUrl = preview ? preview : getAvatarUrl(user);
  const shortName = (user?.fullName || user?.username || "USER").slice(0, 2).toUpperCase();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    
    const formData = new FormData();
    formData.append("avatar", selectedFile);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
      
      const res = await axios.post(
        `${apiBase}/admins/upload-avatar`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
          }
        }
      );

      // [แก้ไข] ใช้ filename จาก response และอัปเดต state
      const newAvatarFilename = res.data.filename;
      if (updateUser) {
          updateUser({ avatarUrl: newAvatarFilename });
      }

      setSnackbar({ open: true, success: true, msg: "บันทึกรูปโปรไฟล์สำเร็จ!" });
      setSelectedFile(null);
      setPreview(null);
    } catch (error) {
      console.error("Upload error:", error);
      setSnackbar({ open: true, success: false, msg: "เกิดข้อผิดพลาดในการอัปโหลด" });
    } finally {
      setUploading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff6fa", pt: 5, pb: 5 }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: 440,
          mx: "auto",
          p: { xs: 3, sm: 4 },
          mt: 2,
          borderRadius: 6,
          boxShadow: "0 10px 40px -10px rgba(255,192,203,0.3)",
          border: "1px solid rgba(255, 229, 236, 0.8)"
        }}
      >
        <Button
          startIcon={<ArrowBackIcon />}
          sx={{ 
            mb: 2, 
            color: "#d81b60",
            fontWeight: 600,
            borderRadius: 2,
            "&:hover": { bgcolor: "rgba(216, 27, 96, 0.08)" }
          }}
          onClick={() => navigate("/dashboard")}
        >
          กลับ Dashboard
        </Button>

        <Stack direction="column" alignItems="center" spacing={2.5}>
          <Box sx={{ position: "relative" }}>
            <Avatar
              src={avatarUrl}
              alt={user?.username}
              sx={{
                width: 120,
                height: 120,
                border: "4px solid #fff",
                boxShadow: "0 0 0 3px #f06292",
                fontSize: 40,
                bgcolor: "#fce4ec",
                color: "#d81b60",
                fontWeight: "bold"
              }}
            >
              {!preview && !user?.avatarUrl && shortName}
            </Avatar>
            
            <Button
              component="label"
              variant="contained"
              sx={{
                position: "absolute",
                bottom: 0,
                right: 0,
                borderRadius: "50%",
                minWidth: 40,
                width: 40,
                height: 40,
                p: 0,
                bgcolor: "#fff",
                border: "1px solid #f48fb1",
                boxShadow: "0 3px 10px rgba(0,0,0,0.1)",
                "&:hover": { bgcolor: "#f8bbd0" }
              }}
            >
              <PhotoCamera sx={{ color: "#ec407a", fontSize: 20 }} />
              <input hidden accept="image/*" type="file" onChange={handleFileChange} />
            </Button>
          </Box>

          <Fade in={!!selectedFile}>
            <Box sx={{ width: '100%' }}>
            {selectedFile && (
              <Button
                onClick={handleUpload}
                variant="contained"
                color="secondary"
                disabled={uploading}
                fullWidth
                sx={{ 
                  borderRadius: 3, 
                  py: 1,
                  boxShadow: "0 4px 12px rgba(236, 64, 122, 0.3)" 
                }}
              >
                {uploading ? <CircularProgress size={24} color="inherit" /> : "ยืนยันการเปลี่ยนรูป"}
              </Button>
            )}
            </Box>
          </Fade>

          <Divider sx={{ width: "100%", borderColor: "rgba(0,0,0,0.06)" }} />

          <Stack spacing={1} alignItems="center" sx={{ width: '100%' }}>
            <Typography variant="h5" color="primary.main" fontWeight={800} sx={{ letterSpacing: 0.5 }}>
              {user?.fullName || user?.username || "Unknown User"}
            </Typography>
            
            <Box sx={{ bgcolor: "#fff0f6", px: 2, py: 0.5, borderRadius: 2 }}>
              <Typography variant="body2" color="secondary.main" fontWeight={600}>
                @{user?.username}
              </Typography>
            </Box>

            <Typography variant="body1" color="text.secondary">
              {user?.email || "ไม่มีอีเมล"}
            </Typography>

            <Typography 
              variant="caption" 
              sx={{ 
                pt: 1,
                color: "#9e9e9e", 
                fontWeight: 600, 
                letterSpacing: 1.5 
              }}
            >
              ROLE: {Array.isArray(user?.role) ? user.role.join(", ").toUpperCase() : (user?.role || "").toUpperCase()}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        TransitionComponent={Fade}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.success ? "success" : "error"}
          variant="filled"
          sx={{ width: "100%", borderRadius: 2, fontWeight: "bold" }}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}