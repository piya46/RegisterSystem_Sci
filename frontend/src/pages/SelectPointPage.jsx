// frontend/src/pages/RegistrationPointSelector.jsx
import React, { useEffect, useState } from "react";
// [แก้ไข] นำเข้า generateKioskToken จาก API
import { listRegistrationPoints, generateKioskToken } from "../utils/api"; 
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, TextField, MenuItem, Button,
  CircularProgress, Alert, Stack, Avatar, InputAdornment, Container
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HistoryIcon from "@mui/icons-material/History";
import IosShareIcon from "@mui/icons-material/IosShare"; // [เพิ่ม] ไอคอนแชร์

// Theme Configuration
const THEME = {
  gradientBg: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #ffe082 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
  primary: "#FFC107", 
  dark: "#F57F17",
  text: "#4E342E"
};

export default function RegistrationPointSelector({ redirectTo: propRedirectTo, title }) {
  const [points, setPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  // Determine Destination
  const params = new URLSearchParams(location.search);
  const targetPath =
    propRedirectTo ||
    params.get("redirectTo") ||
    (window.location.pathname.includes("staff") ? "/staff" : "/kiosk");

  // Load Last Used Point
  useEffect(() => {
    const last = localStorage.getItem("lastPoint");
    if (last) setSelectedPoint(last);
  }, []);

  // Fetch Data
  const fetchPoints = () => {
    setLoading(true);
    setError("");
    
    listRegistrationPoints()
      .then((res) => {
         const allPoints = res.data || res || [];
         const activePoints = allPoints.filter(p => p.enabled === true || p.isActive === true);
         setPoints(activePoints);
         
         const lastUsed = localStorage.getItem("lastPoint");
         if (lastUsed && !activePoints.find(p => p._id === lastUsed || p.id === lastUsed)) {
            setSelectedPoint("");
         }
      })
      .catch((err) => {
        console.error(err);
        setError("ไม่สามารถโหลดข้อมูลจุดลงทะเบียนได้");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPoint) return;
    localStorage.setItem("lastPoint", selectedPoint);
    navigate(`${targetPath}?point=${selectedPoint}`);
  };

  // [เพิ่ม] ฟังก์ชันสร้างลิงก์สำหรับ Kiosk โหมด
  const handleShareKiosk = async () => {
    if (!selectedPoint) return;
    try {
      const res = await generateKioskToken(selectedPoint);
      const link = `${window.location.origin}/kiosk/join/${res.data.token}`;
      navigator.clipboard.writeText(link);
      alert('คัดลอกลิงก์ Kiosk สำเร็จ! สามารถนำไปเปิดลงทะเบียนหน้างานที่เครื่องอื่นได้ทันที\n' + link);
    } catch (err) {
      console.error(err);
      setError("ไม่สามารถสร้างลิงก์สำหรับ Kiosk ได้");
    }
  };

  const lastPointId = localStorage.getItem("lastPoint");
  const isLastUsed = lastPointId && lastPointId === selectedPoint;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: THEME.gradientBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2
      }}
    >
      <Container maxWidth="xs">
        <Card
          elevation={8}
          sx={{
            borderRadius: 5,
            background: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 193, 7, 0.3)",
            overflow: "visible" 
          }}
        >
          <CardContent sx={{ p: 4, textAlign: "center" }}>
            
            {/* Logo Section */}
            <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
              <Avatar
                src="/logo.svg"
                alt="Logo"
                sx={{
                  width: 80, height: 80,
                  bgcolor: "#fff",
                  boxShadow: "0 4px 12px rgba(255, 193, 7, 0.4)",
                  border: "2px solid #FFECB3"
                }}
              />
            </Box>

            {/* Header */}
            <Typography variant="h5" fontWeight={800} sx={{ color: THEME.text, mb: 0.5 }}>
              {title || "เลือกจุดลงทะเบียน"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              กรุณาเลือกสถานที่/จุดปฏิบัติงานของคุณ
            </Typography>

            {/* Content Area */}
            {loading ? (
              <Box sx={{ py: 4 }}>
                <CircularProgress sx={{ color: THEME.primary }} />
                <Typography variant="caption" display="block" sx={{ mt: 2, color: "text.secondary" }}>
                  กำลังโหลดข้อมูล...
                </Typography>
              </Box>
            ) : error ? (
              <Alert 
                severity="error" 
                action={
                  <Button color="inherit" size="small" onClick={fetchPoints} startIcon={<RefreshIcon />}>
                    ลองใหม่
                  </Button>
                }
                sx={{ borderRadius: 3, mb: 2, textAlign: "left" }}
              >
                {error}
              </Alert>
            ) : (
              <form onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  
                  {/* Selector */}
                  <TextField
                    select
                    label="สถานที่จุดลงทะเบียน"
                    value={selectedPoint}
                    onChange={(e) => setSelectedPoint(e.target.value)}
                    fullWidth
                    required
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationOnIcon sx={{ color: THEME.primary }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3,
                        bgcolor: "#fff",
                        "& fieldset": { borderColor: "#FFECB3" },
                        "&:hover fieldset": { borderColor: THEME.primary },
                        "&.Mui-focused fieldset": { borderColor: THEME.primary },
                        textAlign: "left"
                      }
                    }}
                  >
                    <MenuItem value="" disabled>
                      <em>-- กรุณาเลือก --</em>
                    </MenuItem>
                    {points.length === 0 ? (
                      <MenuItem value="" disabled>ไม่มีจุดลงทะเบียนที่เปิดใช้งาน</MenuItem>
                    ) : (
                      points.map((p) => (
                        <MenuItem key={p._id || p.id} value={p._id || p.id}>
                          {p.name}
                        </MenuItem>
                      ))
                    )}
                  </TextField>

                  {/* Feedback / Status */}
                  {selectedPoint && (
                     <Box 
                       sx={{ 
                         p: 1.5, 
                         borderRadius: 3, 
                         bgcolor: isLastUsed ? "#FFF8E1" : "#F1F8E9", 
                         border: `1px dashed ${isLastUsed ? "#FFC107" : "#AED581"}`,
                         display: "flex", alignItems: "center", gap: 1
                       }}
                     >
                        {isLastUsed ? <HistoryIcon color="warning" fontSize="small"/> : <CheckCircleIcon color="success" fontSize="small"/>}
                        <Typography variant="caption" fontWeight={600} color={isLastUsed ? "warning.dark" : "success.dark"}>
                           {isLastUsed ? "ใช้งานล่าสุด" : "เลือกจุดนี้"}
                        </Typography>
                     </Box>
                  )}

                  {/* [แก้ไข] จัดการปุ่มให้เป็น Stack แนวตั้งเพื่อเพิ่มปุ่ม Share Kiosk */}
                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={!selectedPoint}
                      endIcon={<ArrowForwardIcon />}
                      sx={{
                        borderRadius: 3,
                        fontWeight: 800,
                        py: 1.5,
                        bgcolor: THEME.primary,
                        color: "#4e342e",
                        boxShadow: "0 8px 16px rgba(255, 193, 7, 0.4)",
                        "&:hover": { bgcolor: THEME.dark }
                      }}
                    >
                      ดำเนินการต่อ
                    </Button>

                    {/* [เพิ่ม] ปุ่มสำหรับแชร์ลิงก์ให้ Tablet เครื่องอื่น */}
                    <Button
                      type="button"
                      variant="outlined"
                      size="large"
                      fullWidth
                      disabled={!selectedPoint}
                      onClick={handleShareKiosk}
                      startIcon={<IosShareIcon />}
                      sx={{
                        borderRadius: 3,
                        fontWeight: 700,
                        py: 1.2,
                        borderColor: THEME.primary,
                        color: THEME.dark,
                        "&:hover": { borderColor: THEME.dark, bgcolor: "#FFF8E1" }
                      }}
                    >
                      แชร์ลิงก์ Kiosk (Public)
                    </Button>
                  </Stack>

                </Stack>
              </form>
            )}

          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}