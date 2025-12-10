// frontend/src/pages/PreRegistrationPage.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, TextField, MenuItem,
  Button, Avatar, Divider, Collapse, FormControlLabel, Switch,
  Alert, CircularProgress, Tooltip, Chip, Card, CardContent,
  Dialog, DialogContent, DialogTitle, DialogActions, Grid, Radio, RadioGroup, FormControl, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Snackbar, IconButton
} from "@mui/material";

// Icons เดิม (คงไว้ครบ)
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

// Icons ใหม่สำหรับ Ticket และตัวเลือกความช่วยเหลือ
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import WheelchairPickupIcon from '@mui/icons-material/WheelchairPickup';

// Libraries
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { listParticipantFields, createParticipant, createDonation } from "../utils/api";
import dayjs from "dayjs";
import Turnstile from "../components/Turnstile";

// Animation & Effects (ของใหม่)
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';

// --- Configuration Constants (คงเดิม) ---
const PACKAGE_OPTIONS = [
  { price: 2000, value: "package_A", label: "สนับสนุนเงิน 2,000 บาท รับเสื้องานคืนเหย้า POLO สีน้ำเงิน (คอปก) 1 ตัว และ ตุ๊กตาเสือเหลือง_ผ้านุ่ม (ขนาด 12 นิ้ว) 1 ตัว" },
  { price: 2000, value: "package_B", label: "สนับสนุนเงิน 2,000 บาท รับเสื้องานคืนเหย้า POLO สีชมพู (คอปก) 1 ตัว และ ตุ๊กตาเสือเหลือง_ผ้านุ่ม (ขนาด 12 นิ้ว) 1 ตัว" },
  { price: 1500, value: "package_C", label: "สนับสนุนเงิน 1,500 บาท รับเสื้องานคืนเหย้า T-shirt สีเหลือง (คอกลม) 1 ตัว และ พวงกุญแจเสือเหลือง (ขนาด 5 นิ้ว) 1 ตัว" },
  { price: 1200, value: "package_D", label: "สนับสนุนเงิน 1,200 บาท รับเสื้องานคืนเหย้า T-shirt สีเหลือง (คอกลม) 1 ตัว" }
];
const SIZE_OPTIONS = ["SS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL","6XL","7XL"];

// ตัวเลือกความช่วยเหลือพิเศษ (Quick Options - ของใหม่)
const ASSISTANCE_TAGS = [
    { label: "ใช้วีลแชร์/รถเข็น", icon: <WheelchairPickupIcon fontSize="small"/> },
    { label: "ไม้เท้าพยุงเดิน", icon: <AccessibleIcon fontSize="small"/> },
    { label: "อาหารฮาลาล", icon: <RestaurantIcon fontSize="small"/> },
    { label: "อาหารมังสวิรัติ", icon: <RestaurantIcon fontSize="small"/> },
    { label: "แพ้อาหารทะเล", icon: <WarningIcon fontSize="small"/> },
    { label: "แพ้ถั่ว", icon: <WarningIcon fontSize="small"/> }
];

// ข้อมูลตารางไซส์ (คงเดิม)
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
  // State Management
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
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Donation States
  const [wantToDonate, setWantToDonate] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [donationDate, setDonationDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [donationTime, setDonationTime] = useState(dayjs().format("HH:mm"));

  // Package Donation States
  const [wantPackage, setWantPackage] = useState(false);
  const [packageType, setPackageType] = useState("");
  const [packageSize, setPackageSize] = useState("");

  // Special Assistance State (ปรับปรุงใหม่)
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
    
    if (errors[name]) {
        setErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
    }
    
    setForm((f) => ({ ...f, [name]: value }));
  };

  // จัดการ Toggle ปุ่มความช่วยเหลือพิเศษ
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

  const handlePackageChange = (e) => {
    const selectedLabel = e.target.value;
    setPackageType(selectedLabel);

    const foundPkg = PACKAGE_OPTIONS.find(p => p.label === selectedLabel);
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
        
        setErrorDialog({ 
            open: true, 
            type: "warning", 
            title: "ข้อมูลไม่ครบถ้วน", 
            msg: `กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.map(f => f.label).join(", ")}` 
        });
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
      if (wantPackage) {
        if (!packageType || !packageSize) {
           setErrorDialog({ open: true, type: "warning", title: "ข้อมูลแพ็กเกจไม่ครบ", msg: "กรุณาเลือกรูปแบบแพ็กเกจและขนาดเสื้อ" });
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

        // รวมข้อมูลความช่วยเหลือพิเศษ (Tags + Text) เป็น String เดียว
        const combinedAssistance = [
            ...selectedAssistTags,
            specialAssistance.trim()
        ].filter(Boolean).join(", ");

        const payload = { 
          ...finalForm, 
          followers: count, 
          cfToken, 
          consent: finalConsent,
          specialAssistance: combinedAssistance
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
        
        // Reset Form
        setForm({});
        setBringFollowers(false);
        setFollowersCount(0);
        setWantToDonate(false);
        setWantPackage(false);
        setPackageType("");
        setPackageSize("");
        setDonationAmount("");
        setSpecialAssistance("");
        setSelectedAssistTags([]);
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
        
        turnstileRef.current?.reset();
      } finally {
        setLoading(false);
        setPendingSubmit(false);
        setCfToken("");
      }
    };
    go();
    // eslint-disable-next-line
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
    setSpecialAssistance("");
    setSelectedAssistTags([]);
    setMembershipOption(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function pickField(participant, keys) { const f = participant?.fields || {}; for (const k of keys) { if (f[k] != null && String(f[k]).trim() !== "") return f[k]; } return "-"; }

  // ==========================================
  // ส่วนแสดงผลเมื่อลงทะเบียนสำเร็จ (Ticket Preview) - ใหม่
  // ==========================================
  if (registeredParticipant) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa", position: 'relative', overflowX: 'hidden' }}>
        <MourningRibbon />
        
        {/* ลูกเล่น Confetti */}
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={350}
          gravity={0.15}
        />

        <Container maxWidth="sm" sx={{ mt: 6, mb: 8, position: 'relative', zIndex: 10 }}>
           {/* Header ข้อความสำเร็จ */}
          <Box textAlign="center" mb={4}>
             <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
             >
               <CheckCircleIcon color="success" sx={{ fontSize: 72, mb: 1, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }} />
             </motion.div>
            <Typography variant="h4" gutterBottom fontWeight="900" color="primary.main" sx={{ letterSpacing: 0.5 }}>
              ลงทะเบียนสำเร็จ!
            </Typography>
            <Typography variant="body1" color="text.secondary">
              ยินดีต้อนรับเข้าสู่งาน กรุณาบันทึกบัตรเข้าร่วมงานด้านล่างเพื่อใช้เข้างาน
            </Typography>
          </Box>

          {/* Ticket Card Animation */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            whileHover={{ y: -8, transition: { duration: 0.2 } }}
            style={{ perspective: 1000 }}
          >
            <Card
              ref={ticketRef} 
              elevation={8}
              sx={{
                borderRadius: 4,
                overflow: 'hidden',
                background: '#fff',
                position: 'relative',
                backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(239, 246, 255, 0.8) 0%, rgba(255, 255, 255, 0.8) 90%)',
              }}
            >
              {/* ส่วนหัวบัตร Theme สีน้ำเงิน/ทอง */}
              <Box sx={{
                background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                color: 'white',
                p: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '4px solid #FFD700'
              }}>
                 <Box display="flex" alignItems="center" gap={1.5}>
                    <ConfirmationNumberIcon sx={{ color: '#FFD700', fontSize: 32 }} />
                    <Typography variant="h6" fontWeight="bold" sx={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>
                      บัตรเข้าร่วมงาน
                    </Typography>
                 </Box>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                     #{registeredParticipant?.qrCode?.slice(0,8) || "REF-ID"}
                  </Typography>
              </Box>

              <CardContent sx={{ p: 3 }}>
                <Grid container spacing={2} alignItems="center">
                  {/* ฝั่งซ้าย: QR Code */}
                  <Grid item xs={12} sm={5} display="flex" flexDirection="column" alignItems="center" justifyContent="center">
                     <Box sx={{
                        p: 2,
                        bgcolor: 'white',
                        borderRadius: 3,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                        border: '1px solid #e0e0e0'
                     }}>
                        <QRCodeSVG
                          value={registeredParticipant?.qrCode || registeredParticipant?._id || "no-code"}
                          size={140}
                          level={"H"}
                          includeMargin={true}
                        />
                     </Box>
                     <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, fontWeight: 500 }}>
                        สแกน QR Code นี้หน้างาน
                     </Typography>
                  </Grid>

                   {/* ฝั่งขวา: รายละเอียดผู้เข้าร่วม */}
                  <Grid item xs={12} sm={7}>
                     <Box ml={{ sm: 1 }} textAlign={{ xs: 'center', sm: 'left' }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom display="flex" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} gap={0.5}>
                          <PersonIcon fontSize="small" color="primary" /> ชื่อผู้เข้าร่วม
                        </Typography>
                        <Typography variant="h5" fontWeight="800" color="text.primary" gutterBottom sx={{ mb: 2, lineHeight: 1.2 }}>
                          {pickField(registeredParticipant, ["name", "fullName", "fullname"])}
                        </Typography>

                        <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

                        <Stack spacing={1.5}>
                             <Box display="flex" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} gap={1}>
                                <BadgeIcon fontSize="small" color="action" />
                                <Box>
                                    <Typography variant="caption" color="text.secondary">รุ่นปี</Typography>
                                    <Typography variant="body2" fontWeight="bold">
                                      {pickField(registeredParticipant, ["date_year", "year"])}
                                    </Typography>
                                </Box>
                             </Box>
                             
                             <Box display="flex" alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} gap={1}>
                                <ApartmentIcon fontSize="small" color="action"/>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">ภาควิชา</Typography>
                                    <Typography variant="body2" fontWeight="bold">
                                      {pickField(registeredParticipant, ["dept", "department"])}
                                    </Typography>
                                </Box>
                             </Box>
                        </Stack>
                     </Box>
                  </Grid>
                </Grid>
              </CardContent>
              {/* แถบสีตกแต่งด้านล่าง */}
              <Box sx={{ height: 12, background: 'linear-gradient(90deg, #FFD700 0%, #FF8C00 100%)' }} />
            </Card>
          </motion.div>

          {/* ปุ่ม Action ต่างๆ */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" mt={5}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={<DownloadIcon />}
              onClick={savePng}
              sx={{ borderRadius: 3, px: 4, py: 1.2, fontWeight: 'bold', boxShadow: '0 8px 20px rgba(30, 60, 114, 0.25)', fontSize: '1rem' }}
            >
              บันทึกเป็นรูปภาพ
            </Button>
            
            <Button
              variant="outlined"
              color="inherit"
              size="large"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
               sx={{ borderRadius: 3, px: 3, borderColor: '#999', color: '#555', "&:hover": { borderColor: '#333', bgcolor: '#f0f0f0' } }}
            >
              ลงทะเบียนท่านอื่นต่อ
            </Button>
          </Stack>

        </Container>
      </Box>
    );
  }

  // ==========================================
  // ส่วนแสดงฟอร์มลงทะเบียน (Pre-Register Form) - พร้อม Animation
  // ==========================================
  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 }, position: "relative" }}>
      
      <MourningRibbon />

      <Container maxWidth="sm">
        {/* Animated Header */}
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
                <Chip label="ร่วมสนับสนุนเป็นทางเลือก" size="small" color="success" variant="outlined" sx={{ ml: "auto" }} />
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
                    <Box sx={{ width: 160, height: 160, bgcolor: "#eee", borderRadius: 2, overflow: 'hidden', mb: 1 }}>
                        <img src="/donate.png" alt="QR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>ธนาคารกสิกรไทย</Typography>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ bgcolor: '#f5f5f5', px: 1.5, py: 0.5, borderRadius: 2 }}>
                        <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>211-8-76814-3</Typography>
                        <Tooltip title="กดเพื่อคัดลอก">
                            <IconButton size="small" onClick={handleCopyAccount} color="primary"><ContentCopyIcon fontSize="small" /></IconButton>
                        </Tooltip>
                    </Stack>
                    <Typography variant="caption" sx={{ mt: 0.5 }}>ชื่อบัญชี: น.ส เสาวดี อิสริยะโอภาส และ นาง นภาภรณ์ ลาชโรจน์ </Typography>
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
                    label={<Typography variant="body2">{wantPackage ? "ต้องการบริจาคเป็น Package" : "บริจาคทั่วไป"}</Typography>} 
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
                                (กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วนเพื่อปรับปรุงข้อมูลให้เป็นปัจจุบัน ทีมงานจะบันทึกข้อมูลลงฐานข้อมูลสมาชิกสมาคมฯ หลังจบกิจกรรม)
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

            {/* 6. Special Assistance (เพิ่มใหม่: Quick Options) */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#ffebee", border: "1px solid #ef9a9a" }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <AccessibleIcon color="error" />
                <Typography fontWeight={800} fontSize="1.1rem" color="#c62828">ความช่วยเหลือพิเศษ</Typography>
              </Stack>
              
              {/* Quick Select Options */}
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
                              sx={{ 
                                  borderRadius: 2, 
                                  fontWeight: isSelected ? 'bold' : 'normal',
                                  transition: 'all 0.2s',
                                  '&:hover': { bgcolor: isSelected ? 'error.dark' : '#ffebee' }
                              }}
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

            {/* 7. หมายเหตุ PDPA */}
            <Alert severity="info" icon={<InfoIcon />} sx={{ bgcolor: "#e1f5fe", color: "#01579b", borderRadius: 2, "& .MuiAlert-icon": { color: "#0288d1" } }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    <strong>หมายเหตุ:</strong> ภายในงานจะมีการบันทึกภาพและวิดีโอ เพื่อใช้ในการประชาสัมพันธ์กิจกรรมของสมาคมนิสิตเก่าวิทยาศาสตร์ฯ
                </Typography>
            </Alert>

            {/* Turnstile Widget - FIXED */}
            <Turnstile 
                ref={turnstileRef} 
                size="invisible" 
                action="pre_register" 
                onVerify={(t) => setCfToken(t)} 
                onError={() => setCfToken("")} 
            />
            
            {/* ปุ่มกดตรวจสอบข้อมูล */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={1}>
              <Button type="submit" variant="contained" color="warning" size="large" disabled={loading || Object.keys(errors).length > 0} fullWidth sx={{ py: 1.5, borderRadius: 3, fontSize: '1rem', fontWeight: 800, boxShadow: "0 6px 20px rgba(255,193,7,.4)" }} startIcon={loading ? <CircularProgress size={24} color="inherit" /> : <FactCheckIcon fontSize="large" />}>
                {loading ? "กำลังประมวลผล..." : "ตรวจสอบข้อมูลการลงทะเบียน"}
              </Button>
              <Button type="button" variant="text" color="inherit" fullWidth onClick={handleReset} startIcon={<RestartAltIcon />}>เริ่มใหม่</Button>
            </Stack>

          </Box>
          </motion.div>
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
                    {/* แสดงผลความช่วยเหลือพิเศษที่เลือก */}
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
        
        {/* Toast Notification */}
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