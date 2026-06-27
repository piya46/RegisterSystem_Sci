import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import BusinessIcon from "@mui/icons-material/Business";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import PublishedWithChangesIcon from "@mui/icons-material/PublishedWithChanges";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import PublicIcon from "@mui/icons-material/Public";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import ArchiveIcon from "@mui/icons-material/Archive";
import {
  activateEvent,
  cloneEventSettings,
  createEvent,
  createEventSeries,
  createOrganization,
  getEventCatalog,
  getLegacyMigrationPreview,
  publishEvent,
  runLegacyEventMigration,
  updateEvent,
  updateEventLayout,
  updateEventStatus,
} from "../utils/api";
import useAuth from "../hooks/useAuth";

const layoutKeys = [
  { value: "landingPage", label: "หน้า Landing" },
  { value: "registrationForm", label: "แบบฟอร์มลงทะเบียน" },
  { value: "dashboard", label: "หน้าสรุปผล" },
  { value: "ticket", label: "บัตร/อีเมลยืนยัน" },
  { value: "report", label: "รายงาน" },
];

const linkingModeLabels = {
  isolated: "แยกข้อมูล",
  "series-linked": "เชื่อมตามชุดกิจกรรม",
  "manual-linked": "เลือกเชื่อมเอง",
};

const statusLabels = {
  draft: "ร่าง",
  published: "เผยแพร่",
  registration_open: "เปิดลงทะเบียน",
  registration_closed: "ปิดลงทะเบียน",
  event_day: "วันจัดงาน",
  active: "ใช้งาน",
  archived: "เก็บย้อนหลัง",
};

const datasetLabels = {
  participants: "ผู้เข้าร่วม",
  donations: "รายการสนับสนุน",
  prizes: "ของรางวัล",
  packages: "แพ็กเกจ",
};

const defaultJson = {
  landingPage: {
    blocks: [
      {
        id: "hero",
        type: "hero",
        enabled: true,
        title: "",
        subtitle: "",
        body: "",
        imageUrl: "",
        logoUrl: "",
        primaryActionLabel: "ลงทะเบียน",
        primaryActionUrl: "",
      },
    ],
  },
  registrationForm: { sections: [], fields: [] },
  dashboard: { widgets: [] },
  ticket: { blocks: [] },
  report: { columns: [] },
};

function thisYear() {
  return String(new Date().getFullYear());
}

function getId(value) {
  return value?._id || value?.id || value || "";
}

function prettyJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

export default function EventPlatformPage({ section = "portal" }) {
  const navigate = useNavigate();
  const { eventId: routeEventId } = useParams();
  const { user } = useAuth();
  const roles = Array.isArray(user?.role) ? user.role : [user?.role].filter(Boolean);
  const canRunMigration = roles.includes("superadmin") || roles.includes("admin");
  const [catalog, setCatalog] = useState({ organizations: [], series: [], events: [], settings: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState({ open: false, severity: "success", text: "" });
  const [migrationPreview, setMigrationPreview] = useState(null);

  const [organizationForm, setOrganizationForm] = useState({ name: "", slug: "", description: "" });
  const [seriesForm, setSeriesForm] = useState({ organizationId: "", name: "", slug: "", defaultLinkingMode: "series-linked" });
  const [eventForm, setEventForm] = useState({
    organizationId: "",
    seriesId: "",
    name: "",
    slug: "",
    eventYear: thisYear(),
    linkingMode: "series-linked",
    cloneFromEventId: "",
  });

  const [layoutEventId, setLayoutEventId] = useState("");
  const [layoutKey, setLayoutKey] = useState("landingPage");
  const [layoutJson, setLayoutJson] = useState(prettyJson(defaultJson.landingPage));
  const [layoutError, setLayoutError] = useState("");
  const [eventDetailForm, setEventDetailForm] = useState({
    status: "draft",
    logoUrl: "",
    coverImageUrl: "",
    primaryColor: "#f7b500",
    secondaryColor: "#114b5f",
    accentColor: "#22a06b",
    enableRegister: true,
    maintenanceMode: false,
    welcomeMessage: "",
    contactEmail: "",
  });

  const activeEventId = getId(catalog.settings?.currentEventId);
  const activeEvent = useMemo(
    () => catalog.events.find((event) => getId(event) === activeEventId),
    [activeEventId, catalog.events]
  );

  const organizationById = useMemo(
    () => Object.fromEntries(catalog.organizations.map((item) => [getId(item), item])),
    [catalog.organizations]
  );
  const seriesById = useMemo(
    () => Object.fromEntries(catalog.series.map((item) => [getId(item), item])),
    [catalog.series]
  );

  const seriesOptions = useMemo(
    () => catalog.series.filter((item) => !eventForm.organizationId || getId(item.organizationId) === eventForm.organizationId),
    [catalog.series, eventForm.organizationId]
  );

  const layoutEvent = useMemo(
    () => catalog.events.find((item) => getId(item) === layoutEventId) || null,
    [catalog.events, layoutEventId]
  );

  const showPortal = section === "portal";
  const showMigration = section === "migration";
  const showSettings = section === "settings";
  const showLayouts = section === "layouts";
  const sectionTitle = {
    portal: "จัดการกิจกรรม",
    migration: "Migration ข้อมูลเดิม",
    settings: "ตั้งค่ากิจกรรม",
    layouts: "Layout Builder",
  }[section] || "จัดการกิจกรรม";

  const migrationTotals = useMemo(() => {
    const totals = { years: 0, unmapped: 0, eventsToCreate: 0 };
    (migrationPreview?.years || []).forEach((year) => {
      totals.years += 1;
      if (!year.hasEvent) totals.eventsToCreate += 1;
      Object.values(year.unmapped || {}).forEach((count) => {
        totals.unmapped += Number(count || 0);
      });
    });
    return totals;
  }, [migrationPreview]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, migrationRes] = await Promise.all([
        getEventCatalog(),
        canRunMigration ? getLegacyMigrationPreview() : Promise.resolve({ data: { data: null } }),
      ]);
      const data = catalogRes.data?.data || {};
      setCatalog({
        organizations: data.organizations || [],
        series: data.series || [],
        events: data.events || [],
        settings: data.settings || {},
      });
      setMigrationPreview(migrationRes.data?.data || null);
    } catch (error) {
      setMessage({ open: true, severity: "error", text: error.response?.data?.message || "โหลดข้อมูลกิจกรรมไม่สำเร็จ" });
    } finally {
      setLoading(false);
    }
  }, [canRunMigration]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const firstOrgId = getId(catalog.organizations[0]);
    const firstSeriesId = getId(catalog.series[0]);
    if (firstOrgId) {
      setSeriesForm((prev) => ({ ...prev, organizationId: prev.organizationId || firstOrgId }));
      setEventForm((prev) => ({ ...prev, organizationId: prev.organizationId || firstOrgId }));
    }
    if (firstSeriesId) {
      setEventForm((prev) => ({ ...prev, seriesId: prev.seriesId || firstSeriesId }));
    }
    if (routeEventId && catalog.events.some((event) => getId(event) === routeEventId)) {
      setLayoutEventId(routeEventId);
    } else if (catalog.events.length > 0) {
      setLayoutEventId((prev) => prev || activeEventId || getId(catalog.events[0]));
    }
  }, [activeEventId, catalog.events, catalog.organizations, catalog.series, routeEventId]);

  useEffect(() => {
    const event = catalog.events.find((item) => getId(item) === layoutEventId);
    const config = event?.layouts?.[layoutKey]?.config || defaultJson[layoutKey] || {};
    setLayoutJson(prettyJson(config));
    setLayoutError("");
  }, [catalog.events, layoutEventId, layoutKey]);

  useEffect(() => {
    if (!layoutEvent) return;
    setEventDetailForm({
      status: layoutEvent.status || "draft",
      logoUrl: layoutEvent.branding?.logoUrl || "",
      coverImageUrl: layoutEvent.branding?.coverImageUrl || "",
      primaryColor: layoutEvent.branding?.primaryColor || "#f7b500",
      secondaryColor: layoutEvent.branding?.secondaryColor || "#114b5f",
      accentColor: layoutEvent.branding?.accentColor || "#22a06b",
      enableRegister: layoutEvent.config?.enableRegister !== false,
      maintenanceMode: layoutEvent.config?.maintenanceMode === true,
      welcomeMessage: layoutEvent.config?.welcomeMessage || "",
      contactEmail: layoutEvent.config?.contactEmail || "",
    });
  }, [layoutEvent]);

  async function runAction(action, successText) {
    setSaving(true);
    try {
      await action();
      await loadCatalog();
      setMessage({ open: true, severity: "success", text: successText });
    } catch (error) {
      setMessage({ open: true, severity: "error", text: error.response?.data?.message || error.response?.data?.error || "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  const handleCreateOrganization = () => runAction(
    () => createOrganization(organizationForm),
    "สร้างองค์กรสำเร็จ"
  );

  const handleCreateSeries = () => runAction(
    () => createEventSeries(seriesForm),
    "สร้างซีรีส์กิจกรรมสำเร็จ"
  );

  const handleCreateEvent = () => runAction(
    () => createEvent(eventForm),
    "สร้างกิจกรรมสำเร็จ"
  );

  const handleActivateEvent = (eventId) => runAction(
    () => activateEvent(eventId),
    "ตั้งเป็นกิจกรรมปัจจุบันสำเร็จ"
  );

  const handlePublishEvent = (eventId) => runAction(
    () => publishEvent(eventId),
    "เผยแพร่หน้า Landing สำเร็จ"
  );

  const handleStatusChange = (eventId, status) => runAction(
    () => updateEventStatus(eventId, status),
    `เปลี่ยนสถานะเป็น ${statusLabels[status] || status} สำเร็จ`
  );

  const handleSaveEventDetail = () => {
    if (!layoutEventId) return;
    runAction(
      () => updateEvent(layoutEventId, {
        branding: {
          logoUrl: eventDetailForm.logoUrl,
          coverImageUrl: eventDetailForm.coverImageUrl,
          primaryColor: eventDetailForm.primaryColor,
          secondaryColor: eventDetailForm.secondaryColor,
          accentColor: eventDetailForm.accentColor,
        },
        config: {
          enableRegister: eventDetailForm.enableRegister,
          maintenanceMode: eventDetailForm.maintenanceMode,
          welcomeMessage: eventDetailForm.welcomeMessage,
          contactEmail: eventDetailForm.contactEmail,
        },
      }),
      "บันทึกข้อมูลหน้า public สำเร็จ"
    );
  };

  const handleCopyPublicLink = async (event) => {
    const path = event.publicLinks?.landingPath || `/e/${event.slug}`;
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setMessage({ open: true, severity: "success", text: "คัดลอกลิงก์กิจกรรมแล้ว" });
  };

  const addLayoutBlock = (type) => {
    try {
      const parsed = JSON.parse(layoutJson || "{}");
      const currentBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const id = `${type}-${Date.now()}`;
      const blockMap = {
        hero: {
          id,
          type: "hero",
          enabled: true,
          title: layoutEvent?.name || "ชื่อกิจกรรม",
          subtitle: "ข้อความแนะนำกิจกรรม",
          primaryActionLabel: "ลงทะเบียน",
          primaryActionUrl: layoutEvent ? `/e/${layoutEvent.slug}/register` : "",
        },
        richText: { id, type: "richText", enabled: true, title: "หัวข้อใหม่", body: "รายละเอียด" },
        schedule: { id, type: "schedule", enabled: true, title: "กำหนดการ", items: [{ time: "17:00", title: "เริ่มงาน", description: "" }] },
        faq: { id, type: "faq", enabled: true, title: "คำถามที่พบบ่อย", items: [{ question: "ต้องเตรียมอะไรบ้าง", answer: "กรุณาแสดง QR Code หน้างาน" }] },
        cta: { id, type: "cta", enabled: true, title: "พร้อมเข้าร่วมกิจกรรม", buttonLabel: "ลงทะเบียน", buttonUrl: layoutEvent ? `/e/${layoutEvent.slug}/register` : "" },
      };
      setLayoutJson(prettyJson({ ...parsed, blocks: [...currentBlocks, blockMap[type]] }));
      setLayoutError("");
    } catch {
      setLayoutError("แก้ JSON ให้ถูกต้องก่อนเพิ่ม block");
    }
  };

  const handleCloneSettings = () => {
    if (!eventForm.cloneFromEventId || !layoutEventId) {
      setMessage({ open: true, severity: "warning", text: "เลือกกิจกรรมต้นทางและปลายทางก่อน" });
      return;
    }
    runAction(
      () => cloneEventSettings(eventForm.cloneFromEventId, layoutEventId),
      "คัดลอก settings/layout/templates สำเร็จ"
    );
  };

  const handleRunMigration = async () => {
    const ok = window.confirm("ต้องการเชื่อมข้อมูลเดิมเข้ากับระบบกิจกรรมใหม่หรือไม่? ระบบจะไม่ลบข้อมูลเดิม และจะเติมเฉพาะรายการที่ยังไม่มี eventId");
    if (!ok) return;
    setMigrating(true);
    try {
      const res = await runLegacyEventMigration(false);
      const updated = res.data?.data?.updated || {};
      await loadCatalog();
      setMessage({
        open: true,
        severity: "success",
        text: `Migration สำเร็จ: ผู้เข้าร่วม ${updated.participants || 0}, รายการสนับสนุน ${updated.donations || 0}, ของรางวัล ${updated.prizes || 0}, แพ็กเกจ ${updated.packages || 0}`,
      });
    } catch (error) {
      setMessage({ open: true, severity: "error", text: error.response?.data?.message || "Migration ไม่สำเร็จ" });
    } finally {
      setMigrating(false);
    }
  };

  const handleSaveLayout = () => {
    try {
      const parsed = JSON.parse(layoutJson || "{}");
      setLayoutError("");
      runAction(
        () => updateEventLayout(layoutEventId, layoutKey, parsed),
        "บันทึก layout สำเร็จ"
      );
    } catch {
      setLayoutError("JSON ไม่ถูกต้อง");
    }
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress color="warning" />
          <Typography color="text.secondary" fontWeight={700}>กำลังโหลด Event Catalog...</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "#fffdf4", minHeight: "100vh", py: 4 }}>
      <Container maxWidth="xl">
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2} mb={3}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <EventAvailableIcon color="warning" />
              <Typography variant="h4" fontWeight={900} color="primary.dark">{sectionTitle}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              กิจกรรมปัจจุบัน: {activeEvent?.name || catalog.settings?.eventName || "-"} / ปี {catalog.settings?.currentEventYear || "-"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button variant={showPortal ? "contained" : "outlined"} onClick={() => navigate("/admin/events")}>รายการกิจกรรม</Button>
            {canRunMigration && (
              <Button variant={showMigration ? "contained" : "outlined"} onClick={() => navigate("/admin/events/migration")}>Migration</Button>
            )}
            {layoutEventId && (
              <>
                <Button variant={showSettings ? "contained" : "outlined"} onClick={() => navigate(`/admin/events/${layoutEventId}/settings`)}>ตั้งค่ากิจกรรม</Button>
                <Button variant={showLayouts ? "contained" : "outlined"} onClick={() => navigate(`/admin/events/${layoutEventId}/layouts`)}>Layout</Button>
              </>
            )}
            <Chip label={`${catalog.organizations.length} หน่วยงาน`} color="default" />
            <Chip label={`${catalog.series.length} ชุดกิจกรรม`} color="info" variant="outlined" />
            <Chip label={`${catalog.events.length} รอบกิจกรรม`} color="warning" variant="outlined" />
          </Stack>
        </Stack>

        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          โครงสร้างใหม่แบ่งเป็น <b>หน่วยงาน</b> เช่น สมาคมหรือโครงการ, <b>ชุดกิจกรรม</b> เช่น งานที่จัดต่อเนื่องทุกปี และ <b>รอบกิจกรรม</b> คือกิจกรรมปีนั้น ๆ
          ข้อมูลเดิมยังใช้งานได้จากปีเดิม และสามารถกด Migration เพื่อเชื่อมข้อมูลเก่าเข้ากับรอบกิจกรรมใหม่ได้
        </Alert>

        <Grid container spacing={3}>
          {showMigration && (
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} alignItems={{ xs: "flex-start", md: "center" }} mb={2}>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <SyncAltIcon color="warning" />
                      <Typography variant="h6" fontWeight={900}>เชื่อมข้อมูลเดิมเข้าระบบกิจกรรม</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      ใช้สำหรับฐานข้อมูลเดิมที่มีแค่ปีงาน ระบบจะสร้างรอบกิจกรรมให้ปีที่พบ และเติม eventId ให้ข้อมูลที่ยังไม่ได้เชื่อม
                      {migrationPreview?.backfillEventYear ? ` รายการที่ปีงานว่างจะถูกเติมเป็นปี ${migrationPreview.backfillEventYear}` : ""}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button startIcon={<RefreshIcon />} onClick={loadCatalog} disabled={loading || migrating}>
                      ตรวจข้อมูลเดิม
                    </Button>
                    <Button
                      startIcon={migrating ? <CircularProgress size={16} /> : <SyncAltIcon />}
                      variant="contained"
                      color="warning"
                      onClick={handleRunMigration}
                      disabled={migrating || migrationTotals.unmapped === 0}
                    >
                      เชื่อมข้อมูลเดิม
                    </Button>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                  <Chip label={`${migrationTotals.years} ปีที่พบ`} variant="outlined" />
                  <Chip label={`${migrationTotals.eventsToCreate} รอบที่ต้องสร้าง`} color="info" variant="outlined" />
                  <Chip label={`${migrationTotals.unmapped} รายการยังไม่เชื่อม`} color={migrationTotals.unmapped > 0 ? "warning" : "success"} variant="outlined" />
                </Stack>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ปีงาน</TableCell>
                        <TableCell>รอบกิจกรรม</TableCell>
                        <TableCell align="right">ข้อมูลทั้งหมด</TableCell>
                        <TableCell align="right">ยังไม่เชื่อม</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(migrationPreview?.years || []).map((year) => {
                        const countText = Object.entries(year.counts || {})
                          .map(([key, count]) => `${datasetLabels[key] || key}: ${count || 0}`)
                          .join(" / ");
                        const unmappedText = Object.entries(year.unmapped || {})
                          .map(([key, count]) => `${datasetLabels[key] || key}: ${count || 0}`)
                          .join(" / ");
                        return (
                          <TableRow key={year.eventYear} hover>
                            <TableCell>
                              <Typography fontWeight={800}>{year.eventYear}</Typography>
                              {year.isCurrent && <Chip size="small" label="ปีปัจจุบัน" color="success" />}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={700}>{year.hasEvent ? year.eventName : "ยังไม่มีรอบกิจกรรม"}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {year.hasEvent ? "พร้อมใช้งาน" : "จะสร้างให้อัตโนมัติเมื่อกดเชื่อมข้อมูล"}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption">{countText || "-"}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" color={Object.values(year.unmapped || {}).some((count) => Number(count) > 0) ? "warning.main" : "success.main"}>
                                {unmappedText || "-"}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
          )}

          {showPortal && (
          <>
          <Grid item xs={12} lg={8}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <AccountTreeIcon color="warning" />
                  <Typography variant="h6" fontWeight={900}>รายการรอบกิจกรรมทั้งหมด</Typography>
                </Stack>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>กิจกรรม</TableCell>
                        <TableCell>ปี</TableCell>
                        <TableCell>หน่วยงาน / ชุดกิจกรรม</TableCell>
                        <TableCell>สถานะ</TableCell>
                        <TableCell align="right">ข้อมูลเดิม</TableCell>
                        <TableCell align="right">ตั้งค่า</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {catalog.events.map((event) => {
                        const eventId = getId(event);
                        const isActive = eventId === activeEventId;
                        return (
                          <TableRow key={eventId} hover selected={isActive}>
                            <TableCell>
                              <Typography fontWeight={800}>{event.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{event.slug}</Typography>
                            </TableCell>
                            <TableCell>{event.eventYear}</TableCell>
                            <TableCell>
                              <Typography variant="body2">{organizationById[getId(event.organizationId)]?.name || "-"}</Typography>
                              <Typography variant="caption" color="text.secondary">{seriesById[getId(event.seriesId)]?.name || "-"}</Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5}>
                                <Chip size="small" label={isActive ? "กำลังใช้งาน" : statusLabels[event.status] || event.status} color={isActive ? "success" : "default"} />
                                <Chip size="small" label={linkingModeLabels[event.linkingMode] || event.linkingMode} variant="outlined" />
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption">
                                ผู้เข้าร่วม {event.legacyDataCounts?.participants || 0} / สนับสนุน {event.legacyDataCounts?.donations || 0} / รางวัล {event.legacyDataCounts?.prizes || 0} / แพ็กเกจ {event.legacyDataCounts?.packages || 0}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.75} justifyContent="flex-end" flexWrap="wrap">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => navigate(`/admin/events/${eventId}/settings`)}
                                >
                                  ตั้งค่า
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => navigate(`/admin/events/${eventId}/layouts`)}
                                >
                                  Layout
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<ContentCopyIcon />}
                                  onClick={() => handleCopyPublicLink(event)}
                                >
                                  ลิงก์
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<PublicIcon />}
                                  disabled={saving}
                                  onClick={() => handlePublishEvent(eventId)}
                                >
                                  Publish
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="success"
                                  startIcon={<LockOpenIcon />}
                                  disabled={saving}
                                  onClick={() => handleStatusChange(eventId, "registration_open")}
                                >
                                  เปิดรับ
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<LockIcon />}
                                  disabled={saving}
                                  onClick={() => handleStatusChange(eventId, "registration_closed")}
                                >
                                  ปิดรับ
                                </Button>
                                <Button
                                  size="small"
                                  variant={isActive ? "outlined" : "contained"}
                                  disabled={saving || isActive}
                                  startIcon={<PublishedWithChangesIcon />}
                                  onClick={() => handleActivateEvent(eventId)}
                                >
                                  ปัจจุบัน
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="inherit"
                                  startIcon={<ArchiveIcon />}
                                  disabled={saving}
                                  onClick={() => handleStatusChange(eventId, "archived")}
                                >
                                  เก็บ
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff" }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <BusinessIcon color="warning" />
                  <Typography variant="subtitle1" fontWeight={900}>เพิ่มหน่วยงาน</Typography>
                </Stack>
                <Stack spacing={1.5}>
                  <TextField size="small" label="ชื่อหน่วยงาน" helperText="เช่น สมาคมนิสิตเก่า หรือโครงการหลัก" value={organizationForm.name} onChange={(e) => setOrganizationForm({ ...organizationForm, name: e.target.value })} />
                  <TextField size="small" label="รหัส URL" helperText="เว้นว่างได้ ระบบจะสร้างให้อัตโนมัติ" value={organizationForm.slug} onChange={(e) => setOrganizationForm({ ...organizationForm, slug: e.target.value })} />
                  <TextField size="small" label="คำอธิบาย" value={organizationForm.description} onChange={(e) => setOrganizationForm({ ...organizationForm, description: e.target.value })} />
                  <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreateOrganization} disabled={saving || !organizationForm.name}>เพิ่มหน่วยงาน</Button>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff" }}>
                <Typography variant="subtitle1" fontWeight={900} mb={0.5}>เพิ่มชุดกิจกรรม</Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                  ชุดกิจกรรมใช้รวมงานที่จัดต่อเนื่อง เช่น งานคืนสู่เหย้ารายปี
                </Typography>
                <Stack spacing={1.5}>
                  <TextField select size="small" label="หน่วยงาน" value={seriesForm.organizationId} onChange={(e) => setSeriesForm({ ...seriesForm, organizationId: e.target.value })}>
                    {catalog.organizations.map((item) => <MenuItem key={getId(item)} value={getId(item)}>{item.name}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="ชื่อชุดกิจกรรม" value={seriesForm.name} onChange={(e) => setSeriesForm({ ...seriesForm, name: e.target.value })} />
                  <TextField size="small" label="รหัส URL" helperText="เว้นว่างได้ ระบบจะสร้างให้อัตโนมัติ" value={seriesForm.slug} onChange={(e) => setSeriesForm({ ...seriesForm, slug: e.target.value })} />
                  <TextField select size="small" label="การเชื่อมข้อมูลเริ่มต้น" helperText="กำหนดว่ารอบกิจกรรมในชุดนี้จะเชื่อมข้อมูลกันอย่างไร" value={seriesForm.defaultLinkingMode} onChange={(e) => setSeriesForm({ ...seriesForm, defaultLinkingMode: e.target.value })}>
                    <MenuItem value="isolated">{linkingModeLabels.isolated}</MenuItem>
                    <MenuItem value="series-linked">{linkingModeLabels["series-linked"]}</MenuItem>
                    <MenuItem value="manual-linked">{linkingModeLabels["manual-linked"]}</MenuItem>
                  </TextField>
                  <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreateSeries} disabled={saving || !seriesForm.organizationId || !seriesForm.name}>เพิ่มชุดกิจกรรม</Button>
                </Stack>
              </Paper>
            </Stack>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={900} mb={0.5}>เพิ่มรอบกิจกรรม</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  รอบกิจกรรมคือกิจกรรมหนึ่งปีหรือหนึ่งครั้ง เช่น งานปี 2569 ข้อมูลเก่าจะเปิดดูย้อนหลังได้จากปีงาน
                </Typography>
                <Stack spacing={1.5}>
                  <TextField select size="small" label="หน่วยงาน" value={eventForm.organizationId} onChange={(e) => setEventForm({ ...eventForm, organizationId: e.target.value, seriesId: "" })}>
                    {catalog.organizations.map((item) => <MenuItem key={getId(item)} value={getId(item)}>{item.name}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" label="ชุดกิจกรรม" value={eventForm.seriesId} onChange={(e) => setEventForm({ ...eventForm, seriesId: e.target.value })}>
                    {seriesOptions.map((item) => <MenuItem key={getId(item)} value={getId(item)}>{item.name}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="ชื่อรอบกิจกรรม" helperText="เช่น งานคืนสู่เหย้า 2569" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} />
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField fullWidth size="small" label="ปีงาน" value={eventForm.eventYear} onChange={(e) => setEventForm({ ...eventForm, eventYear: e.target.value })} />
                    <TextField fullWidth size="small" label="รหัส URL" helperText="เว้นว่างได้" value={eventForm.slug} onChange={(e) => setEventForm({ ...eventForm, slug: e.target.value })} />
                  </Stack>
                  <TextField select size="small" label="การเชื่อมข้อมูล" helperText="แยกข้อมูล = เหมาะกับงานคนละชุด, เชื่อมตามชุด = เหมาะกับงานต่อเนื่องรายปี" value={eventForm.linkingMode} onChange={(e) => setEventForm({ ...eventForm, linkingMode: e.target.value })}>
                    <MenuItem value="isolated">{linkingModeLabels.isolated}</MenuItem>
                    <MenuItem value="series-linked">{linkingModeLabels["series-linked"]}</MenuItem>
                    <MenuItem value="manual-linked">{linkingModeLabels["manual-linked"]}</MenuItem>
                  </TextField>
                  <TextField select size="small" label="คัดลอกการตั้งค่าจาก" helperText="ใช้เมื่อกิจกรรมปีใหม่ตั้งค่าคล้ายปีเดิม" value={eventForm.cloneFromEventId} onChange={(e) => setEventForm({ ...eventForm, cloneFromEventId: e.target.value })}>
                    <MenuItem value="">ไม่คัดลอก</MenuItem>
                    {catalog.events.map((item) => <MenuItem key={getId(item)} value={getId(item)}>{item.name} / {item.eventYear}</MenuItem>)}
                  </TextField>
                  <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreateEvent} disabled={saving || !eventForm.organizationId || !eventForm.seriesId || !eventForm.name}>เพิ่มรอบกิจกรรม</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          </>
          )}

          {(showSettings || showLayouts) && (
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                {showSettings && (
                <Box mb={3}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2} mb={2}>
                    <Box>
                      <Typography variant="h6" fontWeight={900}>หน้ากิจกรรมสาธารณะ</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ตั้งค่าโลโก้ ภาพปก สี และข้อความของกิจกรรมที่เลือก ใช้กับลิงก์ /e/slug
                      </Typography>
                    </Box>
                    <Button startIcon={<SaveIcon />} variant="outlined" onClick={handleSaveEventDetail} disabled={saving || !layoutEventId}>
                      บันทึกข้อมูลหน้า public
                    </Button>
                  </Stack>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                      <TextField size="small" fullWidth label="URL โลโก้งาน" value={eventDetailForm.logoUrl} onChange={(e) => setEventDetailForm({ ...eventDetailForm, logoUrl: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField size="small" fullWidth label="URL ภาพปก" value={eventDetailForm.coverImageUrl} onChange={(e) => setEventDetailForm({ ...eventDetailForm, coverImageUrl: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField size="small" fullWidth type="color" label="สีหลัก" value={eventDetailForm.primaryColor} onChange={(e) => setEventDetailForm({ ...eventDetailForm, primaryColor: e.target.value })} InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField size="small" fullWidth type="color" label="สีรอง" value={eventDetailForm.secondaryColor} onChange={(e) => setEventDetailForm({ ...eventDetailForm, secondaryColor: e.target.value })} InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField size="small" fullWidth type="color" label="สีเน้น" value={eventDetailForm.accentColor} onChange={(e) => setEventDetailForm({ ...eventDetailForm, accentColor: e.target.value })} InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField select size="small" fullWidth label="เปิดรับลงทะเบียนใน config" value={eventDetailForm.enableRegister ? "yes" : "no"} onChange={(e) => setEventDetailForm({ ...eventDetailForm, enableRegister: e.target.value === "yes" })}>
                        <MenuItem value="yes">เปิด</MenuItem>
                        <MenuItem value="no">ปิด</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField select size="small" fullWidth label="โหมดปิดปรับปรุง" value={eventDetailForm.maintenanceMode ? "yes" : "no"} onChange={(e) => setEventDetailForm({ ...eventDetailForm, maintenanceMode: e.target.value === "yes" })}>
                        <MenuItem value="no">ไม่ปิดปรับปรุง</MenuItem>
                        <MenuItem value="yes">ปิดปรับปรุง</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField size="small" fullWidth label="ข้อความต้อนรับ/คำอธิบายสั้น" value={eventDetailForm.welcomeMessage} onChange={(e) => setEventDetailForm({ ...eventDetailForm, welcomeMessage: e.target.value })} />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField size="small" fullWidth label="อีเมลติดต่อ" value={eventDetailForm.contactEmail} onChange={(e) => setEventDetailForm({ ...eventDetailForm, contactEmail: e.target.value })} />
                    </Grid>
                  </Grid>
                </Box>
                )}
                {showLayouts && (
                <>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2} mb={2}>
                  <Box>
                    <Typography variant="h6" fontWeight={900}>เลย์เอาท์และแม่แบบ</Typography>
                    <Typography variant="caption" color="text.secondary">แก้แบบ block-based ผ่านปุ่มลัด หรือปรับ JSON ที่ระบบจะตรวจ schema ให้ก่อนบันทึก</Typography>
                  </Box>
                  <Button startIcon={<ContentCopyIcon />} onClick={handleCloneSettings} disabled={saving || !eventForm.cloneFromEventId || !layoutEventId}>
                    คัดลอกไปยังรอบที่เลือก
                  </Button>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2}>
                  <TextField select fullWidth size="small" label="รอบกิจกรรม" value={layoutEventId} onChange={(e) => setLayoutEventId(e.target.value)}>
                    {catalog.events.map((item) => <MenuItem key={getId(item)} value={getId(item)}>{item.name} / {item.eventYear}</MenuItem>)}
                  </TextField>
                  <TextField select fullWidth size="small" label="ส่วนที่ต้องการแก้" value={layoutKey} onChange={(e) => setLayoutKey(e.target.value)}>
                    {layoutKeys.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                  </TextField>
                </Stack>
                {layoutKey === "landingPage" && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                    <Button size="small" variant="outlined" onClick={() => addLayoutBlock("hero")}>เพิ่ม Hero</Button>
                    <Button size="small" variant="outlined" onClick={() => addLayoutBlock("richText")}>เพิ่มข้อความ</Button>
                    <Button size="small" variant="outlined" onClick={() => addLayoutBlock("schedule")}>เพิ่มกำหนดการ</Button>
                    <Button size="small" variant="outlined" onClick={() => addLayoutBlock("faq")}>เพิ่ม FAQ</Button>
                    <Button size="small" variant="outlined" onClick={() => addLayoutBlock("cta")}>เพิ่มปุ่ม CTA</Button>
                  </Stack>
                )}
                <TextField
                  value={layoutJson}
                  onChange={(e) => setLayoutJson(e.target.value)}
                  error={!!layoutError}
                  helperText={layoutError || " "}
                  multiline
                  minRows={14}
                  fullWidth
                  sx={{ fontFamily: "monospace", "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
                />
                <Divider sx={{ my: 2 }} />
                <Button startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />} variant="contained" onClick={handleSaveLayout} disabled={saving || !layoutEventId}>
                  บันทึกเลย์เอาท์
                </Button>
                </>
                )}
              </CardContent>
            </Card>
          </Grid>
          )}
        </Grid>

        <Snackbar open={message.open} autoHideDuration={4000} onClose={() => setMessage((prev) => ({ ...prev, open: false }))}>
          <Alert severity={message.severity} variant="filled" onClose={() => setMessage((prev) => ({ ...prev, open: false }))}>
            {message.text}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}
