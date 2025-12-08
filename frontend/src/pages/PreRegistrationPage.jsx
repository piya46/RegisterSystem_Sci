// frontend/src/pages/PreRegistrationPage.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, TextField, MenuItem,
  Button, Avatar, Divider, Collapse, FormControlLabel, Switch,
  Alert, CircularProgress, Tooltip, Chip, Card, CardContent,
  Dialog, DialogContent, DialogTitle, DialogActions, Grid, Radio, RadioGroup, FormControl, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InfoIcon from "@mui/icons-material/Info";
import SecurityIcon from "@mui/icons-material/Security";
import WarningIcon from "@mui/icons-material/Warning";
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism'; 
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import HomeIcon from '@mui/icons-material/Home';
import EventIcon from '@mui/icons-material/Event';
import SchoolIcon from '@mui/icons-material/School';
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import AccessibleIcon from '@mui/icons-material/Accessible';

import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { listParticipantFields, createParticipant, createDonation } from "../utils/api";
import Turnstile, { executeTurnstile } from "../components/Turnstile";
import dayjs from "dayjs";

// --- Configuration Constants (เพิ่มราคา price เพื่อใช้คำนวณ) ---
const PACKAGE_OPTIONS = [
  { price: 2000, value: "package_A", label: "สนับสนุนเงิน 2,000 บาท รับเสื้องานคืนเหย้า POLO สีน้ำเงิน (คอปก) 1 ตัว และ ตุ๊กตาเสือเหลือง_ผ้านุ่ม (ขนาด 12 นิ้ว) 1 ตัว" },
  { price: 2000, value: "package_B", label: "สนับสนุนเงิน 2,000 บาท รับเสื้องานคืนเหย้า POLO สีชมพู (คอปก) 1 ตัว และ ตุ๊กตาเสือเหลือง_ผ้านุ่ม (ขนาด 12 นิ้ว) 1 ตัว" },
  { price: 1500, value: "package_C", label: "สนับสนุนเงิน 1,500 บาท รับเสื้องานคืนเหย้า T-shirt สีเหลือง (คอกลม) 1 ตัว และ พวงกุญแจเสือเหลือง (ขนาด 5 นิ้ว) 1 ตัว" },
  { price: 1200, value: "package_D", label: "สนับสนุนเงิน 1,200 บาท รับเสื้องานคืนเหย้า T-shirt สีเหลือง (คอกลม) 1 ตัว" }
];
const SIZE_OPTIONS = ["SS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL","6XL","7XL"];

// ข้อมูลตารางไซส์
const SIZE_CHART_DATA = [
  { size: "SS", chest: 34, length: 23 },
  { size: "S",  chest: 36, length: 24 },
  { size: "M",  chest: 38, length: 25 },
  { size: "L",  chest: 40, length: 26 },
  { size: "XL", chest: 42, length: 27 },
  { size: "2XL", chest: 44, length: 28 },
  { size: "3XL", chest: 46, length: 29 },
  { size: "4XL", chest: 48, length: 30 },
  { size: "5XL", chest: 50, length: 31 },
  { size: "6XL", chest: 52, length: 32 },
];

// --- Component โบว์สีดำ (SVG) ---
const MourningRibbon = () => (
  <Box
    sx={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: 9999,
      pointerEvents: "none",
      width: { xs: 80, md: 120 },
      height: { xs: 80, md: 120 }
    }}
  >
    <img src="/ribbon.svg" alt="Mourning Ribbon" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.5))" }} />
  </Box>
);

// Component แสดงตารางไซส์ (แบบ Inline)
const SizeChart = () => (
  <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, bgcolor: "#fff", maxWidth: 400 }}>
    <Table size="small" sx={{ "& .MuiTableCell-root": { px: 1, py: 0.5, fontSize: "0.9rem" } }}>
      <TableHead>
        <TableRow sx={{ bgcolor: "#eee" }}>
          <TableCell align="center" sx={{ fontWeight: "bold" }}>Size</TableCell>
          <TableCell align="center" sx={{ fontWeight: "bold" }}>รอบอก (นิ้ว)</TableCell>
          <TableCell align="center" sx={{ fontWeight: "bold" }}>ความยาว (นิ้ว)</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {SIZE_CHART_DATA.map((r) => (
          <TableRow key={r.size}>
            <TableCell align="center" sx={{ fontWeight: "bold", color: "primary.main" }}>{r.size}</TableCell>
            <TableCell align="center">{r.chest}</TableCell>
            <TableCell align="center">{r.length}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <Typography variant="caption" display="block" sx={{ p: 1, textAlign: "center", bgcolor: "#fff8e1", color: "#f57f17" }}>
      * ขนาดอาจมีความคลาดเคลื่อน +/- 1 นิ้ว
    </Typography>
  </TableContainer>
);

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
  const [membershipOption, setMembershipOption] = useState(null); 
  const [cfToken, setCfToken] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", msg: "", type: "error" });
  
  // Review Dialog State
  const [reviewOpen, setReviewOpen] = useState(false);

  // Donation States
  const [wantToDonate, setWantToDonate] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [donationDate, setDonationDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [donationTime, setDonationTime] = useState(dayjs().format("HH:mm"));

  // Package Donation States
  const [wantPackage, setWantPackage] = useState(false);
  const [packageType, setPackageType] = useState("");
  const [packageSize, setPackageSize] = useState("");

  // Special Assistance State
  const [specialAssistance, setSpecialAssistance] = useState("");

  const ticketRef = useRef();

  useEffect(() => {
    setFetchingFields(true);
    listParticipantFields()
      .then((res) => setFields(res.data || res || []))
      .catch(() => setFields([]))
      .finally(() => setFetchingFields(false));
  }, []);

  // --- Logic จัดกลุ่มฟิลด์ ---
  const fieldGroups = useMemo(() => {
    const all = (fields || [])
      .filter(f => f?.enabled !== false)
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    
    const processed = all.map(f => ({
      ...f,
      _options: f.type === "select"
        ? (Array.isArray(f.options) ? f.options.map(o => {
            if (typeof o === "string") return { label: o, value: o };
            if (o && typeof o === "object") return { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" };
            return { label: String(o), value: String(o) };
          }) : [])
        : []
    }));

    // เรียงลำดับ: ชื่อ -> ชื่อเล่น -> ภาควิชา -> ปี
    const personalOrder = ['name', 'nickname', 'dept', 'date_year'];
    const personal = processed
        .filter(f => personalOrder.includes(f.name))
        .sort((a, b) => personalOrder.indexOf(a.name) - personalOrder.indexOf(b.name));
    
    const contact = processed.filter(f => ['phone', 'email'].includes(f.name));
    const address = processed.filter(f => ['usr_add', 'usr_add_post'].includes(f.name));
    const specifiedKeys = [...personalOrder, 'phone', 'email', 'usr_add', 'usr_add_post'];
    const others = processed.filter(f => !specifiedKeys.includes(f.name));

    return { personal, contact, address, others };
  }, [fields]);

  const handleInput = (e) => {
    const { name, value } = e.target;
    if (name === 'date_year') {
      const nums = value.replace(/[^\d]/g, '').slice(0, 4); 
      if (nums.length === 4 && parseInt(nums, 10) < 2400) {
        setErrors(prev => ({ ...prev, [name]: "กรุณากรอกปี พ.ศ. (เช่น 2569)" }));
      } else {
        setErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
      }
      setForm((f) => ({ ...f, [name]: nums })); 
      return;
    }
    
    // เคลียร์ error เมื่อเริ่มพิมพ์ใหม่
    if (errors[name]) {
        setErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
    }
    
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Function จัดการเมื่อเลือกแพ็กเกจ -> อัปเดตยอดเงินอัตโนมัติ
  const handlePackageChange = (e) => {
    const selectedLabel = e.target.value;
    setPackageType(selectedLabel);

    const foundPkg = PACKAGE_OPTIONS.find(p => p.label === selectedLabel);
    if (foundPkg) {
      setDonationAmount(foundPkg.price);
    }
  };

  // --- Step 1: ตรวจสอบข้อมูลเบื้องต้น ---
  const handleCheckInfo = (e) => {
    e.preventDefault();
    
    // 1. ตรวจสอบ Error ค้างเก่า (เช่น ปีการศึกษาผิด)
    if (Object.keys(errors).length > 0) return;

    // 2. ตรวจสอบ Required Fields (Dynamic)
    const missingFields = fields.filter(f => f.required && f.enabled && !form[f.name]);
    if (missingFields.length > 0) {
        const newErrors = {};
        missingFields.forEach(f => {
            newErrors[f.name] = `กรุณากรอก ${f.label}`;
        });
        setErrors(prev => ({ ...prev, ...newErrors }));
        
        setErrorDialog({ 
            open: true, 
            type: "warning", 
            title: "ข้อมูลไม่ครบถ้วน", 
            msg: `กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.map(f => f.label).join(", ")}` 
        });
        return;
    }

    // 3. ตรวจสอบ Membership
    if (!membershipOption) {
      setErrorDialog({ open: true, type: "warning", title: "กรุณาระบุข้อมูล", msg: "กรุณาเลือกสมาชิกสมาคมฯ ของท่าน" });
      return;
    }

    // 4. ตรวจสอบที่อยู่เฉพาะเมื่อเลือกสมัคร (1 หรือ 2)
    if (membershipOption !== 'none') {
        if (!form['usr_add'] || !form['usr_add_post']) {
             setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณากรอกที่อยู่และรหัสไปรษณีย์เพื่อประกอบการสมัครสมาชิก" });
             return;
        }
    }

    // 5. ตรวจสอบ Donation
    if (wantToDonate) {
      if (!donationAmount || parseFloat(donationAmount) <= 0) {
        setErrorDialog({ open: true, type: "error", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณาระบุจำนวนเงินที่ต้องการสนับสนุน" });
        return;
      }
      // ตรวจสอบ Package หากเลือก
      if (wantPackage) {
        if (!packageType || !packageSize) {
           setErrorDialog({ open: true, type: "warning", title: "ข้อมูลแพ็กเกจไม่ครบ", msg: "กรุณาเลือกรูปแบบแพ็กเกจและขนาดเสื้อ" });
           return;
        }
      }
    }

    setReviewOpen(true);
  };

  // --- Step 2: ยืนยันการลงทะเบียน ---
  const handleConfirmSubmit = () => {
    setReviewOpen(false);
    setPendingSubmit(true);
    executeTurnstile();
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
        // ✅ [Fix] ถ้าไม่สมัคร ให้ใส่ "-" อัตโนมัติ เพื่อไม่ให้ติด required หลังบ้าน
        if (membershipOption === 'none') {
          finalForm['usr_add'] = "-";
          finalForm['usr_add_post'] = "-";
        }

        const payload = { 
          ...finalForm, 
          followers: count, 
          cfToken, 
          consent: finalConsent,
          specialAssistance: specialAssistance.trim() // ส่งข้อมูลความช่วยเหลือพิเศษ
        };
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
                  source: "PRE_REGISTER",
                  // ส่งข้อมูลแพ็กเกจ
                  isPackage: wantPackage,
                  packageType: wantPackage ? packageType : "",
                  size: wantPackage ? packageSize : ""
                });
                successMessage += " และบันทึกข้อมูลการสนับสนุนเรียบร้อยแล้ว";
              } catch (donateErr) {
                console.error("Donation Error:", donateErr);
                successMessage += " (แต่บันทึกข้อมูลการสนับสนุนไม่สำเร็จ กรุณาติดต่อเจ้าหน้าที่)";
              }
        }

        setResult({ success: true, message: successMessage });
        setRegisteredParticipant(participant.data || participant);
        setForm({});
        setBringFollowers(false);
        setFollowersCount(0);
        setWantToDonate(false);
        setWantPackage(false); // Reset package state
        setPackageType("");
        setPackageSize("");
        setDonationAmount("");
        setSpecialAssistance(""); // Reset special assistance
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
        if (window.turnstile) try { window.turnstile.reset(); } catch {}
      } finally {
        setLoading(false);
        setPendingSubmit(false);
        setCfToken("");
      }
    };
    go();
    // eslint-disable-next-line
  }, [cfToken, pendingSubmit]);

  const savePdf = async () => { if (ticketRef.current) { const canvas = await html2canvas(ticketRef.current, { scale: 2, useCORS: true }); const imgData = canvas.toDataURL("image/png"); const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" }); const pageWidth = pdf.internal.pageSize.getWidth(); const imgWidth = 360; const imgHeight = (canvas.height * imgWidth) / canvas.width; const x = (pageWidth - imgWidth) / 2; const y = 60; pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight); pdf.save("E-Ticket.pdf"); }};
  const savePng = async () => { if (ticketRef.current) { const canvas = await html2canvas(ticketRef.current, { scale: 2, useCORS: true }); const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = "E-Ticket.png"; link.click(); }};
  
  const handleReset = () => {
    setForm({});
    setResult(null);
    setRegisteredParticipant(null);
    setBringFollowers(false);
    setFollowersCount(0);
    setWantToDonate(false);
    setWantPackage(false);
    setPackageType("");
    setPackageSize("");
    setDonationAmount("");
    setSpecialAssistance("");
    setMembershipOption(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 }, position: "relative" }}>
      
      <MourningRibbon />

      <Container maxWidth="sm">
        <Paper elevation={4} sx={{ p: { xs: 2.5, md: 3 }, mb: 3, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(227,242,253,.95) 100%)", boxShadow: "0 14px 36px rgba(255,193,7,0.25)", border: "1px solid rgba(255,193,7,.35)" }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <Avatar src="/logo.svg" alt="Logo" sx={{ width: 100, height: 100, bgcolor: "#fff", border: "2px solid rgba(255,193,7,.7)", boxShadow: "0 4px 12px rgba(255,193,7,.35)" }} />
            <Box>
              <Typography variant="h6" fontWeight={900} color="primary" sx={{ letterSpacing: .5, lineHeight: 1.3 }}>
                ลงทะเบียนล่วงหน้าเพื่อเข้าร่วมงานคืนเหย้า <br /> 
                "เสือเหลืองคืนถิ่น" <br /> 
                Atoms In Ground Stage 109
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.5 }}>
                <strong>สถานที่จัดงาน:</strong> ภายในคณะวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย <br />
                <strong>วันเสาร์ที่ 21 กุมภาพันธ์ 2569</strong> <br/>
                เวลา 17:00 - 22:00 น.
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {fetchingFields && <Box sx={{ mt: 2, textAlign: 'center' }}><CircularProgress color="warning" /></Box>}

        {!registeredParticipant && !fetchingFields && (
          <Box component="form" onSubmit={handleCheckInfo} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            
            {/* 1. ข้อมูลส่วนตัว */}
            <FormSection title="ข้อมูลส่วนตัว / การศึกษา" icon={<AccountCircleIcon />}>
              {fieldGroups.personal.map((field) => (
                <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
              ))}
              {fieldGroups.others.map((field) => (
                <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
              ))}
            </FormSection>

            {/* 2. ข้อมูลติดต่อ */}
            <FormSection title="ช่องทางติดต่อ" icon={<ContactPhoneIcon />}>
              {fieldGroups.contact.map((field) => (
                <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
              ))}
            </FormSection>

            {/* 3. ผู้ติดตาม */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fffdf7", border: "1px solid #ffe082" }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                <GroupAddIcon color="warning" />
                <Typography fontWeight={800} fontSize="1.1rem">ผู้ติดตาม</Typography>
                <Chip label="ไม่บังคับ" size="small" sx={{ ml: "auto", bgcolor: "#fff3e0", color: "#e65100", fontWeight: 600 }} />
              </Stack>
              <FormControlLabel 
                sx={{ ml: 0 }} 
                control={<Switch checked={bringFollowers} onChange={(e) => setBringFollowers(e.target.checked)} color="warning" />} 
                label={<Typography fontWeight={500}>{bringFollowers ? "มีผู้ติดตาม" : "ไม่มีผู้ติดตาม"}</Typography>} 
              />
              <Collapse in={bringFollowers}>
                <Box mt={1.5}>
                  <TextField 
                    type="number" label="จำนวนผู้ติดตาม (คน)" 
                    value={String(followersCount ?? "")} 
                    onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ""); setFollowersCount(raw === "" ? 0 : parseInt(raw, 10)); }} 
                    fullWidth 
                    inputProps={{ style: { fontSize: '1.2rem', textAlign: 'center', fontWeight: 'bold' } }}
                    sx={{ bgcolor: '#fff' }}
                  />
                </Box>
              </Collapse>
            </Paper>

            {/* 4. Donation */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: wantToDonate ? "#e8f5e9" : "#f1f8e9", borderColor: wantToDonate ? "#66bb6a" : "#c5e1a5", transition: "all 0.3s" }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                <VolunteerActivismIcon color="success" />
                <Typography fontWeight={800} fontSize="1.1rem" color="success.dark">ร่วมสนับสนุนกิจกรรม</Typography>
                <Chip label="Optional" size="small" color="success" variant="outlined" sx={{ ml: "auto" }} />
              </Stack>
              <FormControlLabel 
                sx={{ ml: 0 }} 
                control={<Switch checked={wantToDonate} onChange={(e) => setWantToDonate(e.target.checked)} color="success" />} 
                label={<Typography fontWeight={500}>{wantToDonate ? "ต้องการสนับสนุน" : "ไม่ประสงค์จะสนับสนุน"}</Typography>} 
              />
              <Collapse in={wantToDonate}>
                <Box sx={{ mt: 2, p: 2, bgcolor: "#fff", borderRadius: 2, border: "1px dashed #81c784" }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom align="center">
                    สแกน QR Code ด้านล่างเพื่อโอนเงินสนับสนุน
                  </Typography>
                  <Stack alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{ width: 160, height: 160, bgcolor: "#eee", borderRadius: 2, overflow: 'hidden' }}>
                        <img src="/donate.png" alt="QR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </Box>
                    <Typography variant="caption" sx={{ mt: 1, fontWeight: 600 }}>ชื่อบัญชี: น.ส.เสาวดี อิสริยะโอภาส และ นางนภาภรณ์ ลาชโรจน์</Typography>
                    <Typography variant="caption" sx={{ mt: 1, fontWeight: 600 }}>ธนาคารกสิกรไทย</Typography>
                    <Typography variant="caption" sx={{ mt: 1, fontWeight: 600 }}>เลขที่บัญชี: 211-8-76814-3</Typography>
                  </Stack>
                  <Grid container spacing={2}>
                    <Grid item xs={12}><TextField label="จำนวนเงินที่โอน (บาท)" type="number" fullWidth value={donationAmount} onChange={e => setDonationAmount(e.target.value)} size="small" /></Grid>
                    <Grid item xs={6}><TextField label="วันที่โอน" type="date" fullWidth value={donationDate} onChange={e => setDonationDate(e.target.value)} InputLabelProps={{ shrink: true }} size="small" /></Grid>
                    <Grid item xs={6}><TextField label="เวลาที่โอน" type="time" fullWidth value={donationTime} onChange={e => setDonationTime(e.target.value)} InputLabelProps={{ shrink: true }} size="small" /></Grid>
                  </Grid>

                  {/* 4.1 Donation Package Selection */}
                  <Divider sx={{ my: 2, borderStyle: 'dashed' }} />
                  <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                    <CardGiftcardIcon color="secondary" />
                    <Typography fontWeight={700} color="secondary.dark">รับของที่ระลึก (Package)</Typography>
                  </Stack>
                  <FormControlLabel 
                    control={<Switch checked={wantPackage} onChange={(e) => setWantPackage(e.target.checked)} color="secondary" />} 
                    label={<Typography variant="body2">{wantPackage ? "ต้องการรับของที่ระลึก" : "ไม่รับของที่ระลึก (บริจาคทั่วไป)"}</Typography>} 
                  />
                  <Collapse in={wantPackage}>
                    <Box sx={{ mt: 1.5, p: 2, bgcolor: "#f3e5f5", borderRadius: 2 }}>
                      <Stack spacing={2}>
                        <TextField 
                          select 
                          label="เลือกรูปแบบ Package" 
                          fullWidth 
                          value={packageType} 
                          onChange={handlePackageChange} 
                          size="small"
                          sx={{ bgcolor: '#fff' }}
                        >
                          {PACKAGE_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.label} sx={{ whiteSpace: 'normal', py: 1 }}>
                                {opt.label}
                            </MenuItem>
                          ))}
                        </TextField>
                        
                        <Stack spacing={2}>
                            <TextField 
                              select 
                              label="เลือกขนาดเสื้อ (Size)" 
                              fullWidth 
                              value={packageSize} 
                              onChange={(e) => setPackageSize(e.target.value)} 
                              size="small"
                              sx={{ bgcolor: '#fff' }}
                            >
                               {SIZE_OPTIONS.map((s) => (
                                <MenuItem key={s} value={s}>{s}</MenuItem>
                               ))}
                            </TextField>
                            
                            {/* ตารางไซส์ */}
                            <SizeChart />
                        </Stack>

                      </Stack>
                    </Box>
                  </Collapse>
                </Box>
              </Collapse>
            </Paper>

            {/* 5. สมาชิกสมาคม */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#e3f2fd", border: "1px solid #90caf9" }}>
               <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <SecurityIcon color="primary" />
                  <Typography fontWeight={800} fontSize="1.1rem" color="#1565c0">สมาชิกสมาคมฯ <span style={{color:'red'}}>*</span></Typography>
               </Stack>
               <FormControl component="fieldset" sx={{ width: '100%' }}>
                <RadioGroup name="membershipOption" value={membershipOption} onChange={(e) => setMembershipOption(e.target.value)}>
                  <OptionCard 
                    value="existing" 
                    selected={membershipOption === 'existing'} 
                    label={
                        <Box>
                            <Typography fontWeight={600} sx={{ lineHeight: 1.4 }}>เป็นสมาชิกสมาคมฯ อยู่แล้ว และยินยอมอัปเดตข้อมูลสมาชิกฯ</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.85rem' }}>
                                (กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วนเพื่อประกอบการสมัคร ทีมงานจะบันทึกข้อมูลลงฐานข้อมูลสมาชิกสมาคมฯ หลังจบงาน)
                            </Typography>
                        </Box>
                    }
                  />
                  <OptionCard 
                    value="new" 
                    selected={membershipOption === 'new'}
                    label={
                      <Box>
                        <Typography fontWeight={600} sx={{ lineHeight: 1.4 }}>สมัครสมาชิกสมาคมฯ</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.85rem' }}>
                          (สมัครฟรีไม่มีค่าใช้จ่าย กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วนเพื่อประกอบการสมัคร ทีมงานจะบันทึกข้อมูลลงฐานข้อมูลสมาชิกสมาคมฯ หลังจบงาน)
                        </Typography>
                      </Box>
                    } 
                  />
                  <OptionCard value="none" label="ไม่ประสงค์สมัครสมาชิกสมาคมฯ" selected={membershipOption === 'none'} />
                </RadioGroup>
              </FormControl>
              <Collapse in={membershipOption === 'existing' || membershipOption === 'new'}>
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #90caf9' }}>
                    <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                        <HomeIcon color="primary" />
                        <Typography variant="subtitle1" fontWeight={700} color="#1565c0">ข้อมูลการติดต่อ (สำหรับสมาชิก)</Typography>
                    </Stack>
                    <Stack spacing={2}>
                        {fieldGroups.address.map((field) => (
                            <FieldInput 
                                key={field.name} 
                                field={{...field, required: true}}
                                value={form[field.name] ?? ""} 
                                onChange={handleInput} 
                                errorText={errors[field.name]} 
                            />
                        ))}
                    </Stack>
                </Box>
              </Collapse>
            </Paper>

            {/* 6. Special Assistance (เพิ่มใหม่) */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#ffebee", border: "1px solid #ef9a9a" }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                <AccessibleIcon color="error" />
                <Typography fontWeight={800} fontSize="1.1rem" color="#c62828">ความช่วยเหลือพิเศษ</Typography>
              </Stack>
              <TextField 
                multiline
                rows={2}
                label="ท่านต้องการความช่วยเหลืออะไรพิเศษไหม? (ถ้ามี)"
                placeholder="เช่น ต้องการรถเข็น, แพ้อาหาร, หรืออื่นๆ"
                fullWidth
                value={specialAssistance}
                onChange={(e) => setSpecialAssistance(e.target.value)}
                sx={{ bgcolor: "#fff" }}
              />
            </Paper>

            {/* 7. หมายเหตุ PDPA */}
            <Alert severity="info" icon={<InfoIcon />} sx={{ bgcolor: "#e1f5fe", color: "#01579b", borderRadius: 2, "& .MuiAlert-icon": { color: "#0288d1" } }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    <strong>หมายเหตุ:</strong> ภายในงานจะมีการบันทึกภาพและวิดีโอ เพื่อใช้ในการประชาสัมพันธ์กิจกรรมของสมาคมนิสิตเก่าวิทยาศาสตร์ฯ
                </Typography>
            </Alert>

            <Turnstile invisible onVerify={(t) => setCfToken(t)} onError={() => setCfToken("")} options={{ action: "pre_register" }} />
            
            {result && <Alert severity="success" iconMapping={{ success: <CheckCircleIcon fontSize="inherit" /> }} sx={{ fontWeight: 600, borderRadius: 2 }}>{result.message}</Alert>}

            {/* ปุ่มกดตรวจสอบข้อมูล */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={1}>
              <Button type="submit" variant="contained" color="warning" size="large" disabled={loading || Object.keys(errors).length > 0} fullWidth sx={{ py: 1.5, borderRadius: 3, fontSize: '1rem', fontWeight: 800, boxShadow: "0 6px 20px rgba(255,193,7,.4)" }} startIcon={loading ? <CircularProgress size={24} color="inherit" /> : <FactCheckIcon fontSize="large" />}>
                {loading ? "กำลังประมวลผล..." : "ตรวจสอบข้อมูลการลงทะเบียน"}
              </Button>
              <Button type="button" variant="text" color="inherit" fullWidth onClick={handleReset} startIcon={<RestartAltIcon />}>เริ่มใหม่</Button>
            </Stack>

          </Box>
        )}
        
        {/* Review Dialog */}
        <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle sx={{ bgcolor: '#fff3e0', borderBottom: '1px solid #ffe0b2' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <FactCheckIcon color="warning" />
                    <Typography variant="h7" fontWeight={500}>ตรวจสอบข้อมูลลงทะเบียน</Typography>
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant="subtitle2" color="text.secondary">กรุณาตรวจสอบข้อมูลของท่านก่อนยืนยัน</Typography>
                    
                    <InfoRow label="ชื่อ-นามสกุล" value={form.name} />
                    <InfoRow label="ชื่อเล่น" value={form.nickname} />
                    <InfoRow label="ภาควิชา" value={form.dept} />
                    <InfoRow label="ปีที่เข้าศึกษา (พ.ศ.)" value={form.date_year} />
                    <InfoRow label="เบอร์โทรศัพท์" value={form.phone} />
                    
                    {membershipOption !== 'none' && (
                        <Box sx={{ p: 1.5, bgcolor: "#f5f5f5", borderRadius: 2 }}>
                            <Typography variant="caption" fontWeight={700} color="primary">ที่อยู่สำหรับจัดส่ง:</Typography>
                            <Typography variant="body2">{form.usr_add} {form.usr_add_post}</Typography>
                        </Box>
                    )}

                    <Divider />
                    <InfoRow label="สถานะสมาชิก" value={membershipOption === 'existing' ? 'สมาชิกเดิม (อัปเดต)' : membershipOption === 'new' ? 'สมัครสมาชิกใหม่' : 'ไม่ประสงค์สมัคร'} />
                    <InfoRow label="ผู้ติดตาม" value={bringFollowers ? `${followersCount} คน` : "ไม่มี"} />
                    {wantToDonate && (
                        <>
                          <InfoRow label="ยอดบริจาค" value={`${donationAmount} บาท`} />
                          {wantPackage && (
                            <Box sx={{ mt: 1, p: 1, border: '1px dashed #ccc', borderRadius: 1 }}>
                              <Typography variant="caption" fontWeight="bold">ของที่ระลึก:</Typography>
                              <Typography variant="body2">{packageType} ({packageSize})</Typography>
                            </Box>
                          )}
                        </>
                    )}
                    {specialAssistance && (
                        <InfoRow label="ความช่วยเหลือพิเศษ" value={specialAssistance} />
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => setReviewOpen(false)} color="inherit">แก้ไขข้อมูล</Button>
                <Button onClick={handleConfirmSubmit} variant="contained" color="success" size="large" sx={{ borderRadius: 2, px: 3, fontWeight: 700 }} startIcon={<CheckCircleIcon />}>
                    ยืนยันและลงทะเบียน
                </Button>
            </DialogActions>
        </Dialog>

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

        <Dialog open={errorDialog.open} onClose={() => setErrorDialog({ ...errorDialog, open: false })} PaperProps={{ sx: { borderRadius: 4, p: 1, maxWidth: 360, textAlign: 'center', borderTop: errorDialog.type === 'security' ? '6px solid #FF3B30' : '6px solid #FF9800' } }}>
          <DialogContent>
            <Stack alignItems="center" spacing={2}>
              <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: errorDialog.type === 'security' ? '#FFEBEE' : '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {errorDialog.type === 'security' ? <SecurityIcon sx={{ fontSize: 36, color: '#D32F2F' }} /> : <WarningIcon sx={{ fontSize: 36, color: '#EF6C00' }} />}
              </Box>
              <Typography variant="h6" fontWeight={800}>{errorDialog.title}</Typography>
              <Typography variant="body2">{errorDialog.msg}</Typography>
              <Button variant="contained" color={errorDialog.type === 'security' ? 'error' : 'warning'} fullWidth onClick={() => setErrorDialog({ ...errorDialog, open: false })}>ตกลง</Button>
            </Stack>
          </DialogContent>
        </Dialog>
      </Container>
    </Box>
  );
}

// --- Helper Components ---

function FormSection({ title, icon, children }) {
    return (
        <Card variant="outlined" sx={{ borderRadius: 3, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <Box sx={{ bgcolor: '#fff3e0', px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #ffe0b2' }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>{icon}</Avatar>
                <Typography variant="subtitle1" fontWeight={800} color="#5d4037">{title}</Typography>
            </Box>
            <CardContent sx={{ p: 2.5 }}>
                <Stack spacing={2.5}>{children}</Stack>
            </CardContent>
        </Card>
    );
}

function OptionCard({ value, label, selected }) {
  return (
    <Paper variant="outlined" sx={{ mb: 1.5, p: 0, borderRadius: 2, border: selected ? "2px solid #1976d2" : "1px solid #e0e0e0", bgcolor: selected ? "#f0f7ff" : "#fff", transition: "all 0.2s", "&:hover": { borderColor: "#90caf9" } }}>
      <FormControlLabel value={value} control={<Radio sx={{ ml: 1 }} />} label={<Box sx={{ py: 1.5, pr: 1 }}>{label}</Box>} sx={{ width: '100%', m: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { width: '100%' }, '& .MuiRadio-root': { mt: 0.5 } }} />
    </Paper>
  );
}

function FieldInput({ field, value, onChange, errorText }) {
  const commonSx = {
    "& .MuiOutlinedInput-root": { borderRadius: 2.5, bgcolor: "#fff", fontSize: "1.1rem", "& fieldset": { borderColor: "#bdbdbd", borderWidth: 1 }, "&.Mui-focused fieldset": { borderColor: "#ff9800", borderWidth: 2 } },
    "& .MuiInputLabel-root": { fontSize: "1.05rem" }
  };

  if (field.name === 'date_year') {
    return (
        <TextField name={field.name} label={field.label} value={value} onChange={onChange} required={!!field.required} fullWidth placeholder="25XX" error={!!errorText} helperText={errorText || "กรุณากรอกปี พ.ศ. 4 หลัก"}
            InputProps={{ startAdornment: <InputAdornment position="start"><EventIcon color="action" /></InputAdornment>, style: { fontSize: '1.4rem', letterSpacing: '0.25em', fontWeight: 'bold', textAlign: 'center' } }}
            inputProps={{ maxLength: 4, inputMode: "numeric", style: { textAlign: 'center' } }} sx={commonSx} />
    );
  }

  if (field.type === "select") {
    return (
      <TextField select name={field.name} label={field.label} value={value} onChange={onChange} required={!!field.required} fullWidth helperText={field.required ? "" : "(ไม่บังคับ)"} SelectProps={{ displayEmpty: true }} sx={commonSx} InputProps={{ startAdornment: field.name === 'dept' ? <InputAdornment position="start"><SchoolIcon color="action"/></InputAdornment> : null }}>
        <MenuItem value="" disabled><em>— กรุณาเลือก —</em></MenuItem>
        {field._options.map((opt) => (<MenuItem key={`${field.name}-${opt.value}`} value={opt.value} sx={{ py: 1.5, fontSize: '1.1rem' }}>{opt.label}</MenuItem>))}
      </TextField>
    );
  }

  const inputType = field.type === "email" ? "email" : field.type === "number" ? "text" : field.type === "date" ? "date" : "text";
  return (
    <TextField name={field.name} type={inputType} label={field.label} value={value} onChange={onChange} required={!!field.required} fullWidth error={!!errorText} helperText={errorText || (field.required ? "" : "(ไม่บังคับ)")} sx={commonSx} InputLabelProps={inputType === "date" ? { shrink: true } : undefined} autoComplete="off" inputProps={{ inputMode: field.type === 'number' ? 'numeric' : 'text', pattern: field.type === 'number' ? "[0-9]*" : undefined }} />
  );
}

function InfoRow({ label, value }) { return (<Stack direction="row" justifyContent="center" spacing={1} sx={{ mb: .5 }}><Typography sx={{ fontWeight: 700 }}>{label}:</Typography><Typography>{value || "-"}</Typography></Stack>); }
function pickField(participant, keys) { const f = participant?.fields || {}; for (const k of keys) { if (f[k] != null && String(f[k]).trim() !== "") return f[k]; } return ""; }