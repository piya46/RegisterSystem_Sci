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

function readRecentEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_EVENTS_KEY) || "[]");
    return Array.isArray(value) ? value.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function featureEnabled(event, key) {
  return event?.config?.enabledFeatures?.[key] !== false;
}

export default function EventWorkspacePage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState({ events: [], organizations: [], series: [], settings: {} });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [recentEventIds, setRecentEventIds] = useState(readRecentEvents);

  const canManageSystem = hasAnyRole(user, ["admin", "org_admin", "event_admin", "event_manager"]);
  const canManageUsers = hasAnyRole(user, ["admin"]);
  const canWorkStaff = hasAnyRole(user, ["staff", "admin", "event_admin", "event_manager"]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectedEvent = useMemo(() => {
    if (eventId) return catalog.events.find((event) => getId(event) === eventId) || null;
    return null;
  }, [catalog.events, eventId]);

  useEffect(() => {
    const id = getId(selectedEvent);
    if (!id) return;
    setRecentEventIds((prev) => {
      const next = [id, ...prev.filter((item) => item !== id)].slice(0, 8);
      localStorage.setItem(RECENT_EVENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, [selectedEvent]);

  const recentEvents = useMemo(
    () => recentEventIds.map((id) => catalog.events.find((event) => getId(event) === id)).filter(Boolean),
    [catalog.events, recentEventIds]
  );

  const workspaceStats = useMemo(() => {
    const events = catalog.events || [];
    return {
      total: events.length,
      open: events.filter((event) => ["published", "registration_open", "event_day", "active"].includes(event.status)).length,
      draft: events.filter((event) => event.status === "draft").length,
      archived: events.filter((event) => event.status === "archived").length,
    };
  }, [catalog.events]);

  const filteredEvents = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const currentId = getId(catalog.settings?.currentEventId);
    return [...(catalog.events || [])]
      .filter((event) => {
        if (!keyword) return true;
        const haystack = [event.name, event.slug, event.eventYear, event.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => {
        if (getId(a) === currentId) return -1;
        if (getId(b) === currentId) return 1;
        return String(b.eventYear || "").localeCompare(String(a.eventYear || ""));
      });
  }, [catalog.events, catalog.settings?.currentEventId, query]);

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

  const copyPublicLink = async (event = selectedEvent) => {
    if (!event?.slug) return;
    const path = event.publicLinks?.landingPath || `/e/${event.slug}`;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setMessage("คัดลอกลิงก์กิจกรรมแล้ว");
  };

  if (loading) {
    return <LoadingState label="กำลังเตรียม Event Workspace..." minHeight="80vh" />;
  }

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

        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={4}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", minHeight: 520 }}>
              <Stack spacing={1.5} mb={2}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>กิจกรรมที่คุณมีสิทธิ์</Typography>
                  <Typography variant="body2" color="text.secondary">
                    เลือกกิจกรรมก่อนเปิดเครื่องมือ เพื่อป้องกันข้อมูลข้ามงาน
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  placeholder="ค้นหาชื่อกิจกรรม, ปี, slug"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                />
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip size="small" label={`${workspaceStats.total} ทั้งหมด`} />
                  <Chip size="small" color="success" variant="outlined" label={`${workspaceStats.open} เปิดใช้งาน`} />
                  <Chip size="small" color="warning" variant="outlined" label={`${workspaceStats.draft} ร่าง`} />
                  <Chip size="small" variant="outlined" label={`${workspaceStats.archived} ย้อนหลัง`} />
                </Stack>
              </Stack>
              <Divider sx={{ mb: 2 }} />
              {recentEvents.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="overline" color="text.secondary" fontWeight={900}>เปิดล่าสุด</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {recentEvents.map((event) => {
                      const id = getId(event);
                      return (
                        <Chip
                          key={id}
                          label={`${event.name} ${event.eventYear ? `(${event.eventYear})` : ""}`}
                          avatar={<Avatar src={event.branding?.logoUrl}>{String(event.name || "E").charAt(0)}</Avatar>}
                          onClick={() => navigate(`/workspace/events/${id}`)}
                          sx={{ maxWidth: "100%", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              )}
              <Stack spacing={1.25}>
                {catalog.events.length === 0 && (
                  <Alert severity="info">ยังไม่มีกิจกรรมที่ผูกกับบัญชีนี้</Alert>
                )}
                {catalog.events.length > 0 && filteredEvents.length === 0 && (
                  <Alert severity="info">ไม่พบกิจกรรมที่ตรงกับคำค้นหา</Alert>
                )}
                {filteredEvents.map((event) => {
                  const id = getId(event);
                  const selected = id === getId(selectedEvent);
                  const isCurrent = id === getId(catalog.settings?.currentEventId);
                  return (
                    <Paper
                      key={id}
                      variant="outlined"
                      onClick={() => navigate(`/workspace/events/${id}`)}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        cursor: "pointer",
                        borderColor: selected ? "#ffc107" : "divider",
                        bgcolor: selected ? "#fff8e1" : "#fff",
                      }}
                    >
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Avatar src={event.branding?.logoUrl} sx={{ bgcolor: event.branding?.primaryColor || "#ffc107", color: "#3e2723" }}>
                          {String(event.name || "E").charAt(0)}
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography fontWeight={900} noWrap>{event.name}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {event.eventYear} / {seriesById[getId(event.seriesId)]?.name || "-"}
                          </Typography>
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.5}>
                          {isCurrent && <Chip size="small" color="success" label="ปัจจุบัน" />}
                          <Chip size="small" variant="outlined" label={event.seriesId ? "งานต่อเนื่อง" : "งานแยกข้อมูล"} />
                          <Chip size="small" color={statusColors[event.status] || "default"} label={statusLabels[event.status] || event.status} />
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={8}>
            {selectedEvent ? (
              <Stack spacing={2.5}>
                <Card sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar src={selectedEvent.branding?.logoUrl} sx={{ width: 72, height: 72, bgcolor: selectedEvent.branding?.primaryColor || "#ffc107", color: "#3e2723", fontWeight: 900 }}>
                          {String(selectedEvent.name || "E").charAt(0)}
                        </Avatar>
                        <Box>
                          <Typography variant="h4" fontWeight={950}>{selectedEvent.name}</Typography>
                          <Typography color="text.secondary" fontWeight={700}>
                            {organizationById[getId(selectedEvent.organizationId)]?.name || "-"} / {seriesById[getId(selectedEvent.seriesId)]?.name || "-"}
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                            <Chip label={`ปี ${selectedEvent.eventYear}`} />
                            <Chip color={statusColors[selectedEvent.status] || "default"} label={statusLabels[selectedEvent.status] || selectedEvent.status} />
                            <Chip variant="outlined" label={selectedEvent.slug} />
                          </Stack>
                        </Box>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
                        <Button startIcon={<OpenInNewIcon />} variant="outlined" onClick={() => openTool("/dashboard", selectedEvent, true)}>
                          เปิด Dashboard แท็บใหม่
                        </Button>
                        <Button startIcon={<ContentCopyIcon />} variant="outlined" onClick={() => copyPublicLink(selectedEvent)}>
                          คัดลอกลิงก์
                        </Button>
                        {selectedEvent.publicLinks?.landingPath && (
                          <Button startIcon={<PublicIcon />} variant="outlined" onClick={() => window.open(selectedEvent.publicLinks.landingPath, "_blank", "noopener,noreferrer")}>
                            หน้า Public
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff" }}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "flex-start", md: "center" }}>
                        <AssignmentTurnedInIcon color="success" />
                        <Box sx={{ flex: 1 }}>
                          <Typography fontWeight={900}>ลำดับการทำงานที่แนะนำ</Typography>
                          <Typography variant="body2" color="text.secondary">
                            1. เปิด Dashboard เพื่อตรวจภาพรวม  2. ใช้ Check-in Staff/เลือกจุดเมื่ออยู่หน้างาน  3. ใช้ตั้งค่ากิจกรรมและ Layout เฉพาะผู้ดูแลที่ได้รับสิทธิ์
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Card sx={{ borderRadius: 2, height: "100%" }}>
                      <CardContent>
                        <Typography variant="h6" fontWeight={900} mb={1}>เครื่องมือประจำอีเวนต์</Typography>
                        <Typography variant="body2" color="text.secondary" mb={2}>
                          เปิดเหมือน workspace tab โดยส่ง context ของ event ไปกับหน้าเครื่องมือ
                        </Typography>
                        <Stack spacing={1.25}>
                          {featureEnabled(selectedEvent, "dashboard") && <Button startIcon={<DashboardIcon />} variant="contained" onClick={() => openTool("/dashboard")}>Dashboard ของอีเวนต์</Button>}
                          {canWorkStaff && featureEnabled(selectedEvent, "checkin") && <Button startIcon={<QrCodeIcon />} variant="outlined" onClick={() => openTool("/staff")}>Check-in Staff</Button>}
                          {canWorkStaff && featureEnabled(selectedEvent, "checkin") && <Button startIcon={<StoreIcon />} variant="outlined" onClick={() => openTool("/staff/select-point")}>เลือกจุดลงทะเบียน</Button>}
                          {canManageSystem && <Button startIcon={<PeopleIcon />} variant="outlined" onClick={() => openTool("/admin/participants")}>ผู้เข้าร่วม</Button>}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Card sx={{ borderRadius: 2, height: "100%" }}>
                      <CardContent>
                        <Typography variant="h6" fontWeight={900} mb={1}>ตั้งค่าและระบบ</Typography>
                        <Typography variant="body2" color="text.secondary" mb={2}>
                          ใช้สำหรับ Superadmin/Admin หรือผู้ดูแลอีเวนต์ที่ได้รับสิทธิ์
                        </Typography>
                        <Stack spacing={1.25}>
                          {canManageSystem && <Button startIcon={<SettingsIcon />} variant="outlined" onClick={() => navigate(`/admin/events/${getId(selectedEvent)}/settings`)}>ตั้งค่ากิจกรรม</Button>}
                          {canManageSystem && <Button startIcon={<DesignServicesIcon />} variant="outlined" onClick={() => navigate(`/admin/events/${getId(selectedEvent)}/layouts`)}>Layout Builder</Button>}
                          {canManageSystem && <Button startIcon={<AdminPanelSettingsIcon />} variant="outlined" onClick={() => navigate("/admin/events")}>Event Portal</Button>}
                          {canManageUsers && <Button startIcon={<PeopleIcon />} variant="outlined" onClick={() => navigate("/admin")}>จัดการผู้ใช้และสิทธิ์</Button>}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Stack>
            ) : (
              <EmptyState
                title={catalog.events.length ? "เลือกกิจกรรมจากรายการด้านซ้าย" : "ยังไม่มีอีเวนต์ให้เปิดใช้งาน"}
                description={catalog.events.length ? "ระบบจะเปิดเครื่องมือพร้อม eventId ของกิจกรรมนั้นเท่านั้น เพื่อป้องกันข้อมูลข้ามงาน" : "ติดต่อ Superadmin หรือ Admin เพื่อมอบหมายสิทธิ์ให้กับบัญชีนี้"}
                icon={<EventAvailableIcon />}
              />
            )}
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
