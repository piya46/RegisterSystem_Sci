// frontend/src/pages/DashboardPage.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import useAuth from "../hooks/useAuth";
import {
  AppBar, Toolbar, Box, Typography, Button, Avatar,
  Stack, Chip, Card, CardContent, Container, Tooltip, Menu, MenuItem, Divider, CssBaseline, Switch, Skeleton, Fade, FormControlLabel
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
import { Link } from "react-router-dom";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import getAvatarUrl from "../utils/getAvatarUrl";

import { PieChart, Pie, Cell, Legend } from "recharts";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, LineChart, Line
} from "recharts";

/* ====== NEW: Error Boundary ป้องกันกราฟพังทั้งหน้า ====== */
class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    // คุณอาจส่ง log ไปบริการภายนอกได้ที่นี่
    // console.error("Chart error:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card sx={{ mb: 4, border: "1px dashed #f44336" }}>
          <CardContent>
            <Typography color="error" fontWeight={700}>กราฟแสดงผลผิดพลาด</Typography>
            <Typography variant="body2" color="text.secondary">
              โปรดลองกดรีเฟรชสรุปข้อมูล หรือปรับตัวเลือกการแสดงผล (นับรวมผู้ติดตาม)
            </Typography>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

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
      ...(mode === "light"
        ? {
            primary: { main: "#ffc107", light: "#fff350", dark: "#c79100" },
            secondary: { main: "#ffb300", light: "#ffe54c", dark: "#c68400" },
            background: {
              default: "linear-gradient(120deg,#fff8e1 0%,#fffde7 100%)",
              paper: "#fff",
            },
            info: { main: "#64b5f6" }
          }
        : {
            primary: { main: "#ffc107", light: "#fff350", dark: "#c79100" },
            secondary: { main: "#ffb300", light: "#ffe54c", dark: "#c68400" },
            background: {
              default: "linear-gradient(120deg,#663d00 0%,#3d2600 100%)",
              paper: "#5a3e00",
            },
            info: { main: "#64b5f6" }
          }),
    },
    typography: {
      fontFamily: "Prompt, Kanit, Roboto, Arial, sans-serif",
      fontWeightBold: 700,
    },
    shape: { borderRadius: 18 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            fontWeight: 500,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: mode === "light"
              ? "linear-gradient(90deg,#ffecb3 0%,#ffca28 100%)"
              : "linear-gradient(90deg,#a56d00 0%,#794e00 100%)",
            boxShadow: "0 3px 24px 0 rgba(255,193,7,0.4)",
          },
        },
      },
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
  const [loadingSummary, setLoadingSummary] = useState(false);

  // toggle: รวมผู้ติดตามในกราฟ
  const [withFollowers, setWithFollowers] = useState(true);

  // Refresh Countdown
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const countdownRef = useRef(null);
  const fetchSummaryRef = useRef(null);

  async function fetchSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetch("/api/dashboard/summary", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setSummary(null);
      console.error("Failed to fetch summary", err);
    }
    setLoadingSummary(false);
    setRefreshCountdown(60);
  }

  async function handleDownloadCsv() {
    try {
      const res = await fetch("/api/participants/export", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `participants_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export CSV failed:", e);
      alert("ดาวน์โหลดไม่สำเร็จ: " + (e?.message || "unknown error"));
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
    return () => {
      clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line
  }, [token]);

  const mainMenuFiltered = MAIN_MENU.filter(item => item.roles.some(r => roles.includes(r)));
  const manageMenuFiltered = MANAGE_MENU.filter(item => item.roles.some(r => roles.includes(r)));

  const displayName = user?.fullName || user?.username || "";
  const displayShort = displayName.length > 5 ? displayName.slice(0, 5) + "..." : displayName;

  // Skeleton utility
  function skel(h = 48, w = 100) { return <Skeleton variant="rectangular" height={h} width={w} animation="wave" />; }

  /* ====== NEW: เตรียมข้อมูลกราฟด้วย useMemo เพื่อลด re-render ====== */
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

  // === สถิติผู้ติดตาม (memo คำนวณใน view เพื่อให้อ่านง่าย) ===
  const fStat = summary?.statusBreakdown?.followers || {};
  const followersRegisteredTotal =
    typeof fStat.total === "number" ? fStat.total : (typeof summary?.totalFollowers === "number" ? summary.totalFollowers : 0);
  const followersCheckedInTotal =
    typeof fStat.checkedIn === "number" ? fStat.checkedIn : (typeof summary?.checkedInFollowers === "number" ? summary.checkedInFollowers : 0);

  // dataKey สำหรับกราฟแนวโน้ม/รายชั่วโมง
  const regByDayKey = withFollowers ? "totalCount" : "count";
  const checkinHourKey = withFollowers ? "totalCount" : "participantCount";

  // === Staff contributions ===
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
      <Box sx={{
        minHeight: "100vh",
        bgcolor: theme =>
          theme.palette.mode === "dark"
            ? "linear-gradient(120deg,#663d00 0%,#3d2600 100%)"
            : "linear-gradient(120deg,#fff8e1 0%,#fffde7 100%)",
        pb: 3
      }}>
        <AppBar position="static" color="default" elevation={2}>
          <Toolbar
            sx={{
              px: { xs: 1, md: 3 },
              minHeight: 66,
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "nowrap"
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mr: 1 }}>
              <Avatar
                src={getAvatarUrl(user)}
                sx={{
                  bgcolor: "primary.main",
                  width: 38,
                  height: 38,
                  fontWeight: 700,
                  fontSize: 18,
                  border: user?.avatar ? "2px solid #ffb300" : undefined,
                }}
              >
                {!user?.avatar && getInitial(displayName)}
              </Avatar>
              <Typography
                variant="h6"
                fontWeight="bold"
                color="primary"
                sx={{
                  fontSize: { xs: "1.05rem", sm: "1.15rem", md: "1.25rem" },
                  whiteSpace: "nowrap",
                  textShadow: "0 1px 0 #fff5"
                }}
              >
                Event Dashboard
              </Typography>
            </Stack>

            {/* เมนูหลักแบบปุ่ม pill */}
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, ml: { xs: 0.5, md: 2 } }}>
              {mainMenuFiltered.map(item => (
                <Button
                  key={item.label}
                  component={Link}
                  to={item.path}
                  startIcon={item.icon}
                  sx={{
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: 999,
                    px: 1.6,
                    py: 1.0,
                    fontSize: { xs: 13, md: 15 },
                    color: "primary.dark",
                    bgcolor: "rgba(255,193,7,0.12)",
                    "&:hover": { bgcolor: "rgba(255,193,7,0.22)" },
                    whiteSpace: "nowrap"
                  }}
                >
                  {item.label}
                </Button>
              ))}
              {manageMenuFiltered.length === 1 ? (
                <Button
                  key={manageMenuFiltered[0].label}
                  component={Link}
                  to={manageMenuFiltered[0].path}
                  startIcon={manageMenuFiltered[0].icon}
                  sx={{
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: 999,
                    px: 1.6,
                    py: 1.0,
                    fontSize: { xs: 13, md: 15 },
                    color: "secondary.dark",
                    bgcolor: "rgba(255,179,0,0.12)",
                    "&:hover": { bgcolor: "rgba(255,179,0,0.22)" },
                    whiteSpace: "nowrap"
                  }}
                >
                  {manageMenuFiltered[0].label}
                </Button>
              ) : (
                manageMenuFiltered.length > 1 &&
                  <MenuItemDropdown label="จัดการ" icon={<SettingsIcon />} menuItems={manageMenuFiltered} />
              )}
            </Stack>

            <Stack direction="row" alignItems="center" spacing={0}>
              <Tooltip title={displayName}>
                <Button
                  color="inherit"
                  sx={{
                    px: 1.6,
                    py: 0.7,
                    fontWeight: "bold",
                    borderRadius: 3,
                    color: "primary.dark",
                    fontSize: { xs: 15, md: 16 }
                  }}
                  startIcon={
                    <Avatar
                      src={getAvatarUrl(user)}
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: "primary.main",
                        fontSize: 17,
                        fontWeight: 700,
                        border: user?.avatar ? "2px solid #ffb300" : undefined,
                      }}
                    >
                      {!user?.avatar && getInitial(displayName)}
                    </Avatar>
                  }
                  endIcon={<ExpandMoreIcon />}
                  onClick={e => setProfileAnchorEl(e.currentTarget)}
                >
                  <Box sx={{
                    textAlign: "left",
                    maxWidth: 68,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: 700,
                    fontSize: { xs: 15, sm: 16 },
                    letterSpacing: 0.5
                  }}>
                    {displayShort}
                  </Box>
                </Button>
              </Tooltip>
              <Menu
                anchorEl={profileAnchorEl}
                open={openProfile}
                onClose={() => setProfileAnchorEl(null)}
                PaperProps={{
                  elevation: 4,
                  sx: {
                    mt: 1,
                    minWidth: 230,
                    borderRadius: 2,
                    boxShadow: "0 6px 32px 0 rgba(0,0,0,0.10)"
                  }
                }}
              >
                <Box sx={{ p: 1, pb: 0, display: "flex", alignItems: "center" }}>
                  <Avatar
                    src={getAvatarUrl(user)}
                    sx={{ width: 36, height: 36, bgcolor: "primary.main", mr: 1, border: user?.avatar ? "2px solid #ffb300" : undefined }}
                  >
                    {!user?.avatar && getInitial(displayName)}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontWeight: 500 }}>
                      {displayName}
                    </Typography>
                    <Chip
                      label={(Array.isArray(user?.role) ? user.role : [user?.role]).filter(Boolean).map(r => String(r).toUpperCase()).join(", ")}
                      color="secondary"
                      size="small"
                      sx={{ fontWeight: "bold", letterSpacing: 1, mt: 0.3 }}
                    />
                  </Box>
                </Box>
                <Divider sx={{ my: 1 }} />
                <MenuItem component={Link} to="/profile" onClick={() => setProfileAnchorEl(null)}>
                  <PersonIcon sx={{ mr: 1 }} /> จัดการโปรไฟล์
                </MenuItem>
                <MenuItem onClick={() => { setProfileAnchorEl(null); setDialogOpen(true); }}>
                  <VpnKeyIcon sx={{ mr: 1 }} /> เปลี่ยนรหัสผ่าน
                </MenuItem>
                <MenuItem onClick={() => { setProfileAnchorEl(null); logout(); }}>
                  <LogoutIcon sx={{ mr: 1 }} /> Logout
                </MenuItem>
                <Divider sx={{ my: 1 }} />
                <MenuItem onClick={() => setDarkMode(v => !v)}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                    {darkMode ? <Brightness7Icon sx={{ mr: 1 }} /> : <Brightness4Icon sx={{ mr: 1 }} />}
                    {darkMode ? "Light Mode" : "Dark Mode"}
                    <Switch checked={darkMode} onChange={e => setDarkMode(e.target.checked)} sx={{ ml: "auto" }} />
                  </Box>
                </MenuItem>
              </Menu>
            </Stack>
          </Toolbar>
        </AppBar>

        <Container maxWidth="md" sx={{ mt: 4, mb: 5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom color="primary">
              รายงานสรุปข้อมูลผู้เข้าร่วม
            </Typography>
            <Stack direction="row" alignItems="center" spacing={2}>
              <FormControlLabel
                control={<Switch checked={withFollowers} onChange={e => setWithFollowers(e.target.checked)} />}
                label="นับรวมผู้ติดตามในกราฟ"
              />
              <Typography variant="body2" color="text.secondary">
                รีเฟรชอัตโนมัติใน {refreshCountdown} วินาที
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                onClick={() => {
                  fetchSummary();
                }}
                disabled={loadingSummary}
                sx={{ minWidth: 40 }}
              >
                {loadingSummary ? <span>...</span> : "รีเฟรช"}
              </Button>
            </Stack>
          </Stack>

          {/* ====== VIEW หลัก: ครอบด้วย ErrorBoundary และลด re-render ด้วย useMemo ข้อมูลกราฟ ====== */}
          <ChartErrorBoundary>
            {/* KPI Cards — หลัก */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} mb={4}>
              <Card sx={{ flex: 1, bgcolor: "primary.light", color: "#4a2c00" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6">ลงทะเบียนทั้งหมด (รายการ)</Typography>
                  <Typography variant="h3">{summary?.totalRegistered ?? 0}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, bgcolor: "success.light", color: "#155724" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6">เช็คอินแล้ว (รายการ)</Typography>
                  <Typography variant="h3">{summary?.checkedIn ?? 0}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, bgcolor: "info.light", color: "#155724" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6">อัตราเช็คอิน</Typography>
                  <Typography variant="h3">{summary?.checkinRate ?? 0}%</Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, bgcolor: "#ffe0b2", color: "#e65100" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6">คนทั้งหมดที่เช็คอิน</Typography>
                  <Typography variant="h3">{summary?.totalPeopleCheckedIn ?? 0}</Typography>
                </CardContent>
              </Card>
            </Stack>

            {/* KPI — ผู้ติดตาม */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} mb={4}>
              <Card sx={{ flex: 1, bgcolor: "#e3f2fd", color: "#0d47a1" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6">ผู้ติดตามลงทะเบียน</Typography>
                  <Typography variant="h3">{followersRegisteredTotal}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, bgcolor: "#e8f5e9", color: "#1b5e20" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h6">ผู้ติดตามเช็คอิน</Typography>
                  <Typography variant="h3">{followersCheckedInTotal}</Typography>
                </CardContent>
              </Card>
            </Stack>

            {/* Donut — สถานะรวม */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">
                  สถานะภาพรวม {withFollowers ? "(รวมผู้ติดตาม = คน)" : "(เฉพาะรายการ)"}
                </Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                      label={({ name, percent }) => `${name} - ${(percent * 100).toFixed(1)}%`}
                      isAnimationActive={false}   // กันกระตุก/รีเพนต์ถี่
                      dataKey="value"
                    >
                      <Cell fill="#4caf50" />
                      <Cell fill="#ff9800" />
                      <Cell fill="#f44336" />
                    </Pie>
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ช่องทางลงทะเบียน */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">ช่องทางลงทะเบียน (รายการ)</Typography>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={channelPieData}
                      cx="50%" cy="50%" outerRadius={80}
                      label={({ name, value, percent }) =>
                        `${name} : ${value} รายการ (${(percent * 100).toFixed(1)}%)`
                      }
                      isAnimationActive={false}
                      dataKey="value"
                    >
                      <Cell fill="#2196f3" />
                      <Cell fill="#ffb300" />
                    </Pie>
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Peak */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">Peak</Typography>
                <Typography>
                  <b>วันที่คนลงทะเบียนเยอะสุด (รายการ):</b> {summary?.peakDay || "-"} <b>({summary?.peakDayCount ?? 0} รายการ)</b>
                </Typography>
                <Typography>
                  <b>ชั่วโมงที่เช็คอินเยอะสุด ({withFollowers ? "คน" : "รายการ"}):</b>{" "}
                  {typeof summary?.peakHour === "number" ? `${summary.peakHour}:00 น.` : "-"}{" "}
                  <b>({summary?.peakHourCount ?? 0} {withFollowers ? "คน" : "รายการ"})</b>
                </Typography>
              </CardContent>
            </Card>

            {/* ผู้ลงทะเบียนใหม่ 7 วัน */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">ผู้ลงทะเบียนใหม่ 7 วันล่าสุด (รายการ)</Typography>
                <Typography variant="h3">{summary?.newParticipantsLast7Days ?? 0}</Typography>
                <Typography color="textSecondary">
                  เปรียบเทียบสัปดาห์ก่อนหน้า: <b>{summary?.growthRate ?? "0.00"}%</b>
                </Typography>
              </CardContent>
            </Card>

            {/* แนวโน้มลงทะเบียนรายวัน */}
            {(registrationByDayData || []).length > 0 && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold">
                    แนวโน้มการลงทะเบียน (รายวัน) {withFollowers ? "(คน)" : "(รายการ)"}
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={registrationByDayData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" />
                      <YAxis allowDecimals={false} />
                      <ReTooltip />
                      <Line type="monotone" dataKey={regByDayKey} stroke="#ffb300" strokeWidth={3} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* เช็คอินรายชั่วโมง */}
            {(checkinByHourData || []).length > 0 && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold">
                    จำนวนเช็คอินรายชั่วโมง {withFollowers ? "(คน)" : "(รายการ)"}
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={checkinByHourData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" label={{ value: "ชั่วโมง", position: "insideBottom", offset: 0 }} />
                      <YAxis allowDecimals={false} />
                      <ReTooltip />
                      <Bar dataKey={checkinHourKey} fill="#ffb300" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* === สรุปตามเจ้าหน้าที่ === */}
            {(checkedInByStaffView.length > 0 || registeredByStaffView.length > 0) && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold">สรุปตามเจ้าหน้าที่ (Staff Contribution)</Typography>

                  {/* เจ้าหน้าที่ช่วยเช็คอิน */}
                  {checkedInByStaffView.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography sx={{ fontWeight: 600, mb: 1 }}>
                        เจ้าหน้าที่ที่ช่วยเช็คอิน (รวม {checkedInByStaffView.reduce((s, r) => s + (r.count || 0), 0)} รายการ)
                      </Typography>
                      <Box sx={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                          <thead>
                            <tr style={{ background: "#fff8e1" }}>
                              <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>ชื่อผู้ใช้</th>
                              <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "right" }}>จำนวนที่เช็คอิน</th>
                              <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "right" }}>% ส่วนแบ่ง</th>
                            </tr>
                          </thead>
                          <tbody>
                            {checkedInByStaffView.map((u) => (
                              <tr key={String(u.userId || u._id || u.username || u.name)}>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{u.name}</td>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>{u.count || 0}</td>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>
                                  {u.percent.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Box>

                      {/* กราฟแท่ง: เช็คอินตามเจ้าหน้าที่ */}
                      <Box sx={{ mt: 2 }}>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={checkedInByStaffView}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <ReTooltip />
                            <Bar dataKey="count" fill="#ffb300" isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                  )}

                  {/* เจ้าหน้าที่ช่วยลงทะเบียน */}
                  {registeredByStaffView.length > 0 && (
                    <Box sx={{ mt: 4 }}>
                      <Typography sx={{ fontWeight: 600, mb: 1 }}>
                        เจ้าหน้าที่ที่ช่วยลงทะเบียน (รวม {registeredByStaffView.reduce((s, r) => s + (r.count || 0), 0)} รายการ)
                      </Typography>
                      <Box sx={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                          <thead>
                            <tr style={{ background: "#fff8e1" }}>
                              <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "left" }}>ชื่อผู้ใช้</th>
                              <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "right" }}>จำนวนที่ลงทะเบียน</th>
                              <th style={{ padding: 8, borderBottom: "1px solid #ddd", textAlign: "right" }}>% ส่วนแบ่ง</th>
                            </tr>
                          </thead>
                          <tbody>
                            {registeredByStaffView.map((u) => (
                              <tr key={String(u.userId || u._id || u.username || u.name)}>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{u.name}</td>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>{u.count || 0}</td>
                                <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>
                                  {u.percent.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Box>

                      {/* กราฟแท่ง: ลงทะเบียนตามเจ้าหน้าที่ */}
                      <Box sx={{ mt: 2 }}>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={registeredByStaffView}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <ReTooltip />
                            <Bar dataKey="count" fill="#64b5f6" isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ตาราง: ภาควิชา */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">สถิติแยกตามภาควิชา</Typography>
                <Box sx={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ background: "#fff8e1" }}>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ภาควิชา</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ลงทะเบียน(รายการ)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>เช็คอิน(รายการ)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ยกเลิก</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ผู้ติดตาม(ลงทะเบียน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ผู้ติดตาม(เช็คอิน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>รวมคน(ลงทะเบียน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>รวมคน(เช็คอิน)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.byDepartment || []).map(dep => (
                        <tr key={dep.department}>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.department}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.registered}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.checkedIn}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.cancelled}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.followerRegistered}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.followerCheckedIn}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.totalRegisteredPeople}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{dep.totalCheckedInPeople}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </CardContent>
            </Card>

            {/* ตาราง: ปีการศึกษา */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">สถิติแยกตามปีการศึกษา</Typography>
                <Box sx={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ background: "#fff8e1" }}>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>ปีการศึกษา</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>ลงทะเบียน(รายการ)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>เช็คอิน(รายการ)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>ยกเลิก</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>ผู้ติดตาม(ลงทะเบียน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>ผู้ติดตาม(เช็คอิน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>รวมคน(ลงทะเบียน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid " }}>รวมคน(เช็คอิน)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.byYear || []).map(y => (
                        <tr key={y.year}>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.year}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.registered}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.checkedIn}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.cancelled}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.followerRegistered}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.followerCheckedIn}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.totalRegisteredPeople}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{y.totalCheckedInPeople}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </CardContent>
            </Card>

            {/* ตาราง: จุดลงทะเบียน */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">สถิติแต่ละจุดลงทะเบียน</Typography>
                <Box sx={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ background: "#fff8e1" }}>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>จุดลงทะเบียน</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ลงทะเบียน(รายการ)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>เช็คอิน(รายการ)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ยกเลิก</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ผู้ติดตาม(ลงทะเบียน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ผู้ติดตาม(เช็คอิน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>รวมคน(ลงทะเบียน)</th>
                        <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>รวมคน(เช็คอิน)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.byRegistrationPoint || []).map(point => (
                        <tr key={String(point.pointId?.oid || point.pointId?.nameKey || point.pointId || point.pointName)}>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.pointName}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.registered}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.checkedIn}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.cancelled}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.followerRegistered}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.followerCheckedIn}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.totalRegisteredPeople}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{point.totalCheckedInPeople}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </CardContent>
            </Card>

            {/* ผู้ที่เช็คอินล่าสุด */}
            {summary?.lastCheckedIn && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold">ผู้ที่เช็คอินล่าสุด</Typography>
                  <Box sx={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                      <thead>
                        <tr style={{ background: "#fff8e1" }}>
                          <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>ชื่อ</th>
                          <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>เวลาเช็คอิน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.lastCheckedIn.map(u => (
                          <tr key={u._id}>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{u.fullName}</td>
                            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{new Date(u.checkedInAt).toLocaleString("th-TH")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </CardContent>
              </Card>
            )}

            <Box sx={{ mb: 3 }}>
              <Button variant="outlined" color="secondary" onClick={handleDownloadCsv}>
                ดาวน์โหลดรายชื่อ (Excel)
              </Button>
            </Box>
          </ChartErrorBoundary>

          {loadingSummary && (
            <Fade in={loadingSummary} timeout={450}>
              <Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={3} mb={4}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Card key={n}><CardContent>{skel(48, 120)}</CardContent></Card>
                  ))}
                </Stack>
                {[1, 2, 3, 4].map((n) => (
                  <Card key={n} sx={{ mb: 3 }}><CardContent>{skel(180, "100%")}</CardContent></Card>
                ))}
              </Box>
            </Fade>
          )}
        </Container>

        <ChangePasswordDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </Box>
    </ThemeProvider>
  );
}

function MenuItemDropdown({ label, icon, menuItems }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  return (
    <>
      <Button
        onClick={e => setAnchorEl(e.currentTarget)}
        endIcon={<ExpandMoreIcon />}
        startIcon={icon}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 999,
          px: 1.6,
          py: 1.0,
          fontSize: { xs: 13, md: 15 },
          color: "secondary.dark",
          bgcolor: "rgba(255,179,0,0.12)",
          "&:hover": { bgcolor: "rgba(255,179,0,0.22)" },
          whiteSpace: "nowrap"
        }}
      >
        {label}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{
          elevation: 4,
          sx: {
            mt: 1,
            minWidth: 220,
            borderRadius: 2,
            boxShadow: "0 6px 32px 0 rgba(0,0,0,0.10)",
          }
        }}
      >
        {menuItems.map(item => (
          <MenuItem
            key={item.label}
            component={Link}
            to={item.path}
            onClick={() => setAnchorEl(null)}
            sx={{ py: 1.3, px: 2, fontWeight: 500, fontSize: 15 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {item.icon}
              <span>{item.label}</span>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
