// frontend/src/pages/DashboardPage.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import useAuth from "../hooks/useAuth";
import {
  AppBar, Toolbar, Box, Typography, Button, Avatar,
  Stack, Chip, Card, CardContent, Container, Tooltip, Menu, MenuItem, Divider, CssBaseline, Switch, Skeleton, Fade, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import DashboardIcon from "@mui/icons-material/Dashboard";
import GroupIcon from "@mui/icons-material/Group";
import SettingsIcon from "@mui/icons-material/Settings";
import QrCodeIcon from "@mui/icons-material/QrCode2";
import StoreIcon from "@mui/icons-material/Store";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import PeopleIcon from "@mui/icons-material/People";
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import PaymentsIcon from '@mui/icons-material/Payments';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { Link } from "react-router-dom";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import getAvatarUrl from "../utils/getAvatarUrl";
import { getDonationSummary, getDashboardSummary } from "../utils/api";

// [NEW] Import Library สำหรับทำ Excel
import * as XLSX from 'xlsx';

import { PieChart, Pie, Cell, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, LineChart, Line } from "recharts";

// --- Custom Components ---
class ChartErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err, info) { }
  render() {
    if (this.state.hasError) {
      return (
        <Card sx={{ mb: 4, border: "1px dashed #f44336", borderRadius: 4 }}>
          <CardContent>
            <Typography color="error" fontWeight={700}>กราฟแสดงผลผิดพลาด</Typography>
            <Typography variant="body2" color="text.secondary">โปรดลองกดรีเฟรชสรุปข้อมูล</Typography>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// การ์ดสถิติแบบใหม่
const StatCard = ({ title, value, subtext, icon, color1, color2, textColor = "#fff", loading }) => (
  <Card sx={{
    flex: 1,
    background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
    color: textColor,
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    border: 'none',
    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
    '&:hover': { transform: 'translateY(-5px)', boxShadow: '0 12px 28px rgba(0,0,0,0.2)' }
  }}>
    <Box sx={{
      position: 'absolute', right: -20, bottom: -20,
      opacity: 0.15, transform: 'rotate(-20deg)', pointerEvents: 'none'
    }}>
      {icon && React.cloneElement(icon, { sx: { fontSize: 120, color: textColor } })}
    </Box>
    <CardContent sx={{ position: 'relative', zIndex: 1, textAlign: "left", p: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '50%', p: 0.5, display: 'flex' }}>
            {icon && React.cloneElement(icon, { sx: { fontSize: 20, color: textColor } })}
        </Box>
        <Typography variant="subtitle2" fontWeight={600} sx={{ opacity: 0.9, letterSpacing: 0.5 }}>{title}</Typography>
      </Stack>
      {loading ? (
        <Skeleton variant="text" width="60%" height={60} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
      ) : (
        <Typography variant="h3" fontWeight={800} sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Typography>
      )}
      {subtext && <Typography variant="caption" sx={{ opacity: 0.8, mt: 0.5, display: 'block' }}>{subtext}</Typography>}
    </CardContent>
  </Card>
);

const MAIN_MENU = [
  { label: "Dashboard", icon: <DashboardIcon />, path: "/dashboard", roles: ["admin", "staff", "kiosk"] },
  { label: "Check-in (Staff)", icon: <QrCodeIcon />, path: "/staff", roles: ["staff", "admin"] },
  { label: "Kiosk Onsite", icon: <StoreIcon />, path: "/kiosk", roles: ["kiosk", "admin", "staff"] }
];

const MANAGE_MENU = [
  { label: "จัดการจุดลงทะเบียน", icon: <StoreIcon />, path: "/registration-points", roles: ["admin", "staff"] },
  { label: "จัดการผู้ใช้", icon: <GroupIcon />, path: "/admin", roles: ["admin"] },
  { label: "จัดการผู้เข้าร่วม", icon: <PeopleIcon />, path: "/admin/participants", roles: ["admin"] },
  { label: "ตั้งค่าระบบ", icon: <SettingsIcon />, path: "/settings", roles: ["admin"] }
];

const getTheme = (mode = "light") =>
  createTheme({
    palette: {
      mode,
      primary: { main: "#FFC107", light: "#FFE082", dark: "#FFA000", contrastText: "#4E342E" },
      secondary: { main: "#FF9800", light: "#FFB74D", dark: "#F57C00" },
      background: {
        default: mode === "light" ? "#FFFBE6" : "#121212",
        paper: mode === "light" ? "#FFFFFF" : "#1E1E1E",
      },
      text: {
        primary: mode === "light" ? "#4E342E" : "#FFF",
        secondary: mode === "light" ? "#8D6E63" : "#B0BEC5"
      },
      success: { main: "#4CAF50", light: "#81C784", dark: "#388E3C" },
      info: { main: "#29B6F6", light: "#4FC3F7", dark: "#0288D1" },
    },
    typography: {
      fontFamily: "'Prompt', 'Kanit', sans-serif",
      fontWeightBold: 700,
      h4: { fontWeight: 800, letterSpacing: '-0.5px' },
      h6: { fontWeight: 700 }
    },
    shape: { borderRadius: 16 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 12,
            fontWeight: 700,
            boxShadow: 'none',
            transition: 'all 0.2s',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 4px 12px rgba(255, 193, 7, 0.4)',
            },
          },
          outlined: {
            borderWidth: '2px',
            '&:hover': { borderWidth: '2px' }
          }
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 24,
            backgroundImage: mode === "light" ? 'linear-gradient(180deg, #FFFFFF 0%, #FFFEF9 100%)' : 'none',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)',
            border: mode === "light" ? '1px solid rgba(255, 193, 7, 0.12)' : '1px solid rgba(255, 255, 255, 0.1)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: mode === "light" 
              ? "rgba(255, 255, 255, 0.9)" 
              : "rgba(30, 30, 30, 0.9)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
            color: mode === "light" ? "#4E342E" : "#fff",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: mode === "light" ? "#FFF8E1" : "#333",
            color: mode === "light" ? "#5D4037" : "#FFF",
            fontWeight: 800,
            borderBottom: "2px solid rgba(255,193,7,0.2)"
          },
          root: {
            fontSize: '0.95rem'
          }
        }
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: mode === "light" ? "rgba(255, 248, 225, 0.6) !important" : "rgba(255, 255, 255, 0.05) !important",
            }
          }
        }
      }
    },
  });

function getInitial(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function DashboardPage() {
  const { user, logout, token } = useAuth();
  const roles = Array.isArray(user?.role) ? user.role : [user?.role];
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [darkMode, setDarkMode] = React.useState(false);
  const [profileAnchorEl, setProfileAnchorEl] = React.useState(null);
  const openProfile = Boolean(profileAnchorEl);

  const [summary, setSummary] = useState(null);
  const [donationStats, setDonationStats] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [withFollowers, setWithFollowers] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const countdownRef = useRef(null);
  const fetchSummaryRef = useRef(null);

  async function fetchSummary() {
    setLoadingSummary(true);
    try {
      const res = await getDashboardSummary(token);
      setSummary(res.data);
      const donRes = await getDonationSummary(token);
      setDonationStats(donRes.data);
    } catch (err) {
      console.error("Failed to fetch summary", err);
    }
    setLoadingSummary(false);
    setRefreshCountdown(60);
  }

// [FINAL FIXED] ฟังก์ชัน Download Excel สำหรับโครงสร้างข้อมูลที่มี fields
  async function handleDownloadExcel() {
    try {
      const res = await fetch("/api/participants?all=true", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลได้ (API Error)");
      
      const responseJson = await res.json();
      const participants = Array.isArray(responseJson) ? responseJson : (responseJson.data || []);

      if (participants.length === 0) {
        alert("ไม่พบข้อมูลสำหรับดาวน์โหลด");
        return;
      }

      // 1. Map สถานะ (ตรงกับ JSON เป๊ะๆ)
      const statusMap = {
        'registered': 'ลงทะเบียนแล้ว',
        'checkedIn': 'เช็คอินแล้ว', // ใน JSON เป็น camelCase
        'pending': 'รอตรวจสอบ',
        'cancelled': 'ยกเลิก'
      };

      // 2. Map ข้อมูล (เจาะเข้าไปใน .fields)
      const excelData = participants.map((item, index) => {
        // ดึงข้อมูลส่วนตัวจาก fields (ถ้าไม่มีให้กัน error ไว้ด้วย {})
        const f = item.fields || {};
        
        return {
            'ลำดับ': index + 1,
            'ชื่อ-นามสกุล': f.name || 'ไม่ระบุ',
            'ชื่อเล่น': f.nickname || '-',
            'เบอร์โทรศัพท์': f.phone || '-',
            'อีเมล': f.email || '-',
            'คณะ/หน่วยงาน': f.dept || '-',
            'ปีรุ่น': f.date_year || '-',
            'สถานะ': statusMap[item.status] || item.status, 
            'ประเภทการลงทะเบียน': item.registrationType === 'onsite' ? 'หน้างาน' : 'ออนไลน์',
            'จำนวนผู้ติดตาม': item.followers || 0,
            'ความช่วยเหลือพิเศษ': item.specialAssistance || '-',
            'เวลาลงทะเบียน': item.registeredAt ? new Date(item.registeredAt).toLocaleString('th-TH') : '-',
            'เวลาเช็คอิน': item.checkedInAt ? new Date(item.checkedInAt).toLocaleString('th-TH') : 'ยังไม่เช็คอิน',
            'จุดลงทะเบียน': item.registeredPoint === 'Online' ? 'ระบบออนไลน์' : (item.registeredPoint || '-')
        };
      });

      // 3. สร้างไฟล์ Excel
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // จัดความกว้างคอลัมน์ให้สวยงาม
      worksheet['!cols'] = [
        { wch: 6 },  // ลำดับ
        { wch: 25 }, // ชื่อ
        { wch: 10 }, // ชื่อเล่น
        { wch: 15 }, // เบอร์
        { wch: 20 }, // อีเมล
        { wch: 25 }, // คณะ
        { wch: 10 }, // รุ่น
        { wch: 15 }, // สถานะ
        { wch: 15 }, // ประเภท
        { wch: 10 }, // ผู้ติดตาม
        { wch: 15 }, // ช่วยเหลือ
        { wch: 20 }, // เวลาลงทะเบียน
        { wch: 20 }, // เวลาเช็คอิน
        { wch: 15 }  // จุดลงทะเบียน
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "รายชื่อผู้ลงทะเบียน");

      XLSX.writeFile(workbook, `Report_Participants_${new Date().toISOString().slice(0,10)}.xlsx`);

    } catch (e) {
      console.error(e);
      alert("เกิดข้อผิดพลาด: " + e.message);
    }
  }

  fetchSummaryRef.current = fetchSummary;

  useEffect(() => {
    fetchSummary();
    countdownRef.current = setInterval(() => {
      setRefreshCountdown((c) => {
        if (c <= 1) {
          fetchSummaryRef.current && fetchSummaryRef.current();
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [token]);

  const mainMenuFiltered = MAIN_MENU.filter(item => item.roles.some(r => roles.includes(r)));
  const manageMenuFiltered = MANAGE_MENU.filter(item => item.roles.some(r => roles.includes(r)));

  const displayName = user?.fullName || user?.username || "";
  const displayShort = displayName.length > 10 ? displayName.slice(0, 10) + "..." : displayName;

  function skel(h = 48, w = 100) { return <Skeleton variant="rectangular" height={h} width={w} animation="wave" sx={{borderRadius: 3}} />; }

  const statusPieData = useMemo(() => {
    if (!summary) return [];
    return withFollowers
      ? [
          { name: `Checked-in (${summary?.statusBreakdown?.people?.checkedIn ?? 0})`, value: summary?.statusBreakdown?.people?.checkedIn ?? 0 },
          { name: `Not Checked-in (${summary?.statusBreakdown?.people?.notCheckedIn ?? 0})`, value: summary?.statusBreakdown?.people?.notCheckedIn ?? 0 },
          { name: `Cancelled (${summary?.statusBreakdown?.people?.cancelled ?? 0})`, value: summary?.statusBreakdown?.people?.cancelled ?? 0 },
        ]
      : [
          { name: `Checked-in (${summary?.statusBreakdown?.participants?.checkedIn ?? 0})`, value: summary?.statusBreakdown?.participants?.checkedIn ?? 0 },
          { name: `Not Checked-in (${summary?.statusBreakdown?.participants?.notCheckedIn ?? 0})`, value: summary?.statusBreakdown?.participants?.notCheckedIn ?? 0 },
          { name: `Cancelled (${summary?.statusBreakdown?.participants?.cancelled ?? 0})`, value: summary?.statusBreakdown?.participants?.cancelled ?? 0 },
        ];
  }, [summary, withFollowers]);

  const channelPieData = useMemo(() => ([
    { name: `Online (${summary?.onlineRegistered ?? 0})`, value: summary?.onlineRegistered ?? 0 },
    { name: `Onsite (${summary?.onsiteRegistered ?? 0})`, value: summary?.onsiteRegistered ?? 0 }
  ]), [summary]);

  const registrationByDayData = useMemo(() => summary?.registrationByDay ?? [], [summary]);
  const checkinByHourData   = useMemo(() => summary?.checkinByHour ?? [], [summary]);

  const fStat = summary?.statusBreakdown?.followers || {};
  const followersRegisteredTotal = typeof fStat.total === "number" ? fStat.total : (summary?.totalFollowers || 0);
  const followersCheckedInTotal = typeof fStat.checkedIn === "number" ? fStat.checkedIn : (summary?.checkedInFollowers || 0);

  const regByDayKey = withFollowers ? "totalCount" : "count";
  const checkinHourKey = withFollowers ? "totalCount" : "participantCount";

  const totalDonationAmount = donationStats?.stats?.totalAmount || 0;
  const totalDonationCount = donationStats?.stats?.totalCount || 0;
  const recentDonations = donationStats?.transactions?.slice(0, 5) || [];

  const checkedInByStaff = Array.isArray(summary?.checkedInUsers) ? summary.checkedInUsers : [];
  const registeredByStaff = Array.isArray(summary?.registeredByUsers) ? summary.registeredByUsers : [];

  const enrichWithPercent = (rows, total) => {
    const sum = typeof total === "number" ? total : rows.reduce((s, r) => s + (r.count || 0), 0);
    return rows
      .map(r => ({
        ...r,
        name: r.displayName || r.username || r.userName || r.user_id || r.userId || r._id || "Unknown",
        percent: sum > 0 ? ((r.count || 0) * 100) / sum : 0
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  };

  const checkedInTotal = summary?.checkedIn ?? undefined;
  const checkedInByStaffView = useMemo(
    () => enrichWithPercent(checkedInByStaff, checkedInTotal),
    [checkedInByStaff, checkedInTotal]
  );

  const registeredTotalGuess =
    typeof summary?.totalRegistered === "number" ? summary.totalRegistered : undefined;
  const registeredByStaffView = useMemo(
    () => enrichWithPercent(registeredByStaff, registeredTotalGuess),
    [registeredByStaff, registeredTotalGuess]
  );

  return (
    <ThemeProvider theme={getTheme(darkMode ? "dark" : "light")}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", pb: 6 }}>
        <AppBar position="sticky">
          <Toolbar sx={{ px: { xs: 1, md: 3 }, minHeight: 70, display: "flex", alignItems: "center", gap: 1 }}>
            
            {/* Logo และ Title ตามที่ขอ */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mr: 1 }}>
              <Avatar 
                src="/logo.svg" 
                variant="square" // ให้ Logo เป็นสี่เหลี่ยม (ไม่โดนตัดเป็นวงกลม)
                sx={{ 
                    width: 48, 
                    height: 48, 
                    bgcolor: 'transparent',
                    img: { objectFit: 'contain' } 
                }}
              >
                {!user?.avatar && <StoreIcon />} 
              </Avatar>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="h6" fontWeight={800} color="primary.dark" sx={{ lineHeight: 1.1 }}>
                  Registration Management System
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ระบบจัดการข้อมูลผู้ลงทะเบียน
                </Typography>
              </Box>
            </Stack>
            
            <Box sx={{ flex: 1 }} />

            <Stack direction="row" alignItems="center" spacing={1.5}>
              {/* เมนูหลักแบบปุ่มกลม */}
              <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
                {mainMenuFiltered.map(item => (
                    <Tooltip key={item.label} title={item.label}>
                    <Button component={Link} to={item.path} sx={{ minWidth: 48, width: 48, height: 48, borderRadius: '50%', p: 0, bgcolor: 'background.paper', color: 'primary.main', border: '1px solid rgba(0,0,0,0.08)' }}>
                        {item.icon}
                    </Button>
                    </Tooltip>
                ))}
              </Stack>
              {/* เมนูจัดการ */}
              {manageMenuFiltered.length > 0 && (
                 <MenuItemDropdown icon={<SettingsIcon />} menuItems={manageMenuFiltered} />
              )}
              
              <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 24, alignSelf: 'center' }} />

              <Button 
                onClick={e => setProfileAnchorEl(e.currentTarget)}
                sx={{ pl: 0.5, pr: 2, py: 0.5, borderRadius: 50, bgcolor: 'background.paper', border: '1px solid rgba(0,0,0,0.05)', color: 'text.primary', '&:hover': { bgcolor: '#fff' } }}
                startIcon={<Avatar src={getAvatarUrl(user)} sx={{ width: 34, height: 34 }}>{!user?.avatar && getInitial(displayName)}</Avatar>}
                endIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
              >
                <Typography variant="body2" fontWeight={600} sx={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: 'nowrap' }}>{displayShort}</Typography>
              </Button>
              <Menu anchorEl={profileAnchorEl} open={openProfile} onClose={() => setProfileAnchorEl(null)} PaperProps={{ elevation: 8, sx: { mt: 1.5, minWidth: 200, borderRadius: 4 } }}>
                {/* Mobile Menu Items that hidden in md */}
                <Box sx={{ display: { md: 'none' } }}>
                    {mainMenuFiltered.map(item => (
                        <MenuItem key={item.label} component={Link} to={item.path} onClick={() => setProfileAnchorEl(null)}>
                            <Box sx={{ mr: 1.5, color: 'primary.main', display: 'flex' }}>{item.icon}</Box> {item.label}
                        </MenuItem>
                    ))}
                    <Divider sx={{ my: 1 }} />
                </Box>
                <MenuItem component={Link} to="/profile" onClick={() => setProfileAnchorEl(null)}><PersonIcon sx={{ mr: 1.5 }} /> โปรไฟล์</MenuItem>
                <MenuItem onClick={() => { setProfileAnchorEl(null); setDialogOpen(true); }}><VpnKeyIcon sx={{ mr: 1.5 }} /> เปลี่ยนรหัสผ่าน</MenuItem>
                <MenuItem onClick={() => { setProfileAnchorEl(null); logout(); }} sx={{ color: 'error.main' }}><LogoutIcon sx={{ mr: 1.5 }} /> ออกจากระบบ</MenuItem>
                <Divider sx={{ my: 1 }} />
                <MenuItem onClick={() => setDarkMode(v => !v)}>
                  {darkMode ? <Brightness7Icon sx={{ mr: 1.5 }} /> : <Brightness4Icon sx={{ mr: 1.5 }} />}
                  {darkMode ? "Light Mode" : "Dark Mode"}
                </MenuItem>
              </Menu>
            </Stack>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ mt: 4, mb: 5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
            <Box>
                <Typography variant="h4" fontWeight={900} sx={{ background: "linear-gradient(45deg, #FFC107, #FF6F00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 0.5 }}>
                  ภาพรวมระบบลงทะเบียน
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>อัปเดตล่าสุด: {new Date().toLocaleTimeString('th-TH')}</Typography>
                </Stack>
            </Box>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ bgcolor: 'background.paper', p: 1, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.04)', mt: { xs: 2, sm: 0 } }}>
              <FormControlLabel
                control={<Switch checked={withFollowers} onChange={e => setWithFollowers(e.target.checked)} size="small" color="success" />}
                label={<Typography variant="body2" fontWeight={600} color="text.secondary">รวมผู้ติดตาม</Typography>}
                sx={{ ml: 1, mr: 0 }}
              />
              <Divider orientation="vertical" flexItem />
              <Button
                size="small"
                onClick={() => fetchSummary()}
                disabled={loadingSummary}
                startIcon={loadingSummary ? <CircularProgress size={14} color="inherit" /> : <TrendingUpIcon fontSize="small" />}
                sx={{ minWidth: 100, borderRadius: 3, bgcolor: '#FFF8E1', color: '#FF8F00', '&:hover': { bgcolor: '#FFECB3' } }}
              >
                รีเฟรช ({refreshCountdown}s)
              </Button>
            </Stack>
          </Stack>

          <ChartErrorBoundary>
            {/* Main Stats with New Design */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={4}>
              <StatCard title="ลงทะเบียนทั้งหมด" value={summary?.totalRegistered ?? 0} icon={<PersonIcon />} color1="#FFC107" color2="#FF8F00" loading={loadingSummary} />
              <StatCard title="เช็คอินแล้ว" value={summary?.checkedIn ?? 0} icon={<CheckCircleIcon />} color1="#66BB6A" color2="#43A047" loading={loadingSummary} />
              <StatCard title="อัตราเช็คอิน" value={`${summary?.checkinRate ?? 0}%`} icon={<DashboardIcon />} color1="#42A5F5" color2="#1976D2" loading={loadingSummary} />
              <StatCard title="จำนวนคนในงาน (รวม)" value={summary?.totalPeopleCheckedIn ?? 0} icon={<GroupIcon />} color1="#AB47BC" color2="#7B1FA2" loading={loadingSummary} />
            </Stack>

            {/* Donation Section */}
            {donationStats && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" fontWeight={800} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', ml: 1 }}>
                    <VolunteerActivismIcon color="error" /> ข้อมูลการสนับสนุน
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <Card sx={{ flex: 1.5, background: 'linear-gradient(135deg, #FFFDE7 0%, #FFFFFF 100%)', border: '1px solid #FFECB3' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography color="text.secondary" variant="subtitle2" fontWeight={600} mb={1}>ยอดเงินสนับสนุนรวม</Typography>
                                    <Typography variant="h3" fontWeight={900} color="primary.dark" sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                        ฿{totalDonationAmount.toLocaleString()}
                                    </Typography>
                                </Box>
                                <Box sx={{ bgcolor: '#FFF3E0', p: 2, borderRadius: '50%' }}>
                                    <PaymentsIcon sx={{ fontSize: 40, color: '#FF9800' }} />
                                </Box>
                            </Stack>
                        </CardContent>
                    </Card>
                    <Card sx={{ flex: 1, bgcolor: '#fff' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Box>
                                    <Typography color="text.secondary" variant="subtitle2" fontWeight={600} mb={1}>จำนวนรายการ</Typography>
                                    <Typography variant="h4" fontWeight={800} color="text.primary">{totalDonationCount}</Typography>
                                </Box>
                                <Box sx={{ bgcolor: '#E3F2FD', p: 1.5, borderRadius: '50%' }}>
                                    <ReceiptLongIcon sx={{ fontSize: 32, color: '#1976D2' }} />
                                </Box>
                            </Stack>
                            <Button component={Link} to="/admin/donations" endIcon={<ArrowForwardIcon />} sx={{ mt: 2 }} fullWidth variant="outlined" size="small" color="primary">
                                ดูรายชื่อทั้งหมด
                            </Button>
                        </CardContent>
                    </Card>
                </Stack>
                
                {recentDonations.length > 0 && (
                  <Card sx={{ mt: 2 }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                        รายการโอนล่าสุด
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                                <TableCell>เวลา</TableCell>
                                <TableCell>ชื่อผู้บริจาค</TableCell>
                                <TableCell align="right">ยอดเงิน</TableCell>
                                <TableCell align="right">ช่องทาง</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {recentDonations.map((d) => (
                              <TableRow key={d._id} hover>
                                <TableCell sx={{ color: 'text.secondary' }}>{new Date(d.createdAt).toLocaleString("th-TH")}</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{d.firstName} {d.lastName}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: "bold", color: "success.main" }}>+{d.amount.toLocaleString()}</TableCell>
                                <TableCell align="right">
                                  <Chip label={d.source === 'PRE_REGISTER' ? 'ลงทะเบียน' : 'อื่นๆ'} size="small" color="success" variant="outlined" sx={{ fontWeight: 600, fontSize: 11 }} />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}

            {/* Charts Grid */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={3} mb={4}>
                <Card sx={{ flex: 1 }}>
                    <CardContent>
                        <Typography variant="h6" fontWeight={800} gutterBottom>สถานะผู้เข้าร่วม</Typography>
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={5} dataKey="value">
                                    <Cell fill="#66BB6A" />
                                    <Cell fill="#BDBDBD" />
                                    <Cell fill="#EF5350" />
                                </Pie>
                                <ReTooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Legend verticalAlign="bottom" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card sx={{ flex: 1 }}>
                    <CardContent>
                        <Typography variant="h6" fontWeight={800} gutterBottom>ช่องทางลงทะเบียน</Typography>
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={channelPieData} cx="50%" cy="50%" outerRadius={95} dataKey="value" paddingAngle={2}>
                                    <Cell fill="#42A5F5" />
                                    <Cell fill="#FFCA28" />
                                </Pie>
                                <ReTooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Legend verticalAlign="bottom" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </Stack>

            {/* Bar Chart */}
            <Card sx={{ mb: 4 }}>
                <CardContent>
                    <Typography variant="h6" fontWeight={800} gutterBottom>แนวโน้มการเช็คอิน (รายชั่วโมง)</Typography>
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={checkinByHourData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{fill: '#9E9E9E', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9E9E9E', fontSize: 12}} />
                            <ReTooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey={checkinHourKey} fill="url(#colorGradient)" radius={[6, 6, 0, 0]} barSize={40}>
                                {checkinByHourData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#FFC107' : '#FFB300'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Tables Section - Modernized */}
            <Stack spacing={4}>
                {/* Staff Contribution */}
                {(checkedInByStaffView.length > 0 || registeredByStaffView.length > 0) && (
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={800} gutterBottom color="primary.dark">ผลงานเจ้าหน้าที่ (Staff Contribution)</Typography>
                      <Stack direction={{ xs: "column", lg: "row" }} spacing={4} mt={2}>
                        {checkedInByStaffView.length > 0 && (
                            <Box flex={1}>
                                <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
                                    Top 5 ช่วยเช็คอิน (รวม {checkedInByStaffView.reduce((s, r) => s + (r.count || 0), 0)})
                                </Typography>
                                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 3 }}>
                                    <Table size="small">
                                        <TableHead><TableRow><TableCell>ชื่อ</TableCell><TableCell align="right">จำนวน</TableCell><TableCell align="right">%</TableCell></TableRow></TableHead>
                                        <TableBody>
                                            {checkedInByStaffView.slice(0, 5).map((u, i) => (
                                                <TableRow key={i} hover>
                                                    <TableCell sx={{ fontWeight: 500 }}>{u.name}</TableCell>
                                                    <TableCell align="right">{u.count}</TableCell>
                                                    <TableCell align="right"><Chip label={`${u.percent.toFixed(1)}%`} size="small" sx={{ bgcolor: '#FFF8E1', color: '#FF8F00', fontWeight: 700, height: 20, fontSize: 11 }} /></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}
                        {registeredByStaffView.length > 0 && (
                            <Box flex={1}>
                                <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
                                    Top 5 ช่วยลงทะเบียน (รวม {registeredByStaffView.reduce((s, r) => s + (r.count || 0), 0)})
                                </Typography>
                                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 3 }}>
                                    <Table size="small">
                                        <TableHead><TableRow><TableCell>ชื่อ</TableCell><TableCell align="right">จำนวน</TableCell><TableCell align="right">%</TableCell></TableRow></TableHead>
                                        <TableBody>
                                            {registeredByStaffView.slice(0, 5).map((u, i) => (
                                                <TableRow key={i} hover>
                                                    <TableCell sx={{ fontWeight: 500 }}>{u.name}</TableCell>
                                                    <TableCell align="right">{u.count}</TableCell>
                                                    <TableCell align="right"><Chip label={`${u.percent.toFixed(1)}%`} size="small" sx={{ bgcolor: '#E3F2FD', color: '#1976D2', fontWeight: 700, height: 20, fontSize: 11 }} /></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                )}

                {/* By Registration Point */}
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={800} gutterBottom>สถิติตามจุดลงทะเบียน</Typography>
                    <TableContainer sx={{ maxHeight: 400 }}>
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>จุดลงทะเบียน</TableCell>
                            <TableCell align="center">ลงทะเบียน</TableCell>
                            <TableCell align="center">เช็คอิน</TableCell>
                            <TableCell align="center">ผู้ติดตาม(ช)</TableCell>
                            <TableCell align="center">รวมคน(ช)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(summary?.byRegistrationPoint || []).map((point, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell sx={{ fontWeight: 600, color: 'primary.dark' }}>{point.pointName}</TableCell>
                              <TableCell align="center">{point.registered}</TableCell>
                              <TableCell align="center" sx={{ bgcolor: '#F1F8E9', color: 'success.dark', fontWeight: 700 }}>{point.checkedIn}</TableCell>
                              <TableCell align="center">{point.followerCheckedIn}</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700 }}>{point.totalCheckedInPeople}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>

                {/* Other Stats (Dept & Year) */}
                <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
                    <Card sx={{ flex: 1 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={800} gutterBottom>แยกตามภาควิชา</Typography>
                            <TableContainer sx={{ maxHeight: 350 }}>
                                <Table stickyHeader size="small">
                                    <TableHead><TableRow><TableCell>ภาควิชา</TableCell><TableCell align="right">ลงทะเบียน</TableCell><TableCell align="right">เช็คอิน</TableCell></TableRow></TableHead>
                                    <TableBody>
                                        {(summary?.byDepartment || []).map((d, i) => (
                                            <TableRow key={i} hover>
                                                <TableCell>{d.department}</TableCell>
                                                <TableCell align="right">{d.registered}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>{d.checkedIn}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                    <Card sx={{ flex: 1 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={800} gutterBottom>แยกตามปีการศึกษา</Typography>
                            <TableContainer sx={{ maxHeight: 350 }}>
                                <Table stickyHeader size="small">
                                    <TableHead><TableRow><TableCell>ปีการศึกษา</TableCell><TableCell align="right">ลงทะเบียน</TableCell><TableCell align="right">เช็คอิน</TableCell></TableRow></TableHead>
                                    <TableBody>
                                        {(summary?.byYear || []).map((y, i) => (
                                            <TableRow key={i} hover>
                                                <TableCell>{y.year}</TableCell>
                                                <TableCell align="right">{y.registered}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>{y.checkedIn}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Stack>

                {/* Last Checked In */}
                {summary?.lastCheckedIn && (
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={800} gutterBottom>ผู้ที่เช็คอินล่าสุด</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead><TableRow><TableCell>ชื่อ</TableCell><TableCell align="right">เวลา</TableCell></TableRow></TableHead>
                          <TableBody>
                            {summary.lastCheckedIn.map(u => (
                              <TableRow key={u._id} hover>
                                <TableCell sx={{ fontWeight: 500 }}>{u.fullName}</TableCell>
                                <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>{new Date(u.checkedInAt).toLocaleTimeString('th-TH')}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                )}
            </Stack>

            {/* [NEW] ปุ่ม Download Excel */}
            <Box sx={{ textAlign: 'center', mt: 5 }}>
              <Button 
                variant="outlined" 
                color="success" // เปลี่ยนสีเป็นเขียว (สื่อถึง Excel)
                onClick={handleDownloadExcel} // เรียกใช้ฟังก์ชันใหม่
                startIcon={<ReceiptLongIcon />} 
                sx={{ borderRadius: 3, px: 4, py: 1.2, fontSize: 16, borderWidth: 2, '&:hover': { borderWidth: 2, bgcolor: '#E8F5E9' } }}
              >
                ดาวน์โหลดรายชื่อฉบับเต็ม (.xlsx)
              </Button>
            </Box>

          </ChartErrorBoundary>

          {loadingSummary && (
            <Fade in={loadingSummary} timeout={450}>
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(255,255,255,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <CircularProgress color="primary" />
              </Box>
            </Fade>
          )}
        </Container>

        <ChangePasswordDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </Box>
    </ThemeProvider>
  );
}

function MenuItemDropdown({ icon, menuItems }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  return (
    <>
      <Tooltip title="เมนูจัดการ">
        <Button onClick={e => setAnchorEl(e.currentTarget)} sx={{ minWidth: 48, width: 48, height: 48, borderRadius: '50%', p: 0, bgcolor: 'background.paper', color: 'secondary.main', border: '1px solid rgba(0,0,0,0.08)' }}>
            {icon}
        </Button>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} PaperProps={{ elevation: 8, sx: { mt: 1, minWidth: 220, borderRadius: 4 } }}>
        {menuItems.map(item => (
          <MenuItem key={item.label} component={Link} to={item.path} onClick={() => setAnchorEl(null)} sx={{ py: 1.5 }}>
            <Box sx={{ mr: 2, color: 'text.secondary', display: 'flex' }}>{item.icon}</Box>
            <Typography fontWeight={600}>{item.label}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}