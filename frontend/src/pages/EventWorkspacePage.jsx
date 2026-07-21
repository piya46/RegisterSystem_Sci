import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SettingsIcon from "@mui/icons-material/Settings";
import DesignServicesIcon from "@mui/icons-material/DesignServices";
import PeopleIcon from "@mui/icons-material/People";
import QrCodeIcon from "@mui/icons-material/QrCode2";
import StoreIcon from "@mui/icons-material/Store";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PublicIcon from "@mui/icons-material/Public";
import SearchIcon from "@mui/icons-material/Search";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import useAuth from "../hooks/useAuth";
import { getEventCatalog } from "../utils/api";
import { EmptyState, LoadingState } from "../components/FeedbackStates";

const RECENT_EVENTS_KEY = "psevent.recentEvents";

const statusLabels = {
  draft: "ร่าง",
  published: "เผยแพร่",
  registration_open: "เปิดลงทะเบียน",
  registration_closed: "ปิดลงทะเบียน",
  event_day: "วันจัดงาน",
  active: "ใช้งาน",
  archived: "เก็บย้อนหลัง",
};

const statusColors = {
  draft: "default",
  published: "info",
  registration_open: "success",
  registration_closed: "warning",
  event_day: "secondary",
  active: "success",
  archived: "default",
};

function getId(value) {
  return value?._id || value?.id || value || "";
}

function rolesOf(user) {
  return Array.isArray(user?.role) ? user.role.filter(Boolean) : [user?.role].filter(Boolean);
}

function hasAnyRole(user, roles) {
  const userRoles = rolesOf(user);
  return userRoles.includes("superadmin") || roles.some((role) => userRoles.includes(role));
}

function toolPath(path, event) {
  const params = new URLSearchParams();
  if (event?.eventYear) params.set("eventYear", event.eventYear);
  const eventId = getId(event);
  if (eventId) params.set("eventId", eventId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}


export default function EventWorkspacePage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState({ events: [], organizations: [], series: [], settings: {} });
  const [message, setMessage] = useState("");

  const canManageSystem = hasAnyRole(user, ["admin", "org_admin", "event_admin", "event_manager"]);

  const loadCatalog = useCallback(async () => {
    setMessage("");
    try {
      const res = await getEventCatalog();
      const data = res.data?.data || {};
      setCatalog({
        events: data.events || [],
        organizations: data.organizations || [],
        series: data.series || [],
        settings: data.settings || {},
      });
    } catch (error) {
      setMessage(error.response?.data?.message || "โหลดรายการกิจกรรมไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectedEvent = useMemo(() => {
    if (eventId) return catalog.events.find((event) => getId(event) === eventId) || null;
    return null;
  }, [catalog.events, eventId]);



  const filteredEvents = useMemo(() => {
    const currentId = getId(catalog.settings?.currentEventId);
    return [...(catalog.events || [])]
      .sort((a, b) => {
        if (getId(a) === currentId) return -1;
        if (getId(b) === currentId) return 1;
        return String(b.eventYear || "").localeCompare(String(a.eventYear || ""));
      });
  }, [catalog.events, catalog.settings?.currentEventId]);

  const organizationById = useMemo(
    () => Object.fromEntries(catalog.organizations.map((item) => [getId(item), item])),
    [catalog.organizations]
  );
  const seriesById = useMemo(
    () => Object.fromEntries(catalog.series.map((item) => [getId(item), item])),
    [catalog.series]
  );

  const openTool = (path, event = selectedEvent, newTab = false) => {
    const finalPath = toolPath(path, event);
    if (newTab) {
      window.open(finalPath, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(finalPath);
  };


  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f6f8fb", py: 3 }}>
      <Container maxWidth="xl">
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between" spacing={2} mb={3}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Avatar sx={{ bgcolor: "#ffc107", color: "#4e342e", width: 48, height: 48 }}>
                <EventAvailableIcon />
              </Avatar>
              <Box>
                <Typography variant="h4" fontWeight={950} color="#263238">Event Workspace</Typography>
                <Typography color="text.secondary" fontWeight={700}>
                  เลือกกิจกรรมก่อน แล้วค่อยเปิดเครื่องมือจัดการของกิจกรรมนั้น
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {canManageSystem && (
              <Button startIcon={<AdminPanelSettingsIcon />} variant="contained" onClick={() => navigate("/admin/events")}>
                จัดการระบบกิจกรรม
              </Button>
            )}
          </Stack>
        </Stack>

        {message && <Alert severity={message.includes("คัดลอก") ? "success" : "error"} sx={{ mb: 2 }} onClose={() => setMessage("")}>{message}</Alert>}

        <Grid container spacing={3}>
          {catalog.events.length === 0 && (
            <Grid item xs={12}>
              <Alert severity="info">ยังไม่มีกิจกรรมที่ผูกกับบัญชีนี้ ติดต่อ Superadmin เพื่อมอบหมายสิทธิ์</Alert>
            </Grid>
          )}

          {catalog.events.length > 0 && filteredEvents.length === 0 && (
            <Grid item xs={12}>
              <Alert severity="info">ไม่พบกิจกรรมที่ตรงกับคำค้นหา</Alert>
            </Grid>
          )}

          {filteredEvents.map((event) => {
            const id = getId(event);
            const isCurrent = id === getId(catalog.settings?.currentEventId);
            const participants = Number(event.eventDataCounts?.participants || 0);
            const donations = Number(event.eventDataCounts?.donations || 0);

            return (
              <Grid item xs={12} sm={6} md={4} key={id}>
                <Card
                  sx={{
                    borderRadius: 2,
                    height: "100%",
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: "pointer",
                    transition: "all 0.2s",
                    borderColor: isCurrent ? "#ffc107" : "divider",
                    borderWidth: isCurrent ? 2 : 1,
                    borderStyle: "solid",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: 4,
                      borderColor: "#ffc107"
                    }
                  }}
                  onClick={() => openTool("/dashboard", event)}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
                      <Avatar
                        src={event.branding?.logoUrl}
                        sx={{
                          width: 56,
                          height: 56,
                          bgcolor: event.branding?.primaryColor || "#ffc107",
                          color: "#3e2723",
                          fontWeight: 900
                        }}
                      >
                        {String(event.name || "E").charAt(0)}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="h6" fontWeight={900} sx={{ lineHeight: 1.2, mb: 0.5 }}>
                          {event.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {organizationById[getId(event.organizationId)]?.name || "-"} / {seriesById[getId(event.seriesId)]?.name || "-"}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} mb={2}>
                      <Chip size="small" label={`ปี ${event.eventYear}`} />
                      {isCurrent && <Chip size="small" color="success" label="ปัจจุบัน" />}
                      <Chip size="small" color={statusColors[event.status] || "default"} label={statusLabels[event.status] || event.status} />
                      <Chip size="small" variant="outlined" label={event.linkingMode === "isolated" ? "แยกข้อมูล" : "งานต่อเนื่อง"} />
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        ผู้เข้าร่วม: {participants}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        สนับสนุน: {donations}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Container>
    </Box>
  );
}
