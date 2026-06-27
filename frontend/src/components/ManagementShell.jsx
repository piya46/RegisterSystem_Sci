import React, { useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Menu,
  MenuItem,
  Stack,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import DashboardIcon from "@mui/icons-material/Dashboard";
import QrCodeIcon from "@mui/icons-material/QrCode2";
import StoreIcon from "@mui/icons-material/Store";
import PeopleIcon from "@mui/icons-material/People";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SettingsIcon from "@mui/icons-material/Settings";
import GroupIcon from "@mui/icons-material/Group";
import TimelineIcon from "@mui/icons-material/Timeline";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import useAuth from "../hooks/useAuth";
import getAvatarUrl from "../utils/getAvatarUrl";
import { appendQuery, eventContextFromSearch, eventContextToParams } from "../utils/eventContext";

const managementTheme = createTheme({
  palette: {
    primary: { main: "#f6b700", dark: "#7a5200", contrastText: "#332400" },
    secondary: { main: "#1f7a5f", contrastText: "#ffffff" },
    background: { default: "#f6f8fb", paper: "#ffffff" },
    text: { primary: "#263238", secondary: "#667085" },
  },
  typography: {
    fontFamily: "'Prompt', 'Kanit', sans-serif",
    button: { textTransform: "none", fontWeight: 800 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          letterSpacing: 0,
          boxShadow: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 800 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 10px 30px rgba(16, 24, 40, 0.06)",
        },
      },
    },
  },
});

function rolesOf(user) {
  return Array.isArray(user?.role) ? user.role.filter(Boolean) : [user?.role].filter(Boolean);
}

function canSee(user, roles = []) {
  const userRoles = rolesOf(user);
  return userRoles.includes("superadmin") || roles.length === 0 || roles.some((role) => userRoles.includes(role));
}

const navGroups = [
  {
    label: "กิจกรรม",
    icon: <EventAvailableIcon fontSize="small" />,
    items: [
      { label: "เลือกกิจกรรม", path: "/workspace", roles: ["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff"] },
      { label: "จัดการกิจกรรม", path: "/admin/events", roles: ["admin", "org_admin", "event_admin", "event_manager"] },
      { label: "Migration ข้อมูลเดิม", path: "/admin/events/migration", roles: ["admin"], icon: <SyncAltIcon fontSize="small" /> },
    ],
  },
  {
    label: "ปฏิบัติงาน",
    icon: <QrCodeIcon fontSize="small" />,
    items: [
      { label: "ภาพรวม", path: "/dashboard", roles: ["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff", "kiosk"], icon: <DashboardIcon fontSize="small" /> },
      { label: "เช็คอินหน้างาน", path: "/staff", roles: ["admin", "staff"], icon: <QrCodeIcon fontSize="small" /> },
      { label: "เลือกจุดลงทะเบียน", path: "/staff/select-point", roles: ["admin", "staff"], icon: <StoreIcon fontSize="small" /> },
      { label: "เครื่องลงทะเบียน", path: "/kiosk", roles: ["admin", "staff", "kiosk"], icon: <StoreIcon fontSize="small" /> },
      { label: "สุ่มรางวัล", path: "/admin/lucky-draw", roles: ["admin"], icon: <EmojiEventsIcon fontSize="small" /> },
    ],
  },
  {
    label: "ข้อมูล",
    icon: <PeopleIcon fontSize="small" />,
    items: [
      { label: "ผู้เข้าร่วม", path: "/admin/participants", roles: ["admin"], icon: <PeopleIcon fontSize="small" /> },
      { label: "ผู้สนับสนุน", path: "/admin/donations", roles: ["admin"], icon: <VolunteerActivismIcon fontSize="small" /> },
      { label: "รายงานสด", path: "/public/report", roles: ["admin", "auditor"], icon: <TimelineIcon fontSize="small" /> },
    ],
  },
  {
    label: "ตั้งค่า",
    icon: <SettingsIcon fontSize="small" />,
    items: [
      { label: "ผู้ใช้และสิทธิ์", path: "/admin", exact: true, roles: ["admin"], icon: <GroupIcon fontSize="small" /> },
      { label: "จุดลงทะเบียน", path: "/registration-points", roles: ["admin"], icon: <StoreIcon fontSize="small" /> },
      { label: "ตั้งค่าระบบ", path: "/settings", roles: ["admin"], icon: <SettingsIcon fontSize="small" /> },
      { label: "Session", path: "/admin/sessions", roles: ["admin"], icon: <PersonIcon fontSize="small" /> },
      { label: "Cron", path: "/admin/cron-status", roles: ["admin"], icon: <TimelineIcon fontSize="small" /> },
    ],
  },
];

function initials(name = "") {
  return String(name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ManagementShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [anchorByGroup, setAnchorByGroup] = useState({});
  const [profileAnchor, setProfileAnchor] = useState(null);
  const eventParams = useMemo(
    () => eventContextToParams(eventContextFromSearch(location.search)),
    [location.search]
  );
  const displayName = user?.fullName || user?.username || "ผู้ใช้งาน";

  const visibleGroups = useMemo(
    () => navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canSee(user, item.roles)),
      }))
      .filter((group) => group.items.length > 0),
    [user]
  );

  const go = (path) => {
    setAnchorByGroup({});
    navigate(appendQuery(path, eventParams));
  };

  const isActiveItem = (item) => (
    item.exact ? location.pathname === item.path : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );

  return (
    <ThemeProvider theme={managementTheme}>
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: "rgba(255,255,255,0.96)", color: "text.primary", borderBottom: "1px solid #e4e7ec", backdropFilter: "blur(14px)" }}>
          <Container maxWidth="xl" disableGutters>
            <Toolbar sx={{ gap: 1.5, px: { xs: 1.5, md: 3 }, minHeight: 68 }}>
              <Button component={Link} to={appendQuery("/workspace", eventParams)} color="inherit" sx={{ px: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Avatar src="/logo.svg" variant="square" sx={{ width: 42, height: 42, bgcolor: "#fff", img: { objectFit: "contain" } }}>
                    <EventAvailableIcon />
                  </Avatar>
                  <Box sx={{ display: { xs: "none", md: "block" }, textAlign: "left" }}>
                    <Typography fontWeight={950} lineHeight={1.1}>Event OS</Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>จัดการกิจกรรมและหน้างาน</Typography>
                  </Box>
                </Stack>
              </Button>

              <Stack direction="row" spacing={0.75} sx={{ flex: 1, overflowX: "auto", py: 1 }}>
                {visibleGroups.map((group) => {
                  const active = group.items.some(isActiveItem);
                  const anchor = anchorByGroup[group.label] || null;
                  return (
                    <Box key={group.label}>
                      <Button
                        startIcon={group.icon}
                        endIcon={<ExpandMoreIcon fontSize="small" />}
                        onClick={(event) => setAnchorByGroup({ [group.label]: event.currentTarget })}
                        variant={active ? "contained" : "text"}
                        color={active ? "primary" : "inherit"}
                        sx={{ whiteSpace: "nowrap", height: 40, px: 1.5 }}
                      >
                        {group.label}
                      </Button>
                      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchorByGroup({})} PaperProps={{ sx: { mt: 1, minWidth: 230, borderRadius: 2 } }}>
                        {group.items.map((item) => (
                          <MenuItem key={item.path} selected={isActiveItem(item)} onClick={() => go(item.path)}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <Box sx={{ color: "primary.dark", display: "flex" }}>{item.icon || group.icon}</Box>
                              <Typography fontWeight={800}>{item.label}</Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </Menu>
                    </Box>
                  );
                })}
              </Stack>

              {(eventParams.eventId || eventParams.eventYear) && (
                <Chip
                  size="small"
                  color={eventParams.eventId ? "primary" : "default"}
                  variant={eventParams.eventId ? "filled" : "outlined"}
                  label={eventParams.eventId ? `Event ${eventParams.eventId.slice(-6)}` : `ปี ${eventParams.eventYear}`}
                  sx={{ display: { xs: "none", lg: "inline-flex" } }}
                />
              )}

              <Divider orientation="vertical" flexItem sx={{ my: 2, display: { xs: "none", md: "block" } }} />
              <Tooltip title={displayName}>
                <Button
                  color="inherit"
                  onClick={(event) => setProfileAnchor(event.currentTarget)}
                  sx={{ minWidth: 0, px: 0.75, border: "1px solid #e4e7ec", bgcolor: "#fff" }}
                >
                  <Avatar src={getAvatarUrl(user)} sx={{ width: 34, height: 34 }}>{initials(displayName)}</Avatar>
                </Button>
              </Tooltip>
              <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={() => setProfileAnchor(null)} PaperProps={{ sx: { mt: 1, minWidth: 220, borderRadius: 2 } }}>
                <Box sx={{ px: 2, py: 1.25 }}>
                  <Typography fontWeight={900}>{displayName}</Typography>
                  <Typography variant="caption" color="text.secondary">{rolesOf(user).join(", ") || "-"}</Typography>
                </Box>
                <Divider />
                <MenuItem onClick={() => { setProfileAnchor(null); navigate("/profile"); }}>
                  <PersonIcon sx={{ mr: 1.25 }} fontSize="small" /> โปรไฟล์
                </MenuItem>
                <MenuItem onClick={() => { setProfileAnchor(null); logout(); }} sx={{ color: "error.main" }}>
                  <LogoutIcon sx={{ mr: 1.25 }} fontSize="small" /> ออกจากระบบ
                </MenuItem>
              </Menu>
            </Toolbar>
          </Container>
        </AppBar>
        <Box>{children}</Box>
      </Box>
    </ThemeProvider>
  );
}
