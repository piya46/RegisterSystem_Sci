import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, TextField, MenuItem,
  Button, Avatar, Divider, Collapse, FormControlLabel, Switch,
  Alert, CircularProgress, Tooltip, Chip, LinearProgress, Card, CardContent, Checkbox,
  Dialog, DialogContent, Grid, Radio, RadioGroup, FormControl, FormLabel
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
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism'; 
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { listParticipantFields, createParticipant, createDonation } from "../utils/api";
import Turnstile, { executeTurnstile } from "../components/Turnstile";
import dayjs from "dayjs";

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
  
  // State สำหรับตัวเลือกสมาชิก
  const [membershipOption, setMembershipOption] = useState(null); 
  
  const [cfToken, setCfToken] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", msg: "", type: "error" });

  // Donation States
  const [wantToDonate, setWantToDonate] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [donationDate, setDonationDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [donationTime, setDonationTime] = useState(dayjs().format("HH:mm"));

  const ticketRef = useRef();

  useEffect(() => {
    setFetchingFields(true);
    listParticipantFields()
      .then((res) => setFields(res.data || res || []))
      .catch(() => setFields([]))
      .finally(() => setFetchingFields(false));
  }, []);

  // แยกฟิลด์เป็น 2 ส่วน: ทั่วไป (General) และ ที่อยู่ (Address)
  const { generalFields, addressFields } = useMemo(() => {
    // กรองเฉพาะฟิลด์ที่เปิดใช้งานและเรียงลำดับ
    const all = (fields || [])
      .filter(f => f?.enabled !== false)
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    
    // ฟังก์ชันช่วยแปลง options สำหรับ select
    const processField = (f) => ({
      ...f,
      _options: f.type === "select"
        ? (Array.isArray(f.options) ? f.options.map(o => {
            if (typeof o === "string") return { label: o, value: o };
            if (o && typeof o === "object") return { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" };
            return { label: String(o), value: String(o) };
          }) : [])
        : []
    });

    const processed = all.map(processField);

    return {
      // ฟิลด์ที่ไม่ใช่ที่อยู่
      generalFields: processed.filter(f => !['usr_add', 'usr_add_post'].includes(f.name)),
      // ฟิลด์ที่อยู่
      addressFields: processed.filter(f => ['usr_add', 'usr_add_post'].includes(f.name))
    };
  }, [fields]);

  const handleInput = (e) => {
    const { name, value } = e.target;
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

  useEffect(() => {
    const go = async () => {
      if (!pendingSubmit || !cfToken) return;
      setLoading(true);
      setResult(null);
      setRegisteredParticipant(null);
      try {
        const count = bringFollowers ? Math.max(0, parseInt(followersCount || 0, 10)) : 0;
        
        const finalConsent = (membershipOption === 'existing' || membershipOption === 'new') ? 'agreed' : 'disagreed';

        const finalForm = { ...form };
        // Hack: ส่งค่าขีดละไปถ้าเลือกไม่สมัคร เพื่อไม่ให้ติด required ที่หลังบ้าน
        if (membershipOption === 'none') {
          finalForm['usr_add'] = "-";
          finalForm['usr_add_post'] = "-";
        }

        const payload = { ...finalForm, followers: count, cfToken, consent: finalConsent };
        const participant = await createParticipant(payload);
        
        let successMessage = "ลงทะเบียนล่วงหน้าสำเร็จ!";

        if (wantToDonate && donationAmount && parseFloat(donationAmount) > 0) {
          try {
            const fullName = form.name || form.fullName || "- -";
            const nameParts = fullName.trim().split(" ");
            const firstName = nameParts[0] || "-";
            const lastName = nameParts.slice(1).join(" ") || "-";
            const transferDateTime = new Date(`${donationDate}T${donationTime}`);

            await createDonation({
              userId: null,
              firstName,
              lastName,
              amount: parseFloat(donationAmount),
              transferDateTime,
              source: "PRE_REGISTER"
            });
            successMessage += " และบันทึกข้อมูลการสนับสนุนเรียบร้อยแล้ว";
          } catch (donateErr) {
            console.error("Donation Error:", donateErr);
            successMessage += " (แต่บันทึกข้อมูลการสนับสนุนไม่สำเร็จ กรุณาติดต่อเจ้าหน้าที่)";
          }
        }

        setResult({ success: true, message: successMessage });
        setRegisteredParticipant(participant.data || participant);
        
        // Reset Form
        setForm({});
        setBringFollowers(false);
        setFollowersCount(0);
        setWantToDonate(false);
        setDonationAmount("");
        setMembershipOption(null);
        setErrors({});
      } catch (err) {
        const errorMsg = err?.response?.data?.error || "เกิดข้อผิดพลาด";
        const isSecurity = errorMsg.includes("Security") || errorMsg.includes("Turnstile");
        
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
    
    // ตรวจสอบว่าเลือกสถานะสมาชิกหรือยัง
    if (!membershipOption) {
      setErrorDialog({ 
        open: true, 
        type: "warning", 
        title: "กรุณาระบุข้อมูล", 
        msg: "กรุณาเลือกสถานะสมาชิกสมาคมนิสิตเก่าฯ ของท่าน" 
      });
      return;
    }
    
    // ตรวจสอบการกรอกที่อยู่ถ้าเลือกข้อ 1 หรือ 2 (Client-side validation)
    if (membershipOption !== 'none') {
        if (!form['usr_add'] || !form['usr_add_post']) {
             setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณากรอกที่อยู่และรหัสไปรษณีย์เพื่อดำเนินการต่อ" });
             return;
        }
    }

    if (wantToDonate) {
      if (!donationAmount || parseFloat(donationAmount) <= 0) {
        setErrorDialog({
          open: true, type: "error", title: "ข้อมูลไม่ครบถ้วน", 
          msg: "กรุณาระบุจำนวนเงินที่ต้องการสนับสนุน"
        });
        return;
      }
    }

    setPendingSubmit(true);
    executeTurnstile();
  };

  const savePdf = async () => { if (ticketRef.current) { const canvas = await html2canvas(ticketRef.current, { scale: 2, useCORS: true }); const imgData = canvas.toDataURL("image/png"); const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" }); const pageWidth = pdf.internal.pageSize.getWidth(); const imgWidth = 360; const imgHeight = (canvas.height * imgWidth) / canvas.width; const x = (pageWidth - imgWidth) / 2; const y = 60; pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight); pdf.save("E-Ticket.pdf"); }};
  const savePng = async () => { if (ticketRef.current) { const canvas = await html2canvas(ticketRef.current, { scale: 2, useCORS: true }); const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = "E-Ticket.png"; link.click(); }};

  const handleReset = () => {
    setForm({});
    setResult(null);
    setRegisteredParticipant(null);
    setBringFollowers(false);
    setFollowersCount(0);
    setWantToDonate(false);
    setDonationAmount("");
    setMembershipOption(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
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
                
                {/* 1. แสดงฟิลด์ข้อมูลทั่วไป (General Fields) ก่อน */}
                {generalFields.map((field) => (
                  <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
                ))}

                {/* 2. ส่วนผู้ติดตาม */}
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

                {/* 3. ส่วน Donation */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: wantToDonate ? "#e8f5e9" : "#f1f8e9", borderColor: wantToDonate ? "#66bb6a" : "#c5e1a5", transition: "all 0.3s" }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <VolunteerActivismIcon color="success" />
                    <Typography fontWeight={700} color="success.dark">ร่วมสนับสนุนกิจกรรม</Typography>
                    <Chip label="Optional" size="small" color="success" variant="outlined" sx={{ ml: "auto" }} />
                  </Stack>
                  <FormControlLabel 
                    sx={{ mt: 1 }} 
                    control={<Switch checked={wantToDonate} onChange={(e) => setWantToDonate(e.target.checked)} color="success" />} 
                    label={wantToDonate ? "ต้องการสนับสนุน" : "ไม่ประสงค์จะสนับสนุน"} 
                  />
                  <Collapse in={wantToDonate}>
                    {/* ... (Donation QR and Inputs) ... */}
                    <Box sx={{ mt: 2, p: 2, bgcolor: "#fff", borderRadius: 2, border: "1px dashed #81c784" }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom align="center">
                        สแกน QR Code ด้านล่างเพื่อโอนเงินสนับสนุน
                      </Typography>
                      <Stack alignItems="center" sx={{ mb: 2 }}>
                        <Box sx={{ width: 180, height: 180, bgcolor: "#eee", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2 }}>
                          <img src="/donate.png" alt="PromptPay QR Code" style={{ width: "100%", height: "100%", borderRadius: 8 }} />
                        </Box>
                        <Typography variant="caption" sx={{ mt: 1, fontWeight: 600 }}>
                          ชื่อบัญชี: น.ส.เสาวดี อิสริยะโอภาส และ นางนภาภรณ์ ลาชโรจน์
                        </Typography>
                        <Typography variant="caption">
                          ธนาคารกสิกรไทย <br/>
                          เลขที่บัญชี: 211-8-76814-3
                        </Typography>
                      </Stack>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <TextField
                            label="จำนวนเงินที่โอน (บาท)"
                            type="number"
                            fullWidth
                            value={donationAmount}
                            onChange={(e) => setDonationAmount(e.target.value)}
                            InputProps={{ inputProps: { min: 0 } }}
                            placeholder="เช่น 100, 500"
                            size="small"
                            sx={{ bgcolor: "#fff" }}
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            label="วันที่โอน"
                            type="date"
                            fullWidth
                            value={donationDate}
                            onChange={(e) => setDonationDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                            sx={{ bgcolor: "#fff" }}
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            label="เวลาที่โอน"
                            type="time"
                            fullWidth
                            value={donationTime}
                            onChange={(e) => setDonationTime(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                            sx={{ bgcolor: "#fff" }}
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  </Collapse>
                </Paper>

                {/* 4. ส่วนเลือกสถานะสมาชิก (Consent) - ย้ายมาไว้ท้ายสุดก่อนปุ่ม */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "#f4f9ff", borderColor: membershipOption ? "#cce0ff" : "#ef9a9a" }}>
                  <Typography fontWeight={700} sx={{ mb: 1, color: "#1565c0" }}>
                    สมาชิกสมาคมนิสิตเก่าฯ <span style={{ color: "red" }}>*</span>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    ท่านต้องการสมัครสมาชิกหรืออัปเดตข้อมูลสมาชิก "สมาคมนิสิตเก่าวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย" หรือไม่
                  </Typography>
                  
                  <FormControl component="fieldset">
                    <RadioGroup
                      name="membershipOption"
                      value={membershipOption}
                      onChange={(e) => setMembershipOption(e.target.value)}
                    >
                      <FormControlLabel 
                        value="existing" 
                        control={<Radio />} 
                        label="เป็นสมาชิกสมาคมฯ อยู่แล้ว และยินยอมอัปเดตข้อมูลสมาชิกฯ" 
                        sx={{ mb: 1, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.3 } }}
                      />
                      <FormControlLabel 
                        value="new" 
                        control={<Radio />} 
                        label={
                          <span>
                            สมัครสมาชิกสมาคมฯ <br/>
                            <span style={{ fontSize: '0.85em', color: '#666' }}>
                              (สมัครฟรีไม่มีค่าใช้จ่าย กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วนเพื่อประกอบการสมัคร ทีมงานจะบันทึกข้อมูลลงฐานข้อมูลสมาชิกสมาคมฯ หลังจบงาน)
                            </span>
                          </span>
                        }
                        sx={{ mb: 1, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.3 } }}
                      />
                      <FormControlLabel 
                        value="none" 
                        control={<Radio />} 
                        label="ไม่ประสงค์สมัครสมาชิกสมาคมฯ" 
                        sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.3 } }}
                      />
                    </RadioGroup>
                  </FormControl>

                  {/* 5. ฟิลด์ที่อยู่ (Address Fields) - แสดงเฉพาะเมื่อเลือก 1 หรือ 2 */}
                  <Collapse in={membershipOption === 'existing' || membershipOption === 'new'}>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #cce0ff' }}>
                        <Typography variant="subtitle2" sx={{ mb: 2, color: "#1565c0", fontWeight: 700 }}>
                            กรุณาระบุข้อมูลการติดต่อ (สำหรับสมาชิก)
                        </Typography>
                        <Stack spacing={2}>
                            {addressFields.map((field) => (
                                <FieldInput 
                                    key={field.name} 
                                    field={{...field, required: true}} // Force required เป็น true ที่นี่
                                    value={form[field.name] ?? ""} 
                                    onChange={handleInput} 
                                    errorText={errors[field.name]} 
                                />
                            ))}
                        </Stack>
                    </Box>
                  </Collapse>
                </Paper>

                <Alert severity="info" icon={<InfoIcon />} sx={{ fontWeight: 500, borderRadius: 3, "& .MuiAlert-icon": { alignItems: "center" } }}>
                  หมายเหตุ: ภายในงานจะมีการถ่ายรูปและบันทึกวิดีโอเพื่อนำไปใช้ในการประชาสัมพันธ์
                </Alert>

                <Turnstile invisible onVerify={(t) => setCfToken(t)} onError={() => setCfToken("")} options={{ action: "pre_register" }} />

                {result && <Alert severity="success" iconMapping={{ success: <CheckCircleIcon /> }} sx={{ fontWeight: 600 }}>{result.message}</Alert>}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button type="submit" variant="contained" color="warning" disabled={loading || Object.keys(errors).length > 0 || !membershipOption} fullWidth sx={{ fontWeight: 800, borderRadius: 3, boxShadow: loading ? "none" : "0 8px 20px rgba(255,193,7,.35)" }} startIcon={loading ? <CircularProgress size={18} /> : <QrCode2Icon />}>
                    {loading ? "กำลังส่งข้อมูล..." : "ลงทะเบียน"}
                  </Button>
                  <Button type="button" variant="outlined" color="inherit" fullWidth onClick={handleReset} startIcon={<RestartAltIcon />} sx={{ borderRadius: 3 }}>ล้างฟอร์ม</Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Paper>

        {/* ... Ticket Preview and Error Dialog ... */}
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