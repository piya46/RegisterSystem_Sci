// frontend/src/pages/SelfRegisterPage.jsx
import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress, Paper } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { requestShortSession } from "../utils/api";
import KioskPage from "./KioskPage";

export default function SelfRegisterPage() {
  const [status, setStatus] = useState("checking"); 
  const [errorMessage, setErrorMessage] = useState("");
  const [pointId, setPointId] = useState("");
  const [eventContext, setEventContext] = useState(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const masterToken = hashParams.get('token');
    if (masterToken) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    const fetchSession = async () => {
      try {
        const res = await requestShortSession(masterToken);
        // เก็บ Token เฉพาะใน SessionStorage ห้ามลง LocalStorage 
        sessionStorage.setItem('kioskToken', res.data.shortToken);
        setPointId(res.data.pointId);
        setEventContext({
          eventId: res.data.eventId || "",
          eventYear: res.data.eventYear || "",
        });
        setStatus("ready");
      } catch (err) {
        setErrorMessage(err.response?.data?.error || "ลิงก์นี้ไม่สามารถใช้งานได้");
        setStatus("error");
      }
    };

    if (masterToken) fetchSession();
    else { setStatus("error"); setErrorMessage("ไม่พบ Token ยืนยันตัวตน"); }
  }, []);
  
  if (status === "checking") {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh" bgcolor="#FFFDE7">
        <CircularProgress color="warning" />
        <Typography mt={2} fontWeight="bold" color="#F57F17">กำลังตรวจสอบสิทธิ์การลงทะเบียน...</Typography>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh" bgcolor="#FFFDE7" p={3}>
        <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center', maxWidth: 400 }}>
          <ErrorOutlineIcon sx={{ fontSize: 60, color: 'error.main', mb: 2 }} />
          <Typography variant="h6" fontWeight="bold" color="error">{errorMessage}</Typography>
          <Typography variant="body2" color="text.secondary" mt={2}>
            กรุณาติดต่อจุดลงทะเบียนเพื่อขอ QR Code ใหม่ หรือลงทะเบียนที่โต๊ะเจ้าหน้าที่
          </Typography>
        </Paper>
      </Box>
    );
  }

  // ส่ง Props ให้หน้า Kiosk รู้ว่าเป็นโหมดมือถือ
  return <KioskPage isSelfRegisterMode={true} forcePointId={pointId} initialEventContext={eventContext} />;
}
