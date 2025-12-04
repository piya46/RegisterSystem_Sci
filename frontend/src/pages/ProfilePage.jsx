// import React, { useState } from "react";
// import {
//   Box, Avatar, Stack, Typography, Button, Paper,
//   Divider, CircularProgress, Snackbar, Alert, Fade
// } from "@mui/material";
// import ArrowBackIcon from "@mui/icons-material/ArrowBack";
// import PhotoCamera from "@mui/icons-material/PhotoCamera";
// import useAuth from "../hooks/useAuth";
// import { useNavigate } from "react-router-dom";
// import axios from "axios";

// export default function ProfilePage() {
//   const { user, token, updateUser } = useAuth();
//   const [selectedFile, setSelectedFile] = useState(null);
//   const [preview, setPreview] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [snackbar, setSnackbar] = useState({ open: false, success: true, msg: "" });
//   const navigate = useNavigate();

//   // --- Avatar URL ---
//   const avatarUrl = user?.avatar
//     ? `${import.meta.env.VITE_API_BASE_URL || ""}/uploads/avatars/${user.avatar}`
//     : `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.username || "")}&background=ffc1e3&color=fff`;

//   // --- On File Change ---
//   const handleFileChange = (e) => {
//     const file = e.target.files[0];
//     setSelectedFile(file);
//     setPreview(file ? URL.createObjectURL(file) : null);
//   };

//   // --- On Upload ---
//   const handleUpload = async () => {
//     if (!selectedFile) return;
//     setUploading(true);
//     const formData = new FormData();
//     formData.append("avatar", selectedFile);
//     try {
//       const res = await axios.post(
//         "/api/admins/upload-avatar",
//         formData,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "multipart/form-data"
//           }
//         }
//       );
//       updateUser && updateUser({ ...user, avatar: res.data.avatar });
//       setSnackbar({ open: true, success: true, msg: "เปลี่ยนรูปโปรไฟล์สำเร็จ!" });
//       setSelectedFile(null);
//       setPreview(null);
//     } catch {
//       setSnackbar({ open: true, success: false, msg: "อัปโหลดรูปไม่สำเร็จ" });
//     }
//     setUploading(false);
//   };

//   // --- ชื่อย่อ 5 ตัวแรก (ถ้าไม่มีรูป) ---
//   const shortName = (user?.fullName || user?.username || "").slice(0, 5).toUpperCase();

//   return (
//     <Box sx={{ minHeight: "100vh", bgcolor: "#fff6fa", pt: 5 }}>
//       <Paper
//         elevation={4}
//         sx={{
//           maxWidth: 430,
//           mx: "auto",
//           p: { xs: 2.5, sm: 4 },
//           mt: 3,
//           borderRadius: 6,
//           boxShadow: "0 4px 20px rgba(255,192,203,0.16)",
//         }}
//       >
//         <Button
//           startIcon={<ArrowBackIcon />}
//           sx={{
//             mb: 2.5, fontWeight: 500, color: "#d81b60",
//             "&:hover": { bgcolor: "rgba(248,187,208,0.2)" }
//           }}
//           onClick={() => navigate("/dashboard")}
//         >
//           กลับ Dashboard
//         </Button>
//         <Stack direction="column" alignItems="center" spacing={2}>
//           {/* Avatar + ปุ่มอัปโหลด */}
//           <Box sx={{ position: "relative", mb: 1.5 }}>
//             <Avatar
//               src={preview || avatarUrl}
//               alt="avatar"
//               sx={{
//                 width: 112, height: 112,
//                 border: "3.5px solid #f06292",
//                 bgcolor: "#ffe5ec",
//                 color: "#f06292",
//                 fontSize: 40,
//                 boxShadow: "0 2px 12px 0 #ffe5ec"
//               }}
//             >
//               {!user?.avatar && shortName}
//             </Avatar>
//             <Fade in={true}>
//               <Button
//                 component="label"
//                 variant="contained"
//                 size="small"
//                 sx={{
//                   position: "absolute",
//                   bottom: 5,
//                   right: 5,
//                   borderRadius: "50%",
//                   minWidth: 0,
//                   p: 1.2,
//                   bgcolor: "#fff",
//                   border: "2px solid #f8bbd0",
//                   boxShadow: "0 2px 8px 0 rgba(255,105,180,0.09)",
//                   transition: "all .15s",
//                   "&:hover": { bgcolor: "#f8bbd0", color: "#fff" }
//                 }}
//               >
//                 <PhotoCamera fontSize="small" />
//                 <input hidden accept="image/*" type="file" onChange={handleFileChange} />
//               </Button>
//             </Fade>
//           </Box>
//           {/* ปุ่มอัปโหลด */}
//           {selectedFile && (
//             <Button
//               onClick={handleUpload}
//               variant="contained"
//               color="secondary"
//               disabled={uploading}
//               fullWidth
//               sx={{ mt: 0.5, fontWeight: 600, letterSpacing: 1 }}
//             >
//               {uploading ? <CircularProgress size={22} color="inherit" /> : "บันทึกรูปโปรไฟล์"}
//             </Button>
//           )}

//           <Divider sx={{ my: 3, width: "100%" }} />

//           <Typography variant="h5" color="primary" fontWeight="bold" sx={{ letterSpacing: 1 }}>
//             {user?.fullName || user?.username}
//           </Typography>
//           <Typography color="text.secondary" mb={0.5}>
//             Username: <b>{user?.username}</b>
//           </Typography>
//           <Typography color="text.secondary" mb={0.5}>
//             Email: {user?.email || "-"}
//           </Typography>
//           <Typography color="secondary" fontWeight={600} letterSpacing={1}>
//             {Array.isArray(user?.role)
//               ? user.role.map(r => r.toUpperCase()).join(", ")
//               : (user?.role || "").toUpperCase()}
//           </Typography>
//         </Stack>
//       </Paper>
//       {/* แจ้งเตือน */}
//       <Snackbar
//         open={snackbar.open}
//         autoHideDuration={2100}
//         onClose={() => setSnackbar({ ...snackbar, open: false })}
//         anchorOrigin={{ vertical: "top", horizontal: "center" }}
//         TransitionComponent={Fade}
//       >
//         <Alert
//           onClose={() => setSnackbar({ ...snackbar, open: false })}
//           severity={snackbar.success ? "success" : "error"}
//           sx={{ width: "100%", fontWeight: "bold" }}
//         >
//           {snackbar.msg}
//         </Alert>
//       </Snackbar>
//     </Box>
//   );
// }

import React, { useState } from "react";
import {
  Box, Avatar, Stack, Typography, Button, Paper, Divider, CircularProgress
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
  const navigate = useNavigate();

  const avatarUrl = preview ? preview : getAvatarUrl(user);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("avatar", selectedFile);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/admins/upload-avatar`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
          }
        }
      );
      updateUser && updateUser({ ...user, avatar: res.data.filename });
      setSelectedFile(null);
      setPreview(null);
    } catch {
      alert("อัปโหลดรูปไม่สำเร็จ");
    }
    setUploading(false);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff6fa", pt: 5 }}>
      <Paper
        elevation={4}
        sx={{
          maxWidth: 440,
          mx: "auto",
          p: 4,
          mt: 3,
          borderRadius: 5,
          boxShadow: "0 4px 20px rgba(255,192,203,0.15)",
        }}
      >
        <Button
          startIcon={<ArrowBackIcon />}
          sx={{ mb: 3 }}
          color="secondary"
          onClick={() => navigate("/dashboard")}
        >
          กลับ Dashboard
        </Button>
        <Stack direction="column" alignItems="center" spacing={2}>
          <Box sx={{ position: "relative" }}>
            <Avatar
              src={avatarUrl}
              sx={{
                width: 110,
                height: 110,
                border: "3px solid #f06292",
                mb: 1,
              }}
            />
            <Button
              component="label"
              variant="contained"
              size="small"
              sx={{
                position: "absolute",
                bottom: 4,
                right: 4,
                borderRadius: "50%",
                minWidth: 0,
                p: 1.2,
                bgcolor: "#fff",
                border: "1.5px solid #f48fb1",
                boxShadow: "0 2px 8px 0 rgba(255,105,180,0.09)"
              }}
            >
              <PhotoCamera color="secondary" fontSize="small" />
              <input hidden accept="image/*" type="file" onChange={handleFileChange} />
            </Button>
          </Box>
          {selectedFile && (
            <Button
              onClick={handleUpload}
              variant="contained"
              color="secondary"
              disabled={uploading}
              fullWidth
              sx={{ mt: 0.5 }}
            >
              {uploading ? <CircularProgress size={20} color="inherit" /> : "บันทึกรูปโปรไฟล์"}
            </Button>
          )}

          <Divider sx={{ my: 3, width: "100%" }} />

          <Typography variant="h5" color="primary" fontWeight="bold">
            {user?.fullName || user?.username}
          </Typography>
          <Typography color="text.secondary" mb={0.5}>
            Username: <b>{user?.username}</b>
          </Typography>
          <Typography color="text.secondary" mb={0.5}>
            Email: {user?.email || "-"}
          </Typography>
          <Typography color="secondary" fontWeight={500}>
            {Array.isArray(user?.role)
              ? user.role.map(r => r.toUpperCase()).join(", ")
              : (user?.role || "").toUpperCase()}
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}