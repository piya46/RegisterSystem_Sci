import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, TextField, MenuItem,
  Button, Avatar, Divider, Collapse, FormControlLabel, Switch,
  Alert, CircularProgress, Tooltip, Chip, LinearProgress, Card, CardContent, Checkbox,
  Dialog, DialogContent
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import InfoIcon from "@mui/icons-material/Info";
import SecurityIcon from "@mui/icons-material/Security";
import WarningIcon from "@mui/icons-material/Warning";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { listParticipantFields, createParticipant } from "../utils/api";
import Turnstile, { executeTurnstile } from "../components/Turnstile";

export default function PreRegistrationPage() {
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetchingFields, setFetchingFields] = useState(true);
  const [result, setResult] = useState(null);
  const [registeredParticipant, setRegisteredParticipant] = useState(null);

  // Feature States
  const [bringFollowers, setBringFollowers] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [consent, setConsent] = useState(null);
  const [cfToken, setCfToken] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", msg: "", type: "error" });

  const ticketRef = useRef();

  useEffect(() => {
    setFetchingFields(true);
    listParticipantFields()
      .then((res) => setFields(res.data || res || []))
      .catch(() => setFields([]))
      .finally(() => setFetchingFields(false));
  }, []);

  const uiFields = useMemo(() => {
    return (fields || [])
      .filter(f => f?.enabled !== false)
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0))
      .map(f => ({
        ...f,
        _options: f.type === "select"
          ? (Array.isArray(f.options) ? f.options.map(o => {
              if (typeof o === "string") return { label: o, value: o };
              if (o && typeof o === "object") return { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" };
              return { label: String(o), value: String(o) };
            }) : [])
          : []
      }));
  }, [fields]);

  const handleInput = (e) => {
    const { name, value } = e.target;
    // Date Year Validation
    if (name === 'date_year') {
      if (!/^\d*$/.test(value)) return;
      if (value.length > 4) return;
      if (value.length === 4 && parseInt(value, 10) < 2400) {
        setErrors(prev => ({ ...prev, [name]: "กรุณากรอกปี พ.ศ. (เช่น 2569)" }));
      } else {
        setErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
      }
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleConsentChange = (value) => {
    setConsent(prev => prev === value ? null : value);
  };

  // Submit Trigger when Token is ready
  useEffect(() => {
    const go = async () => {
      if (!pendingSubmit || !cfToken) return;
      setLoading(true);
      setResult(null);
      setRegisteredParticipant(null);
      try {
        const count = bringFollowers ? Math.max(0, parseInt(followersCount || 0, 10)) : 0;
        const payload = { ...form, followers: count, cfToken, consent };
        const participant = await createParticipant(payload);
        setResult({ success: true, message: "ลงทะเบียนล่วงหน้าสำเร็จ!" });
        setRegisteredParticipant(participant.data || participant);
        setForm({});
        setBringFollowers(false);
        setFollowersCount(0);
        setConsent(null);
        setErrors({});
      } catch (err) {
        const errorMsg = err?.response?.data?.error || "เกิดข้อผิดพลาด";
        const isSecurity = errorMsg.includes("Security") || errorMsg.includes("Turnstile");
        
        // Show Styled Error Dialog
        setErrorDialog({
          open: true,
          type: isSecurity ? "security" : "error",
          title: isSecurity ? "Security Check Failed" : "Registration Failed",
          msg: isSecurity ? "ระบบไม่สามารถยืนยันตัวตนของคุณได้ กรุณาลองใหม่อีกครั้ง" : errorMsg
        });

        if (window.turnstile) {
          try { window.turnstile.reset(); } catch {}
        }
      } finally {
        setLoading(false);
        setPendingSubmit(false);
        setCfToken("");
      }
    };
    go();
    // eslint-disable-next-line
  }, [cfToken, pendingSubmit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) return;
    if (!consent) return;
    setPendingSubmit(true);
    executeTurnstile();
  };

  const savePdf = async () => { /* ... same as before ... */ 
    if (!ticketRef.current) return;
    const canvas = await html2canvas(ticketRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = 360;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const x = (pageWidth - imgWidth) / 2;
    const y = 60;
    pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
    pdf.save("E-Ticket.pdf");
  };

  const savePng = async () => { /* ... same as before ... */
    if (!ticketRef.current) return;
    const canvas = await html2canvas(ticketRef.current, { scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "E-Ticket.png";
    link.click();
  };

  const handleReset = () => {
    setForm({});
    setResult(null);
    setRegisteredParticipant(null);
    setBringFollowers(false);
    setFollowersCount(0);
    setConsent(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        {/* Header */}
        <Paper elevation={4} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(227,242,253,.95) 100%)", boxShadow: "0 14px 36px rgba(255,193,7,0.25)", border: "1px solid rgba(255,193,7,.35)" }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <Avatar src="/logo.svg" alt="Logo" sx={{ width: 150, height: 150, bgcolor: "#fff", border: "2px solid rgba(255,193,7,.7)", boxShadow: "0 6px 18px rgba(255,193,7,.35)" }} />
            <Box textAlign="center">
              <Typography variant="h6" fontWeight={900} color="primary" sx={{ letterSpacing: .6 }}>ลงทะเบียนล่วงหน้าเพื่อเข้าร่วมงานคืนเหย้า <br /> "เสือเหลืองคืนถิ่น" <br /> Atoms In Ground Stage 109</Typography>
              <Typography variant="body2" color="text.secondary">สถานที่จัดงาน ภายในคณะวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย <br /> วันเสาร์ที่ 21 กุมภาพันธ์ 2569 เวลา 17:00 - 22:00 น.</Typography>
            </Box>
          </Stack>

          {fetchingFields && <Box sx={{ mt: 2 }}><LinearProgress color="warning" /><Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>กำลังโหลดฟิลด์ข้อมูล...</Typography></Box>}

          {!registeredParticipant && !fetchingFields && (
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
              <Stack spacing={2}>
                {uiFields.length === 0 && <Alert severity="info" variant="outlined">ยังไม่มีฟิลด์ให้กรอก</Alert>}
                {uiFields.map((field) => (
                  <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
                ))}

                {/* Followers */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "#fffdf7" }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <GroupAddIcon color="warning" />
                    <Typography fontWeight={700}>พาผู้ติดตามมาด้วย</Typography>
                    <Chip label="ไม่บังคับ" size="small" sx={{ ml: "auto" }} />
                  </Stack>
                  <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={bringFollowers} onChange={(e) => setBringFollowers(e.target.checked)} color="warning" />} label={bringFollowers ? "มีผู้ติดตาม" : "ไม่มีผู้ติดตาม"} />
                  <Collapse in={bringFollowers}>
                    <TextField type="text" inputMode="numeric" label="จำนวนผู้ติดตาม" value={String(followersCount ?? "")} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ""); setFollowersCount(raw === "" ? 0 : parseInt(raw, 10)); }} fullWidth sx={{ mt: 1.5 }} />
                  </Collapse>
                </Paper>

                {/* Consent */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "#f4f9ff", borderColor: consent ? "#cce0ff" : "#ef9a9a" }}>
                  <Typography fontWeight={700} sx={{ mb: 1, color: "#1565c0" }}>การยินยอมข้อมูล <span style={{ color: "red" }}>*</span></Typography>
                  <Stack>
                    <FormControlLabel control={<Checkbox checked={consent === 'agreed'} onChange={() => handleConsentChange('agreed')} color="primary" />} label="ยินยอมให้อัพเดตข้อมูลให้แก่สมาคมนิสิตเก่าวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย" />
                    <FormControlLabel control={<Checkbox checked={consent === 'disagreed'} onChange={() => handleConsentChange('disagreed')} color="error" />} label="ไม่ยินยอมให้อัพเดตข้อมูลให้แก่สมาคมนิสิตเก่าวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย" />
                  </Stack>
                  {!consent && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontWeight: 500 }}>* กรุณาเลือกตัวเลือกอย่างใดอย่างหนึ่งเพื่อดำเนินการต่อ</Typography>}
                </Paper>

                <Alert severity="info" icon={<InfoIcon />} sx={{ fontWeight: 500, borderRadius: 3, "& .MuiAlert-icon": { alignItems: "center" } }}>
                  หมายเหตุ: ภายในงานจะมีการถ่ายรูปและบันทึกวิดีโอเพื่อนำไปใช้ในการประชาสัมพันธ์
                </Alert>

                <Turnstile invisible onVerify={(t) => setCfToken(t)} onError={() => setCfToken("")} options={{ action: "pre_register" }} />

                {result && <Alert severity="success" iconMapping={{ success: <CheckCircleIcon /> }} sx={{ fontWeight: 600 }}>{result.message}</Alert>}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button type="submit" variant="contained" color="warning" disabled={loading || uiFields.length === 0 || Object.keys(errors).length > 0 || !consent} fullWidth sx={{ fontWeight: 800, borderRadius: 3, boxShadow: loading ? "none" : "0 8px 20px rgba(255,193,7,.35)" }} startIcon={loading ? <CircularProgress size={18} /> : <QrCode2Icon />}>
                    {loading ? "กำลังส่งข้อมูล..." : "ลงทะเบียน"}
                  </Button>
                  <Button type="button" variant="outlined" color="inherit" fullWidth onClick={handleReset} startIcon={<RestartAltIcon />} sx={{ borderRadius: 3 }}>ล้างฟอร์ม</Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Paper>

        {/* Ticket Preview */}
        {registeredParticipant && (
          <Card elevation={6} sx={{ mt: 4, borderRadius: 4 }}>
            <CardContent>
              <Box ref={ticketRef} sx={{ textAlign: "center", p: { xs: 2, md: 3 }, border: "2px solid #1976d2", borderRadius: 3, background: "linear-gradient(135deg, #fafbff 80%, #e3eefe 100%)", boxShadow: "0 2px 18px #b3d6f833", position: "relative", overflow: "hidden" }}>
                <Avatar src="/logo.svg" alt="logo" sx={{ width: 72, height: 72, position: "absolute", right: 12, top: 12, bgcolor: "#fff", border: "2px solid #1976d244" }} />
                <Typography variant="h6" color="primary" fontWeight={900} sx={{ mb: 1 }}>E-Ticket เข้างาน</Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack alignItems="center" sx={{ my: 2 }}><QRCodeSVG value={registeredParticipant?.qrCode || registeredParticipant?._id || ""} size={220} level="H" includeMargin style={{ background: "#fff", padding: 8, borderRadius: 16 }} /></Stack>
                <InfoRow label="ชื่อ" value={pickField(registeredParticipant, ["name", "fullName", "fullname", "firstName"])}/>
                <InfoRow label="เบอร์โทร" value={pickField(registeredParticipant, ["phone", "tel", "mobile"])}/>
                <InfoRow label="ภาควิชา" value={pickField(registeredParticipant, ["dept", "department"])}/>
                <InfoRow label="ปีการศึกษา" value={pickField(registeredParticipant, ["date_year", "year", "academicYear"])}/>
                <InfoRow label="ผู้ติดตาม" value={Number.isFinite(+registeredParticipant?.followers) ? +registeredParticipant.followers : (Number.isFinite(+registeredParticipant?.fields?.followers) ? +registeredParticipant.fields.followers : 0)} />
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center" sx={{ mt: 2 }}>
                <Tooltip title="ดาวน์โหลดเป็น PDF"><Button variant="contained" onClick={savePdf} startIcon={<PictureAsPdfIcon />} sx={{ borderRadius: 3 }}>บันทึกเป็น PDF</Button></Tooltip>
                <Tooltip title="ดาวน์โหลดเป็น PNG"><Button variant="outlined" onClick={savePng} startIcon={<DownloadIcon />} sx={{ borderRadius: 3 }}>บันทึกเป็น PNG</Button></Tooltip>
                <Button variant="text" onClick={handleReset} startIcon={<RestartAltIcon />} sx={{ borderRadius: 3 }}>เริ่มกรอกข้อมูลใหม่</Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Error Dialog (Modern Cloudflare Style) */}
        <Dialog
          open={errorDialog.open}
          onClose={() => setErrorDialog({ ...errorDialog, open: false })}
          PaperProps={{
            sx: {
              borderRadius: 4, p: 1, maxWidth: 360, textAlign: 'center',
              borderTop: errorDialog.type === 'security' ? '6px solid #FF3B30' : '6px solid #FF9800'
            }
          }}
        >
          <DialogContent>
            <Stack alignItems="center" spacing={2}>
              <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: errorDialog.type === 'security' ? '#FFEBEE' : '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {errorDialog.type === 'security' ? <SecurityIcon sx={{ fontSize: 36, color: '#D32F2F' }} /> : <WarningIcon sx={{ fontSize: 36, color: '#EF6C00' }} />}
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={800} color={errorDialog.type === 'security' ? '#D32F2F' : '#EF6C00'} gutterBottom>
                  {errorDialog.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">{errorDialog.msg}</Typography>
              </Box>
              <Button variant="contained" color={errorDialog.type === 'security' ? 'error' : 'warning'} fullWidth onClick={() => setErrorDialog({ ...errorDialog, open: false })} sx={{ borderRadius: 2, fontWeight: 700, mt: 1 }}>
                ตกลง
              </Button>
            </Stack>
          </DialogContent>
        </Dialog>

      </Container>
    </Box>
  );
}

// ... (Helper functions same as before) ...
function FieldInput({ field, value, onChange, errorText }) {
  if (field.type === "select") {
    return (
      <TextField select name={field.name} label={field.label} value={value} onChange={onChange} required={!!field.required} fullWidth helperText={field.required ? "จำเป็นต้องกรอก" : "ไม่บังคับ"} SelectProps={{ displayEmpty: true }} sx={tfStyle}>
        <MenuItem value=""><em>— เลือก {field.label} —</em></MenuItem>
        {field._options.map((opt) => (<MenuItem key={`${field.name}-${opt.value}`} value={opt.value}>{opt.label}</MenuItem>))}
      </TextField>
    );
  }
  const inputType = field.type === "email" ? "email" : field.type === "number" ? "text" : field.type === "date" ? "date" : "text";
  return (
    <TextField name={field.name} type={inputType} label={field.label} value={value} onChange={onChange} required={!!field.required} fullWidth error={!!errorText} helperText={errorText || (field.required ? "จำเป็นต้องกรอก" : "ไม่บังคับ")} sx={tfStyle} InputLabelProps={inputType === "date" ? { shrink: true } : undefined} autoComplete="off" inputProps={field.type === "number" ? { inputMode: "numeric", pattern: "[0-9]*" } : undefined} />
  );
}
function InfoRow({ label, value }) { return (<Stack direction="row" justifyContent="center" spacing={1} sx={{ mb: .5 }}><Typography sx={{ fontWeight: 700 }}>{label}:</Typography><Typography>{value || "-"}</Typography></Stack>); }
const tfStyle = { "& .MuiOutlinedInput-root": { bgcolor: "#fff", borderRadius: 2, "& fieldset": { borderColor: "rgba(25,118,210,.35)" }, "&:hover fieldset": { borderColor: "rgba(25,118,210,.7)" }, "&.Mui-focused fieldset": { borderColor: "#1976d2" } } };
function pickField(participant, keys) { const f = participant?.fields || {}; for (const k of keys) { if (f[k] != null && String(f[k]).trim() !== "") return f[k]; } return ""; }