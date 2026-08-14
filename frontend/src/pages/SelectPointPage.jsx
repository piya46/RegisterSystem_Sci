// frontend/src/pages/RegistrationPointSelector.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listEnabledRegistrationPoints, generateKioskToken, generateSelfRegisterLink } from "../utils/api";
import { useNavigate, useLocation } from "react-router";
import {
  Box, Card, CardContent, Typography, TextField, MenuItem, Button,
  CircularProgress, Alert, Stack, Avatar, InputAdornment, Container,
  Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HistoryIcon from "@mui/icons-material/History";
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { QRCodeSVG } from 'qrcode.react';
import { appendQuery, eventContextFromSearch, eventContextToParams } from "../utils/eventContext";

const THEME = {
  gradientBg: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #ffe082 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
  primary: "#FFC107", dark: "#F57F17", text: "#4E342E"
};

export default function RegistrationPointSelector({ redirectTo: propRedirectTo, title }) {
  const [points, setPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const eventContext = useMemo(() => eventContextFromSearch(location.search), [location.search]);
  const eventParams = useMemo(() => eventContextToParams(eventContext), [eventContext]);
  const targetPath = propRedirectTo || params.get("redirectTo") || (window.location.pathname.includes("staff") ? "/staff" : "/kiosk");

  useEffect(() => {
    const last = localStorage.getItem("lastPoint");
    if (last) setSelectedPoint(last);
  }, []);

  const fetchPoints = useCallback(() => {
    setLoading(true); setError("");
    listEnabledRegistrationPoints(eventParams).then((res) => {
         const allPoints = res.data || res || [];
         const activePoints = allPoints.filter(p => p.enabled === true || p.isActive === true);
         setPoints(activePoints);
         const lastUsed = localStorage.getItem("lastPoint");
         if (lastUsed && !activePoints.find(p => p._id === lastUsed || p.id === lastUsed)) setSelectedPoint("");
      }).catch(() => setError("ไม่สามารถโหลดข้อมูลจุดลงทะเบียนได้")).finally(() => setLoading(false));
  }, [eventParams]);

  useEffect(() => { fetchPoints(); }, [fetchPoints]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPoint) return;
    localStorage.setItem("lastPoint", selectedPoint);
    navigate(appendQuery(targetPath, { ...eventParams, point: selectedPoint }));
  };

  const handleShareKiosk = async () => {
    if (!selectedPoint) return;
    try {
      const selectedPointData = points.find((point) => point._id === selectedPoint || point.id === selectedPoint);
      const requiresDeviceId = selectedPointData?.requiresDeviceBinding === true;
      const deviceId = requiresDeviceId ? window.prompt('กรุณาระบุ Device ID ของเครื่อง Kiosk นี้') : '';
      if (requiresDeviceId && !deviceId) return;
      const res = await generateKioskToken(selectedPoint, { ...eventParams, deviceId });
      const link = `${window.location.origin}/kiosk/join#token=${encodeURIComponent(res.data.token)}`;
      navigator.clipboard.writeText(link);
      alert('คัดลอกลิงก์เครื่อง Kiosk สำเร็จแล้ว! ลิงก์นี้หมดอายุใน 12 ชั่วโมง');
    } catch { setError("ไม่สามารถสร้างลิงก์ได้"); }
  };

  const handleOpenQrDialog = () => {
    if (!selectedPoint) return;
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const toLocalISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    setValidFrom(toLocalISO(now));
    setValidUntil(toLocalISO(endOfDay));
    setGeneratedLink("");
    setQrDialogOpen(true);
  };

  const handleGenerateSelfRegisterLink = async () => {
    try {
      const res = await generateSelfRegisterLink({
        pointId: selectedPoint,
        validFrom: new Date(validFrom).toISOString(),
        validUntil: new Date(validUntil).toISOString(),
        ...eventParams
      });
      setGeneratedLink(`${window.location.origin}${appendQuery('/self-register', eventParams)}#token=${encodeURIComponent(res.data.token)}`);
    } catch (err) {
      alert(err.response?.data?.error || "เกิดข้อผิดพลาดในการสร้างลิงก์");
    }
  };

  const lastPointId = localStorage.getItem("lastPoint");
  const isLastUsed = lastPointId && lastPointId === selectedPoint;

  return (
    <Box sx={{ minHeight: "100vh", background: THEME.gradientBg, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
      <Container maxWidth="xs">
        <Card elevation={8} sx={{ borderRadius: 5, background: "rgba(255, 255, 255, 0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255, 193, 7, 0.3)" }}>
          <CardContent sx={{ p: {xs: 3, md: 4}, textAlign: "center" }}>
            <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}><Avatar src="/logo.svg" sx={{ width: 80, height: 80, bgcolor: "#fff", boxShadow: "0 4px 12px rgba(255, 193, 7, 0.4)", border: "2px solid #FFECB3" }} /></Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: THEME.text, mb: 0.5 }}>{title || "เลือกจุดลงทะเบียน"}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>กรุณาเลือกสถานที่/จุดปฏิบัติงานของคุณ</Typography>

            {loading ? (
              <Box sx={{ py: 4 }}><CircularProgress sx={{ color: THEME.primary }} /><Typography variant="caption" display="block" sx={{ mt: 2 }}>กำลังโหลดข้อมูล...</Typography></Box>
            ) : error ? (
              <Alert severity="error" action={<Button color="inherit" size="small" onClick={fetchPoints} startIcon={<RefreshIcon />}>ลองใหม่</Button>} sx={{ borderRadius: 3, mb: 2 }}>{error}</Alert>
            ) : (
              <form onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  <TextField select label="สถานที่จุดลงทะเบียน" value={selectedPoint} onChange={(e) => setSelectedPoint(e.target.value)} fullWidth required InputProps={{ startAdornment: ( <InputAdornment position="start"><LocationOnIcon sx={{ color: THEME.primary }} /></InputAdornment> )}} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: "#fff", textAlign: "left" } }}>
                    <MenuItem value="" disabled><em>-- กรุณาเลือก --</em></MenuItem>
                    {points.map((p) => (<MenuItem key={p._id || p.id} value={p._id || p.id}>{p.name}</MenuItem>))}
                  </TextField>

                  {selectedPoint && (
                     <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: isLastUsed ? "#FFF8E1" : "#F1F8E9", border: `1px dashed ${isLastUsed ? "#FFC107" : "#AED581"}`, display: "flex", alignItems: "center", gap: 1 }}>
                        {isLastUsed ? <HistoryIcon color="warning" fontSize="small"/> : <CheckCircleIcon color="success" fontSize="small"/>}
                        <Typography variant="caption" fontWeight={600} color={isLastUsed ? "warning.dark" : "success.dark"}>{isLastUsed ? "ใช้งานล่าสุด" : "เลือกจุดนี้"}</Typography>
                     </Box>
                  )}

                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    <Button type="submit" variant="contained" size="large" fullWidth disabled={!selectedPoint} endIcon={<ArrowForwardIcon />} sx={{ borderRadius: 3, fontWeight: 800, py: 1.5, bgcolor: THEME.primary, color: "#4e342e", "&:hover": { bgcolor: THEME.dark } }}>ดำเนินการต่อ (เครื่องหลัก)</Button>

                    <Button type="button" variant="outlined" size="large" fullWidth disabled={!selectedPoint} onClick={handleOpenQrDialog} startIcon={<QrCodeScannerIcon />} sx={{ borderRadius: 3, fontWeight: 700, py: 1.2, borderColor: THEME.dark, color: THEME.dark, "&:hover": { bgcolor: "#FFF8E1" } }}>
                      สร้าง QR Code ให้ผู้เข้าร่วม
                    </Button>

                    <Typography variant="caption" color="text.secondary" onClick={handleShareKiosk} sx={{ cursor: 'pointer', textDecoration: 'underline' }}>คัดลอกลิงก์เครื่อง Kiosk (หมดอายุใน 12 ชั่วโมง)</Typography>
                  </Stack>
                </Stack>
              </form>
            )}
          </CardContent>
        </Card>
      </Container>

      <Dialog open={qrDialogOpen} onClose={() => setQrDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center', bgcolor: '#FFF8E1' }}>QR Code ผู้เข้าร่วมลงทะเบียนเอง</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" mb={3} textAlign="center">
            ผู้เข้าร่วมสแกน QR นี้เพื่อลงทะเบียนผ่านมือถือ (Session จะหมดอายุใน 15 นาทีต่อคน)
          </Typography>

          {!generatedLink ? (
            <Stack spacing={3}>
              <TextField label="เริ่มใช้งานได้ตั้งแต่" type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField label="หมดอายุการใช้งาน" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <Button variant="contained" onClick={handleGenerateSelfRegisterLink} size="large" sx={{ borderRadius: 3, bgcolor: THEME.primary, color: THEME.text, fontWeight: 800 }}>สร้าง QR Code ทันที</Button>
            </Stack>
          ) : (
            <Stack spacing={3} alignItems="center">
              <Box sx={{ p: 2, bgcolor: '#fff', border: '2px solid #FFC107', borderRadius: 2, boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                <QRCodeSVG value={generatedLink} size={250} level={"H"} />
              </Box>
              <Box textAlign="center">
                <Typography variant="caption" color="error" fontWeight="bold">QR Code นี้มีอายุถึง: {new Date(validUntil).toLocaleString('th-TH')}</Typography>
              </Box>
              <Button variant="outlined" onClick={() => { navigator.clipboard.writeText(generatedLink); alert("คัดลอกลิงก์แล้ว"); }} startIcon={<ContentCopyIcon />} sx={{ borderRadius: 3 }}>คัดลอกลิงก์แทน</Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
          <Button onClick={() => setQrDialogOpen(false)} color="inherit">ปิดหน้าต่าง</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
