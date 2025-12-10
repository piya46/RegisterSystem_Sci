// frontend/src/pages/PreRegistrationPage.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, TextField, MenuItem,
  Button, Avatar, Divider, Collapse, FormControlLabel, Switch,
  Alert, CircularProgress, Tooltip, Chip, Card, CardContent,
  Dialog, DialogContent, DialogTitle, DialogActions, Grid, Radio, RadioGroup, FormControl, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Snackbar, IconButton
} from "@mui/material";

// Icons
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
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import AccessibleIcon from '@mui/icons-material/Accessible';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FavoriteIcon from '@mui/icons-material/Favorite'; // เพิ่ม Icon หัวใจ

// Icons ใหม่สำหรับ Ticket
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import WheelchairPickupIcon from '@mui/icons-material/WheelchairPickup';

// Libraries
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import { listParticipantFields, createParticipant, createDonation } from "../utils/api";
import dayjs from "dayjs";
import Turnstile from "../components/Turnstile";

// Animation & Effects
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';

// --- Configuration Constants ---
const PACKAGE_OPTIONS = [
  { price: 2000, value: "package_1", label: "สนับสนุนเงิน 2,000 บาท รับเสื้องานคืนเหย้า POLO สีน้ำเงิน (คอปก) 1 ตัว และ ตุ๊กตาเสือเหลือง_ผ้านุ่ม (ขนาด 12 นิ้ว) 1 ตัว" },
  { price: 2000, value: "package_2", label: "สนับสนุนเงิน 2,000 บาท รับเสื้องานคืนเหย้า POLO สีชมพู (คอปก) 1 ตัว และ ตุ๊กตาเสือเหลือง_ผ้านุ่ม (ขนาด 12 นิ้ว) 1 ตัว" },
  { price: 1500, value: "package_3", label: "สนับสนุนเงิน 1,500 บาท รับเสื้องานคืนเหย้า T-shirt สีเหลือง (คอกลม) 1 ตัว และ พวงกุญแจเสือเหลือง (ขนาด 5 นิ้ว) 1 ตัว" },
  { price: 1200, value: "package_4", label: "สนับสนุนเงิน 1,200 บาท รับเสื้องานคืนเหย้า T-shirt สีเหลือง (คอกลม) 1 ตัว" }
];
const SIZE_OPTIONS = ["SS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL","6XL","7XL"];

// ตัวเลือกความช่วยเหลือพิเศษ
const ASSISTANCE_TAGS = [
    { label: "ใช้วีลแชร์/รถเข็น", icon: <WheelchairPickupIcon fontSize="small"/> },
    { label: "ไม้เท้าพยุงเดิน", icon: <AccessibleIcon fontSize="small"/> },
    { label: "อาหารฮาลาล", icon: <RestaurantIcon fontSize="small"/> },
    { label: "อาหารมังสวิรัติ", icon: <RestaurantIcon fontSize="small"/> },
    { label: "แพ้อาหารทะเล", icon: <WarningIcon fontSize="small"/> },
    { label: "แพ้ถั่ว", icon: <WarningIcon fontSize="small"/> }
];

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

const MourningRibbon = () => (
  <Box sx={{ position: "absolute", top: 0, left: 0, zIndex: 9999, pointerEvents: "none", width: { xs: 80, md: 120 }, height: { xs: 80, md: 120 } }}>
    <img src="/ribbon.svg" alt="Mourning Ribbon" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.5))" }} />
  </Box>
);

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

  const [bringFollowers, setBringFollowers] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [membershipOption, setMembershipOption] = useState(null); 
  const [cfToken, setCfToken] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", msg: "", type: "error" });
  
  const [reviewOpen, setReviewOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Donation States
  const [wantToDonate, setWantToDonate] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [donationDate, setDonationDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [donationTime, setDonationTime] = useState("");

  // Package Donation States
  const [wantPackage, setWantPackage] = useState(false); // true = Package, false = General
  const [packageType, setPackageType] = useState("");
  const [packageSize, setPackageSize] = useState("");

  const [specialAssistance, setSpecialAssistance] = useState("");
  const [selectedAssistTags, setSelectedAssistTags] = useState([]);

  const ticketRef = useRef();
  const turnstileRef = useRef();

  useEffect(() => {
    setFetchingFields(true);
    listParticipantFields()
      .then((res) => setFields(res.data || res || []))
      .catch(() => setFields([]))
      .finally(() => setFetchingFields(false));
  }, []);

  const fieldGroups = useMemo(() => {
    const all = (fields || []).filter(f => f?.enabled !== false).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const processed = all.map(f => ({
      ...f,
      _options: f.type === "select" ? (Array.isArray(f.options) ? f.options.map(o => {
            if (typeof o === "string") return { label: o, value: o };
            if (o && typeof o === "object") return { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" };
            return { label: String(o), value: String(o) };
          }) : []) : []
    }));
    const personalOrder = ['name', 'nickname', 'dept', 'date_year'];
    const personal = processed.filter(f => personalOrder.includes(f.name)).sort((a, b) => personalOrder.indexOf(a.name) - personalOrder.indexOf(b.name));
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
    if (errors[name]) {
        setErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleAssistTagToggle = (label) => {
    if (selectedAssistTags.includes(label)) {
        setSelectedAssistTags(prev => prev.filter(t => t !== label));
    } else {
        setSelectedAssistTags(prev => [...prev, label]);
    }
  };

  const handleCopyAccount = () => {
    navigator.clipboard.writeText("2118768143");
    setSnackbarOpen(true);
  };

  // เปลี่ยนโหมดการบริจาค (ทั่วไป vs Package)
  const handleDonationModeChange = (e) => {
    const mode = e.target.value;
    
    if (mode === 'general') {
      setWantPackage(false);
      setPackageType('general'); 
    } else {
      setWantPackage(true);
      setPackageType('');
      setPackageSize('');
      setDonationAmount(""); 
    }
  };

  // เลือก Package เจาะจง
  const handleSpecificPackageChange = (e) => {
    const val = e.target.value;
    setPackageType(val);

    const foundPkg = PACKAGE_OPTIONS.find(p => p.value === val);
    if (foundPkg) {
        setDonationAmount(foundPkg.price);
    }
  };

  const handleCheckInfo = (e) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) return;

    const missingFields = fields.filter(f => f.required && f.enabled && !form[f.name]);
    if (missingFields.length > 0) {
        const newErrors = {};
        missingFields.forEach(f => {
            newErrors[f.name] = `กรุณากรอก ${f.label}`;
        });
        setErrors(prev => ({ ...prev, ...newErrors }));
        setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: `กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.map(f => f.label).join(", ")}` });
        return;
    }

    if (!membershipOption) {
      setErrorDialog({ open: true, type: "warning", title: "กรุณาระบุข้อมูล", msg: "กรุณาเลือกสมาชิกสมาคมฯ ของท่าน" });
      return;
    }

    if (membershipOption !== 'none') {
        if (!form['usr_add'] || !form['usr_add_post']) {
             setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณากรอกที่อยู่และรหัสไปรษณีย์เพื่อประกอบการสมัครสมาชิก" });
             return;
        }
    }

    if (wantToDonate) {
      if (!donationAmount || parseFloat(donationAmount) <= 0) {
        setErrorDialog({ open: true, type: "error", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณาระบุจำนวนเงินที่ต้องการสนับสนุน" });
        return;
      }
      
      if (!packageType) {
         setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณาเลือกรูปแบบการสนับสนุน (รับของที่ระลึก หรือ สนับสนุนการจัดงาน)" });
         return;
      }

      if (wantPackage) {
        if (!packageType) {
            setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณาเลือก Package ที่ต้องการ" });
            return;
        }
        if (!packageSize) {
           setErrorDialog({ open: true, type: "warning", title: "ข้อมูลแพ็กเกจไม่ครบ", msg: "กรุณาเลือกขนาดเสื้อ" });
           return;
        }
        const selectedPkg = PACKAGE_OPTIONS.find(p => p.value === packageType);
        if (selectedPkg && parseFloat(donationAmount) < selectedPkg.price) {
           setErrorDialog({ 
               open: true, 
               type: "warning", 
               title: "ยอดเงินไม่เพียงพอ", 
               msg: `แพ็กเกจที่ท่านเลือกมียอดสนับสนุนขั้นต่ำ ${selectedPkg.price.toLocaleString()} บาท กรุณาตรวจสอบยอดเงิน` 
           });
           return;
        }
      }
    }

    setReviewOpen(true);
  };

  const handleConfirmSubmit = () => {
    setReviewOpen(false);
    setPendingSubmit(true);
    turnstileRef.current?.execute();
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
        if (membershipOption === 'none') {
          finalForm['usr_add'] = "-";
          finalForm['usr_add_post'] = "-";
        }
        const combinedAssistance = [...selectedAssistTags, specialAssistance.trim()].filter(Boolean).join(", ");
        const payload = { ...finalForm, followers: count, cfToken, consent: finalConsent, specialAssistance: combinedAssistance };
        const participant = await createParticipant(payload);
        
        let successMessage = "ลงทะเบียนล่วงหน้าสำเร็จ!";

        if (wantToDonate && donationAmount && parseFloat(donationAmount) > 0) {
            try {
                const fullName = form.name || form.fullName || "- -";
                const nameParts = fullName.trim().split(" ");
                const firstName = nameParts[0] || "-";
                const lastName = nameParts.slice(1).join(" ") || "-";
                const transferDateTime = new Date(`${donationDate}T${donationTime || '00:00'}`);
    
                let finalPackageType = "";
                if (wantPackage) {
                    const pkgObj = PACKAGE_OPTIONS.find(p => p.value === packageType);
                    finalPackageType = pkgObj ? pkgObj.label : packageType;
                }

                await createDonation({
                  userId: null,
                  firstName,
                  lastName,
                  amount: parseFloat(donationAmount),
                  transferDateTime,
                  source: "PRE_REGISTER",
                  isPackage: wantPackage,
                  packageType: finalPackageType,
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
        setWantPackage(false);
        setPackageType("");
        setPackageSize("");
        setDonationAmount("");
        setDonationTime("");
        setSpecialAssistance("");
        setSelectedAssistTags([]);
        setMembershipOption(null);
        setErrors({});
      } catch (err) {
        const errorMsg = err?.response?.data?.error || "เกิดข้อผิดพลาด";
        const isSecurity = errorMsg.includes("Security") || errorMsg.includes("Turnstile");
        setErrorDialog({ open: true, type: isSecurity ? "security" : "error", title: isSecurity ? "Security Check Failed" : "Registration Failed", msg: isSecurity ? "ระบบไม่สามารถยืนยันตัวตนของคุณได้ กรุณาลองใหม่อีกครั้ง" : errorMsg });
        turnstileRef.current?.reset();
      } finally {
        setLoading(false);
        setPendingSubmit(false);
        setCfToken("");
      }
    };
    go();
  }, [cfToken, pendingSubmit]);

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
    setDonationTime(""); 
    setSpecialAssistance("");
    setSelectedAssistTags([]);
    setMembershipOption(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function pickField(participant, keys) { const f = participant?.fields || {}; for (const k of keys) { if (f[k] != null && String(f[k]).trim() !== "") return f[k]; } return "-"; }

  if (registeredParticipant) {
     return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa", position: 'relative', overflowX: 'hidden' }}>
        <MourningRibbon />
        <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={350} gravity={0.15} />
        <Container maxWidth="sm" sx={{ mt: 6, mb: 8, position: 'relative', zIndex: 10 }}>
          <Box textAlign="center" mb={4}>
             <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
               <CheckCircleIcon color="success" sx={{ fontSize: 72, mb: 1, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }} />
             </motion.div>
            <Typography variant="h4" gutterBottom fontWeight="900" color="primary.main" sx={{ letterSpacing: 0.5 }}>ลงทะเบียนสำเร็จ!</Typography>
            <Typography variant="body1" color="text.secondary">ยินดีต้อนรับเข้าสู่งาน กรุณาบันทึกบัตรเข้าร่วมงานด้านล่างเพื่อใช้เข้างาน</Typography>
          </Box>
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} whileHover={{ y: -8, transition: { duration: 0.2 } }} style={{ perspective: 1000 }}>
            <Card ref={ticketRef} elevation={8} sx={{ borderRadius: 4, overflow: 'hidden', background: '#fff', position: 'relative', backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(239, 246, 255, 0.8) 0%, rgba(255, 255, 255, 0.8) 90%)' }}>
              <Box sx={{ background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: 'white', p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '4px solid #FFD700' }}>
                 <Box display="flex" alignItems="center" gap={1.5}><ConfirmationNumberIcon sx={{ color: '#FFD700', fontSize: 32 }} /><Typography variant="h6" fontWeight="bold" sx={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>บัตรเข้าร่วมงาน</Typography></Box>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontFamily: 'monospace', fontSize: '0.9rem' }}>#{registeredParticipant?.qrCode?.slice(0,8) || "REF-ID"}</Typography>
              </Box>
              <CardContent sx={{ p: 3 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={5} display="flex" flexDirection="column" alignItems="center" justifyContent="center">
                     <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid #e0e0e0' }}>
                        <QRCodeSVG value={registeredParticipant?.qrCode || registeredParticipant?._id || "no-code"} size={140} level={"H"} includeMargin={true} />
                     </Box>
                     <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, fontWeight: 500 }}>สแกน QR Code นี้หน้างาน</Typography>
                  </Grid>
                  <Grid item xs={12} sm={7}>
                     <Box ml={{ sm: 1 }} textAlign={{ xs: 'center', sm: 'left' }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom display="flex" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} gap={0.5}><PersonIcon fontSize="small" color="primary" /> ชื่อผู้เข้าร่วม</Typography>
                        <Typography variant="h5" fontWeight="800" color="text.primary" gutterBottom sx={{ mb: 2, lineHeight: 1.2 }}>{pickField(registeredParticipant, ["name", "fullName", "fullname"])}</Typography>
                        <Divider sx={{ my: 2, borderStyle: 'dashed' }} />
                        <Stack spacing={1.5}>
                             <Box display="flex" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} gap={1}><BadgeIcon fontSize="small" color="action" /><Box><Typography variant="caption" color="text.secondary">รุ่นปี</Typography><Typography variant="body2" fontWeight="bold">{pickField(registeredParticipant, ["date_year", "year"])}</Typography></Box></Box>
                             <Box display="flex" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} gap={1}><ApartmentIcon fontSize="small" color="action"/><Box><Typography variant="caption" color="text.secondary">ภาควิชา</Typography><Typography variant="body2" fontWeight="bold">{pickField(registeredParticipant, ["dept", "department"])}</Typography></Box></Box>
                        </Stack>
                     </Box>
                  </Grid>
                </Grid>
              </CardContent>
              <Box sx={{ height: 12, background: 'linear-gradient(90deg, #FFD700 0%, #FF8C00 100%)' }} />
            </Card>
          </motion.div>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" mt={5}>
            <Button variant="contained" color="primary" size="large" startIcon={<DownloadIcon />} onClick={savePng} sx={{ borderRadius: 3, px: 4, py: 1.2, fontWeight: 'bold', boxShadow: '0 8px 20px rgba(30, 60, 114, 0.25)', fontSize: '1rem' }}>บันทึกเป็นรูปภาพ</Button>
            <Button variant="outlined" color="inherit" size="large" startIcon={<RestartAltIcon />} onClick={handleReset} sx={{ borderRadius: 3, px: 3, borderColor: '#999', color: '#555', "&:hover": { borderColor: '#333', bgcolor: '#f0f0f0' } }}>ลงทะเบียนท่านอื่นต่อ</Button>
          </Stack>
        </Container>
      </Box>
    );
  }

  // ==========================================
  // Form Section
  // ==========================================
  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 }, position: "relative" }}>
      
      <MourningRibbon />

      <Container maxWidth="sm">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
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
        </motion.div>

        {fetchingFields && <Box sx={{ mt: 2, textAlign: 'center' }}><CircularProgress color="warning" /></Box>}

        {!fetchingFields && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <Box component="form" onSubmit={handleCheckInfo} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            
            <FormSection title="ข้อมูลส่วนตัว / การศึกษา" icon={<AccountCircleIcon />}>
              {fieldGroups.personal.map((field) => (
                <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
              ))}
              {fieldGroups.others.map((field) => (
                <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
              ))}
            </FormSection>

            <FormSection title="ช่องทางติดต่อ" icon={<ContactPhoneIcon />}>
              {fieldGroups.contact.map((field) => (
                <FieldInput key={field.name} field={field} value={form[field.name] ?? ""} onChange={handleInput} errorText={errors[field.name]} />
              ))}
            </FormSection>

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

            {/* Donation Section (Updated UI) */}
            <Paper 
                variant="elevation" 
                elevation={3}
                sx={{ 
                    p: 3, 
                    borderRadius: 4, 
                    background: wantToDonate ? "linear-gradient(135deg, #e8f5e9 0%, #ffffff 100%)" : "#f9f9f9",
                    border: wantToDonate ? "2px solid #66bb6a" : "1px solid #e0e0e0",
                    transition: "all 0.3s ease-in-out"
                }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{ p: 1, borderRadius: '50%', bgcolor: wantToDonate ? '#4caf50' : '#bdbdbd', color: '#fff' }}>
                        <VolunteerActivismIcon />
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight={800} color={wantToDonate ? "success.dark" : "text.secondary"}>
                            ร่วมสนับสนุนกิจกรรม
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            สมทบทุนจัดงานคืนสู่เหย้าชาววิทยาฯ
                        </Typography>
                    </Box>
                  </Stack>
                  <Switch checked={wantToDonate} onChange={(e) => setWantToDonate(e.target.checked)} color="success" />
              </Stack>

              <Collapse in={wantToDonate}>
                <Box sx={{ mt: 3 }}>
                  
                  {/* [แก้ไขใหม่] ส่วนเลือกรูปแบบการสนับสนุน (สวยงามขึ้น) */}
                  <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mb: 1.5, color: '#37474f' }}>
                      ท่านต้องการสนับสนุนรูปแบบใด <span style={{color:'red'}}>*</span>
                  </Typography>
                  
                  <FormControl component="fieldset" fullWidth sx={{ mb: 3 }}>
                        <RadioGroup 
                            row 
                            value={wantPackage ? 'package' : 'general'} 
                            onChange={handleDonationModeChange}
                        >
                            <Grid container spacing={2}>
                                {/* ตัวเลือก: สนับสนุนการจัดงาน (เดิมคือ บริจาคทั่วไป) */}
                                <Grid item xs={12} sm={6}>
                                    <Paper 
                                        variant="outlined" 
                                        elevation={0}
                                        sx={{ 
                                            position: 'relative',
                                            p: 2, 
                                            border: !wantPackage ? '2px solid #00c853' : '1px solid #e0e0e0',
                                            bgcolor: !wantPackage ? '#e8f5e9' : '#fff',
                                            borderRadius: 3,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease-in-out',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 1,
                                            '&:hover': { borderColor: '#00c853', bgcolor: '#f1f8e9' }
                                        }}
                                        onClick={() => handleDonationModeChange({ target: { value: 'general' } })}
                                    >
                                        <FavoriteIcon sx={{ fontSize: 40, color: !wantPackage ? '#00c853' : '#bdbdbd' }} />
                                        <FormControlLabel 
                                            value="general" 
                                            control={<Radio sx={{ display: 'none' }} />} 
                                            label={
                                                <Box textAlign="center">
                                                    <Typography fontWeight="bold" color={!wantPackage ? "success.main" : "text.primary"}>
                                                        สนับสนุนการจัดงาน
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        ไม่ประสงค์รับของที่ระลึก
                                                    </Typography>
                                                </Box>
                                            } 
                                            sx={{ m: 0 }}
                                        />
                                        {/* Checkmark overlay */}
                                        {!wantPackage && (
                                            <CheckCircleIcon color="success" sx={{ position: 'absolute', top: 8, right: 8 }} />
                                        )}
                                    </Paper>
                                </Grid>

                                {/* ตัวเลือก: รับของที่ระลึก (Package) */}
                                <Grid item xs={12} sm={6}>
                                    <Paper 
                                        variant="outlined" 
                                        elevation={0}
                                        sx={{ 
                                            position: 'relative',
                                            p: 2, 
                                            border: wantPackage ? '2px solid #ab47bc' : '1px solid #e0e0e0',
                                            bgcolor: wantPackage ? '#f3e5f5' : '#fff',
                                            borderRadius: 3,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease-in-out',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 1,
                                            '&:hover': { borderColor: '#ab47bc', bgcolor: '#fce4ec' }
                                        }}
                                        onClick={() => handleDonationModeChange({ target: { value: 'package' } })}
                                    >
                                        <CardGiftcardIcon sx={{ fontSize: 40, color: wantPackage ? '#ab47bc' : '#bdbdbd' }} />
                                        <FormControlLabel 
                                            value="package" 
                                            control={<Radio sx={{ display: 'none' }} />} 
                                            label={
                                                <Box textAlign="center">
                                                    <Typography fontWeight="bold" color={wantPackage ? "secondary.main" : "text.primary"}>
                                                        สนับสนุนพร้อมรับของที่ระลึก
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        เสื้อ ตุ๊กตา และพวงกุญแจ
                                                    </Typography>
                                                </Box>
                                            } 
                                            sx={{ m: 0 }}
                                        />
                                        {/* Checkmark overlay */}
                                        {wantPackage && (
                                            <CheckCircleIcon color="secondary" sx={{ position: 'absolute', top: 8, right: 8 }} />
                                        )}
                                    </Paper>
                                </Grid>
                            </Grid>
                        </RadioGroup>
                    </FormControl>

                  {/* แสดง Dropdown เลือก Package เฉพาะเมื่อเลือก 'รับของที่ระลึก' */}
                  <Collapse in={wantPackage}>
                    <Stack spacing={2} sx={{ mb: 3, p: 2.5, bgcolor: "#fff", borderRadius: 3, border: '1px solid #e1bee7', boxShadow: '0 4px 12px rgba(225, 190, 231, 0.2)' }}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <CardGiftcardIcon color="secondary" />
                            <Typography variant="subtitle1" fontWeight="bold" color="secondary.main">
                                กรุณาเลือกณุปแบบสนับสนุนที่ต้องการ
                            </Typography>
                        </Box>
                        
                        <TextField 
                          select 
                          label="เลือกรูปแบบสนับสนุน" 
                          fullWidth 
                          value={PACKAGE_OPTIONS.some(p => p.value === packageType) ? packageType : ''} 
                          onChange={handleSpecificPackageChange} 
                          size="medium"
                          sx={{ bgcolor: '#fff' }}
                        >
                          {PACKAGE_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value} sx={{ whiteSpace: 'normal', py: 1.5 }}>
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" color="secondary.main">
                                        รูปแบบสนับสนุนแบบที่ {opt.value.replace('package_', '')} - {opt.price.toLocaleString()} บาท
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                        {opt.label}
                                    </Typography>
                                </Box>
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField 
                            select 
                            label="เลือกขนาดเสื้อ (Size)" 
                            fullWidth 
                            value={packageSize} 
                            onChange={(e) => setPackageSize(e.target.value)} 
                            size="medium"
                            sx={{ bgcolor: '#fff' }}
                        >
                            {SIZE_OPTIONS.map((s) => (
                                <MenuItem key={s} value={s}>{s}</MenuItem>
                            ))}
                        </TextField>
                        <SizeChart />
                    </Stack>
                  </Collapse>

                  <Divider sx={{ my: 2 }}>
                      <Chip label="ข้อมูลการโอนเงิน" size="small" />
                  </Divider>

                  {/* QR Code Section */}
                  <Box sx={{ mt: 3, mb: 3, p: 2, bgcolor: "#fff", borderRadius: 3, border: "1px dashed #bdbdbd", textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        สแกน QR Code ด้านล่างเพื่อโอนเงินผ่านแอปธนาคาร
                      </Typography>
                      <Box 
                        sx={{ 
                            width: 180, 
                            height: 180, 
                            bgcolor: "#fff", 
                            borderRadius: 2, 
                            overflow: 'hidden', 
                            mx: 'auto', 
                            mb: 2,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            border: "1px solid #eee"
                        }}
                      >
                          <img src="/donate.png" alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>ธนาคารกสิกรไทย</Typography>
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1, bgcolor: '#f5f5f5', px: 2, py: 0.5, borderRadius: 4, width: 'fit-content', mx: 'auto' }}>
                          <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>211-8-76814-3</Typography>
                          <Tooltip title="กดเพื่อคัดลอก">
                              <IconButton size="small" onClick={handleCopyAccount} color="primary"><ContentCopyIcon fontSize="small" /></IconButton>
                          </Tooltip>
                      </Stack>
                      <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: 'text.secondary' }}>ชื่อบัญชี: น.ส เสาวดี อิสริยะโอภาส และ นาง นภาภรณ์ ลาชโรจน์ </Typography>
                  </Box>

                  {/* Amount, Date, Time Inputs */}
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12}>
                        <TextField 
                            label="จำนวนเงินที่โอน (บาท)" 
                            type="number" 
                            fullWidth 
                            value={donationAmount} 
                            onChange={e => setDonationAmount(e.target.value)} 
                            InputProps={{ 
                                startAdornment: <InputAdornment position="start">฿</InputAdornment>,
                                sx: { fontSize: '1.2rem', fontWeight: 'bold' } 
                            }}
                            helperText={wantPackage ? "กรุณาตรวจสอบยอดเงินให้ตรงกับ Package" : ""}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField 
                            label="วันที่โอน" 
                            type="date" 
                            fullWidth 
                            value={donationDate} 
                            onChange={e => setDonationDate(e.target.value)} 
                            InputLabelProps={{ shrink: true }} 
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" /></InputAdornment>
                            }}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        {/* Time Picker */}
                        <TextField 
                            label="เวลาที่โอน" 
                            type="time" 
                            fullWidth 
                            value={donationTime} 
                            onChange={e => setDonationTime(e.target.value)} 
                            InputLabelProps={{ shrink: true }}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><AccessTimeIcon fontSize="small" /></InputAdornment>
                            }}
                        />
                    </Grid>
                  </Grid>

                </Box>
              </Collapse>
            </Paper>

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
                                (กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วนเพื่อปรับปรุงข้อมูลให้เป็นปัจจุบัน)
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
                          (สมัครฟรีไม่มีค่าใช้จ่าย กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วนเพื่อประกอบการสมัคร ทีมงานจะบันทึกข้อมูลลงฐานข้อมูลสมาชิกสมาคมฯ หลังจบกิจกรรม)
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

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#ffebee", border: "1px solid #ef9a9a" }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <AccessibleIcon color="error" />
                <Typography fontWeight={800} fontSize="1.1rem" color="#c62828">ความช่วยเหลือพิเศษ</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                  เลือกจากหัวข้อต่อไปนี้ สามารถระบุเพิ่มเติมได้ (เลือกได้มากกว่า 1 ข้อ):
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
                  {ASSISTANCE_TAGS.map((tag) => {
                      const isSelected = selectedAssistTags.includes(tag.label);
                      return (
                          <Chip
                              key={tag.label}
                              icon={tag.icon}
                              label={tag.label}
                              clickable
                              color={isSelected ? "error" : "default"}
                              variant={isSelected ? "filled" : "outlined"}
                              onClick={() => handleAssistTagToggle(tag.label)}
                              sx={{ borderRadius: 2, fontWeight: isSelected ? 'bold' : 'normal', transition: 'all 0.2s', '&:hover': { bgcolor: isSelected ? 'error.dark' : '#ffebee' } }}
                          />
                      );
                  })}
              </Stack>

              <TextField 
                multiline
                rows={2}
                label="ท่านต้องการความช่วยเหลืออะไรพิเศษไหม? (ระบุเพิ่มเติม)"
                placeholder="เช่น ต้องการรถเข็น, แพ้อาหาร, หรืออื่นๆ"
                fullWidth
                value={specialAssistance}
                onChange={(e) => setSpecialAssistance(e.target.value)}
                sx={{ bgcolor: "#fff" }}
                helperText="เจ้าหน้าที่จะเตรียมการดูแลท่านอย่างดีที่สุดตามข้อมูลที่ได้รับ"
              />
            </Paper>

            <Alert severity="info" icon={<InfoIcon />} sx={{ bgcolor: "#e1f5fe", color: "#01579b", borderRadius: 2, "& .MuiAlert-icon": { color: "#0288d1" } }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    <strong>หมายเหตุ:</strong> ภายในงานจะมีการบันทึกภาพและวิดีโอ เพื่อใช้ในการประชาสัมพันธ์กิจกรรมของสมาคมนิสิตเก่าวิทยาศาสตร์ฯ
                </Typography>
            </Alert>

            <Turnstile ref={turnstileRef} size="invisible" action="pre_register" onVerify={(t) => setCfToken(t)} onError={() => setCfToken("")} />
            
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={1}>
              <Button type="submit" variant="contained" color="warning" size="large" disabled={loading || Object.keys(errors).length > 0} fullWidth sx={{ py: 1.5, borderRadius: 3, fontSize: '1rem', fontWeight: 800, boxShadow: "0 6px 20px rgba(255,193,7,.4)" }} startIcon={loading ? <CircularProgress size={24} color="inherit" /> : <FactCheckIcon fontSize="large" />}>
                {loading ? "กำลังประมวลผล..." : "ตรวจสอบข้อมูลการลงทะเบียน"}
              </Button>
              <Button type="button" variant="text" color="inherit" fullWidth onClick={handleReset} startIcon={<RestartAltIcon />}>เริ่มใหม่</Button>
            </Stack>

          </Box>
          </motion.div>
        )}
        
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
                    {(selectedAssistTags.length > 0 || specialAssistance) && (
                        <Box>
                            <Typography variant="caption" fontWeight={700}>ความช่วยเหลือพิเศษ:</Typography>
                            {selectedAssistTags.length > 0 && (
                                <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5} mb={0.5}>
                                    {selectedAssistTags.map(tag => <Chip key={tag} label={tag} size="small" color="error" variant="outlined" />)}
                                </Stack>
                            )}
                             <Typography variant="body2">{specialAssistance || "-"}</Typography>
                        </Box>
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
        
        <Snackbar open={snackbarOpen} autoHideDuration={2000} onClose={() => setSnackbarOpen(false)} message="คัดลอกเลขบัญชีแล้ว" anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />

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