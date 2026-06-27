import React, { useState } from "react";
import {
  Box, Avatar, Stack, Typography, Button, Paper,
  Divider, CircularProgress, Snackbar, Alert, Fade
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import useAuth from "../hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import getAvatarUrl from "../utils/getAvatarUrl";
import { uploadAvatar } from "../utils/api";
import { appendQuery, eventContextFromSearch, eventContextToParams } from "../utils/eventContext";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [snackbar, setSnackbar] = useState({ open: false, success: true, msg: "" });
  const navigate = useNavigate();
  const location = useLocation();
  const eventParams = eventContextToParams(eventContextFromSearch(location.search));

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

    try {
      const res = await uploadAvatar(selectedFile);

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
    <Box sx={{ minHeight: "calc(100vh - 68px)", bgcolor: "#f6f8fb", pt: 4, pb: 5, px: 2 }}>
      <Paper
        variant="outlined"
        sx={{
          maxWidth: 440,
          mx: "auto",
          p: { xs: 3, sm: 4 },
          mt: 1,
          borderRadius: 2,
          boxShadow: "0 12px 32px rgba(16,24,40,0.06)",
          borderColor: "#e4e7ec"
        }}
      >
        <Button
          startIcon={<ArrowBackIcon />}
          sx={{ 
            mb: 2, 
            color: "#7a5200",
            fontWeight: 800,
            borderRadius: 2,
            "&:hover": { bgcolor: "#fff8e1" }
          }}
          onClick={() => navigate(appendQuery("/workspace", eventParams))}
        >
          กลับหน้าเลือกกิจกรรม
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
                boxShadow: "0 0 0 3px #f6b700",
                fontSize: 40,
                bgcolor: "#fff8e1",
                color: "#7a5200",
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
                border: "1px solid #f6b700",
                boxShadow: "0 3px 10px rgba(0,0,0,0.1)",
                "&:hover": { bgcolor: "#fff8e1" }
              }}
            >
              <PhotoCamera sx={{ color: "#7a5200", fontSize: 20 }} />
              <input hidden accept="image/*" type="file" onChange={handleFileChange} />
            </Button>
          </Box>

          <Fade in={!!selectedFile}>
            <Box sx={{ width: '100%' }}>
            {selectedFile && (
              <Button
                onClick={handleUpload}
                variant="contained"
                disabled={uploading}
                fullWidth
                sx={{ 
                  borderRadius: 2,
                  py: 1,
                  bgcolor: "#f6b700",
                  color: "#332400",
                  fontWeight: 900,
                  boxShadow: "0 8px 18px rgba(246,183,0,0.25)",
                  "&:hover": { bgcolor: "#d9a000" }
                }}
              >
                {uploading ? <CircularProgress size={24} color="inherit" /> : "ยืนยันการเปลี่ยนรูป"}
              </Button>
            )}
            </Box>
          </Fade>

          <Divider sx={{ width: "100%", borderColor: "rgba(0,0,0,0.06)" }} />

          <Stack spacing={1} alignItems="center" sx={{ width: '100%' }}>
            <Typography variant="h5" color="#263238" fontWeight={900} sx={{ letterSpacing: 0 }}>
              {user?.fullName || user?.username || "Unknown User"}
            </Typography>
            
            <Box sx={{ bgcolor: "#fff8e1", px: 2, py: 0.5, borderRadius: 2, border: "1px solid #fde68a" }}>
              <Typography variant="body2" color="#7a5200" fontWeight={800}>
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
