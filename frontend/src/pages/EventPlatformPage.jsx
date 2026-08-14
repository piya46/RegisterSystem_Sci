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
  Accordion,
  AccordionDetails,
  AccordionSummary,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useParams } from "react-router";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import BusinessIcon from "@mui/icons-material/Business";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
  createEvent,
  createEventSeries,
  createOrganization,
  getEventCatalog,
  getLegacyMigrationPreview,
  runLegacyEventMigration,
} from "../utils/api";
import useAuth from "../hooks/useAuth";
import { EmptyState, LoadingState } from "../components/FeedbackStates";



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

const featureOptions = [
  { key: "registration", label: "ลงทะเบียนออนไลน์", description: "หน้า /register และแบบฟอร์ม" },
  { key: "checkin", label: "Check-in หน้างาน", description: "สแกน QR และจุดลงทะเบียน" },
  { key: "dashboard", label: "Dashboard", description: "สรุปภาพรวมเฉพาะกิจกรรม" },
  { key: "publicReport", label: "รายงานสาธารณะ", description: "หน้ารายงาน/จอแสดงผลสำหรับผู้ชม" },
  { key: "donations", label: "ผู้สนับสนุน", description: "รายการสนับสนุนและสลิป" },
  { key: "packages", label: "แพ็กเกจ/สินค้า", description: "สต๊อกและตัวเลือกสินค้า" },
  { key: "luckyDraw", label: "สุ่มผู้โชคดี", description: "ของรางวัลและหน้าสุ่ม" },
];

const defaultFeatures = {
  registration: true,
  checkin: true,
  dashboard: true,
  publicReport: true,
  donations: false,
  packages: false,
  luckyDraw: false,
};

function normalizeFeatures(features = {}, fallback = defaultFeatures) {
  return Object.fromEntries(
    featureOptions.map((item) => [item.key, features[item.key] ?? fallback[item.key]])
  );
}

const datasetLabels = {
  participants: "ผู้เข้าร่วม",
  donations: "รายการสนับสนุน",
  prizes: "ของรางวัล",
  packages: "แพ็กเกจ",
};


function getId(value) {
  return value?._id || value?.id || value || "";
}






export default function EventPlatformPage({ section = "portal" }) {
  const navigate = useNavigate();
  const { eventId: routeEventId } = useParams();
  const { user } = useAuth();
  const roles = Array.isArray(user?.role) ? user.role : [user?.role].filter(Boolean);
  const canRunMigration = roles.includes("superadmin") || roles.includes("admin");
  const canApplyMigration = roles.includes("superadmin");
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
    eventYear: new Date().getFullYear().toString(),
    linkingMode: "series-linked",
    cloneFromEventId: "",
    cloneParts: [],
    enabledFeatures: defaultFeatures,
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



  const showPortal = section === "portal";
  const showMigration = section === "migration";

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
      // route matches
    }
  }, [activeEventId, catalog.events, catalog.organizations, catalog.series, routeEventId]);



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
    () => createEvent({
      ...eventForm,
      config: {
        enabledFeatures: normalizeFeatures(eventForm.enabledFeatures),
        enableRegister: eventForm.enabledFeatures?.registration !== false,
        allowRegistrationReuse: false,
        registrationReuseRequiresOtp: true,
        registrationReuseEventIds: [],
      },
    }),
    "สร้างกิจกรรมสำเร็จ"
  );

  const handleActivateEvent = (eventId) => runAction(
    () => activateEvent(eventId),
    "ตั้งเป็นกิจกรรมปัจจุบันสำเร็จ"
  );







  const handleCopyPublicLink = async (event) => {
    const path = event.publicLinks?.landingPath || `/e/${event.slug}`;
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setMessage({ open: true, severity: "success", text: "คัดลอกลิงก์กิจกรรมแล้ว" });
  };

  const handleRunMigration = async () => {
    const ok = window.confirm("ต้องการเชื่อมข้อมูลเดิมเข้ากับระบบกิจกรรมใหม่หรือไม่? ระบบจะไม่ลบข้อมูลเดิม และจะเติมเฉพาะรายการที่ยังไม่มี eventId");
    if (!ok) return;
    const confirmation = window.prompt("พิมพ์ MIGRATE_LEGACY_EVENT_DATA เพื่อยืนยัน");
    if (confirmation !== "MIGRATE_LEGACY_EVENT_DATA") {
      setMessage({ open: true, severity: "warning", text: "ยกเลิก Migration เนื่องจากข้อความยืนยันไม่ถูกต้อง" });
      return;
    }
    setMigrating(true);
    try {
      const res = await runLegacyEventMigration({ apply: true, confirmation });
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

  if (loading) {
    return <LoadingState label="กำลังโหลด Event Catalog..." minHeight="70vh" />;
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
                      disabled={!canApplyMigration || migrating || migrationTotals.unmapped === 0}
                    >
                      {canApplyMigration ? "เชื่อมข้อมูลเดิม" : "Superadmin เท่านั้น"}
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
                        <TableCell align="right">ข้อมูลในรอบนี้</TableCell>
                        <TableCell align="right">จัดการ</TableCell>
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
                                ผู้เข้าร่วม {event.eventDataCounts?.participants || 0} / สนับสนุน {event.eventDataCounts?.donations || 0} / รางวัล {event.eventDataCounts?.prizes || 0} / แพ็กเกจ {event.eventDataCounts?.packages || 0}
                              </Typography>
                              {Object.values(event.legacyDataCounts || {}).some((count) => Number(count) > 0) && (
                                <Typography variant="caption" color="warning.main" display="block">
                                  มีข้อมูลเก่ารอ Migration ในปีนี้
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">

                                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                  <IconButton size="small" onClick={() => handleCopyPublicLink(event)} title="คัดลอกลิงก์">
                                    <ContentCopyIcon fontSize="small" />
                                  </IconButton>
                                  {!isActive && (
                                    <Button size="small" variant="outlined" onClick={() => handleActivateEvent(eventId)} disabled={saving}>
                                      ตั้งเป็นปัจจุบัน
                                    </Button>
                                  )}
                                  <Button size="small" variant="contained" disableElevation onClick={() => navigate(`/admin/events/${eventId}/dashboard`, { state: { event } })}>
                                    จัดการ
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
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "#fff" }}>
                    <Typography fontWeight={900} mb={0.5}>ฟีเจอร์ของกิจกรรมนี้</Typography>
                    <Typography variant="caption" color="text.secondary">
                      เลือกเฉพาะเครื่องมือที่กิจกรรมนี้ใช้จริง ข้อมูลของแต่ละฟีเจอร์จะเริ่มว่างสำหรับ event ใหม่
                    </Typography>
                    <Grid container spacing={1} mt={0.5}>
                      {featureOptions.map((feature) => (
                        <Grid item xs={12} sm={6} key={feature.key}>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={eventForm.enabledFeatures?.[feature.key] !== false}
                                onChange={(e) => setEventForm({
                                  ...eventForm,
                                  enabledFeatures: {
                                    ...eventForm.enabledFeatures,
                                    [feature.key]: e.target.checked,
                                  },
                                })}
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2" fontWeight={800}>{feature.label}</Typography>
                                <Typography variant="caption" color="text.secondary">{feature.description}</Typography>
                              </Box>
                            }
                            sx={{ alignItems: "flex-start", m: 0 }}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Paper>
                  <TextField select size="small" label="คัดลอกการตั้งค่าจาก" helperText="ใช้เมื่อกิจกรรมปีใหม่ตั้งค่าคล้ายปีเดิม" value={eventForm.cloneFromEventId} onChange={(e) => setEventForm({ ...eventForm, cloneFromEventId: e.target.value })}>
                    <MenuItem value="">ไม่คัดลอก</MenuItem>
                    {catalog.events.map((item) => <MenuItem key={getId(item)} value={getId(item)}>{item.name} / {item.eventYear}</MenuItem>)}
                  </TextField>
                  {eventForm.cloneFromEventId && (
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "#fff8e1" }}>
                      <Typography fontWeight={900} mb={0.5}>เลือกสิ่งที่จะคัดลอก</Typography>
                      <Typography variant="caption" color="text.secondary">ไม่คัดลอกข้อมูลผู้เข้าร่วม/สนับสนุน/รางวัล/แพ็กเกจ</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1}>
                        {[
                          ["branding", "โลโก้/สี"],
                          ["config", "Config"],
                          ["layouts", "Layout"],
                          ["templates", "อีเมล/บัตร"],
                        ].map(([key, label]) => {
                          const checked = eventForm.cloneParts.includes(key);
                          return (
                            <Chip
                              key={key}
                              clickable
                              color={checked ? "warning" : "default"}
                              variant={checked ? "filled" : "outlined"}
                              label={label}
                              onClick={() => setEventForm({
                                ...eventForm,
                                cloneParts: checked
                                  ? eventForm.cloneParts.filter((item) => item !== key)
                                  : [...eventForm.cloneParts, key],
                              })}
                            />
                          );
                        })}
                      </Stack>
                    </Paper>
                  )}
                  <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreateEvent} disabled={saving || !eventForm.organizationId || !eventForm.seriesId || !eventForm.name}>เพิ่มรอบกิจกรรม</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          </>
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
