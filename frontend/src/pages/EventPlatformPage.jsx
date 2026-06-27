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
import { useNavigate, useParams } from "react-router-dom";
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
import { EmptyState, LoadingState } from "../components/FeedbackStates";

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
const legacyFeatureDefaults = {
  registration: true,
  checkin: true,
  dashboard: true,
  publicReport: true,
  donations: true,
  packages: true,
  luckyDraw: true,
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

const defaultJson = {
  landingPage: {
    blocks: [
      {
        id: "hero",
        type: "hero",
        enabled: true,
        title: "ชื่อกิจกรรม",
        subtitle: "ข้อความแนะนำกิจกรรม",
        body: "ใส่รายละเอียดสำคัญของงาน วันเวลา สถานที่ และสิ่งที่ผู้เข้าร่วมควรรู้",
        imageUrl: "",
        logoUrl: "",
        primaryActionLabel: "ลงทะเบียน",
        primaryActionUrl: "",
      },
      { id: "details", type: "richText", enabled: true, title: "รายละเอียดกิจกรรม", body: "เล่ารายละเอียดกิจกรรม สิทธิประโยชน์ และเงื่อนไขที่ควรรู้" },
      { id: "schedule", type: "schedule", enabled: true, title: "กำหนดการ", items: [{ time: "17:00", title: "เริ่มลงทะเบียนหน้างาน", description: "" }, { time: "18:00", title: "เปิดงาน", description: "" }] },
      { id: "cta", type: "cta", enabled: true, title: "พร้อมเข้าร่วมกิจกรรม", buttonLabel: "ลงทะเบียน", buttonUrl: "" },
    ],
  },
  registrationForm: {
    sections: [
      { id: "personal", title: "ข้อมูลส่วนตัว", description: "ข้อมูลหลักสำหรับออกบัตรและยืนยันตัวตน" },
      { id: "contact", title: "ข้อมูลติดต่อ", description: "ใช้ส่งอีเมลยืนยันและติดต่อกรณีจำเป็น" },
    ],
    fields: [
      { id: "name", key: "name", name: "name", label: "ชื่อ-นามสกุล", type: "text", required: true },
      { id: "email", key: "email", name: "email", label: "อีเมล", type: "email", required: true },
      { id: "phone", key: "phone", name: "phone", label: "เบอร์โทรศัพท์", type: "phone", required: true },
      { id: "dept", key: "dept", name: "dept", label: "ภาควิชา/หน่วยงาน", type: "text", required: false },
      { id: "date_year", key: "date_year", name: "date_year", label: "ปีการศึกษา", type: "text", required: false },
    ],
  },
  dashboard: {
    widgets: [
      { id: "registered", type: "metric", title: "ผู้ลงทะเบียน", enabled: true },
      { id: "checked-in", type: "metric", title: "เช็คอินแล้ว", enabled: true },
      { id: "donations", type: "metric", title: "ยอดสนับสนุน", enabled: true },
      { id: "year-comparison", type: "table", title: "เปรียบเทียบย้อนหลัง", enabled: true },
    ],
  },
  ticket: {
    blocks: [
      { id: "ticket-header", type: "text", label: "หัวบัตร", title: "บัตรเข้างาน / อีเมลยืนยัน", body: "กรุณาแสดง QR Code นี้ที่หน้างาน", value: "บัตรเข้างาน / อีเมลยืนยัน", enabled: true },
      { id: "ticket-qr", type: "qr", label: "QR Code", value: "qrCode", enabled: true },
      { id: "ticket-name", type: "field", label: "ชื่อผู้เข้าร่วม", value: "name", enabled: true },
    ],
  },
  report: {
    columns: [
      { id: "name", key: "name", label: "ชื่อ-นามสกุล", enabled: true },
      { id: "email", key: "email", label: "อีเมล", enabled: true },
      { id: "phone", key: "phone", label: "เบอร์โทรศัพท์", enabled: true },
      { id: "status", key: "status", label: "สถานะ", enabled: true },
      { id: "checkedInAt", key: "checkedInAt", label: "เวลาเช็คอิน", enabled: true },
    ],
  },
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

function safeParseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return fallback;
  }
}

function isEmptyTemplate(layoutKey, config = {}) {
  if (layoutKey === "landingPage") return !Array.isArray(config.blocks) || config.blocks.length === 0;
  if (layoutKey === "registrationForm") return (!Array.isArray(config.sections) || config.sections.length === 0) && (!Array.isArray(config.fields) || config.fields.length === 0);
  if (layoutKey === "dashboard") return !Array.isArray(config.widgets) || config.widgets.length === 0;
  if (layoutKey === "ticket") return !Array.isArray(config.blocks) || config.blocks.length === 0;
  if (layoutKey === "report") return !Array.isArray(config.columns) || config.columns.length === 0;
  return false;
}

function blockTitle(block) {
  const labels = {
    hero: "Hero",
    richText: "ข้อความ",
    schedule: "กำหนดการ",
    faq: "FAQ",
    cta: "ปุ่ม CTA",
  };
  return labels[block?.type] || block?.type || "บล็อก";
}

function createLayoutBlock(type, event) {
  const id = `${type}-${Date.now()}`;
  const registerUrl = event ? `/e/${event.slug}/register` : "";
  const map = {
    hero: {
      id,
      type: "hero",
      enabled: true,
      title: event?.name || "ชื่อกิจกรรม",
      subtitle: "ข้อความแนะนำกิจกรรม",
      body: "",
      imageUrl: event?.branding?.coverImageUrl || "",
      logoUrl: event?.branding?.logoUrl || "",
      primaryActionLabel: "ลงทะเบียน",
      primaryActionUrl: registerUrl,
    },
    richText: { id, type: "richText", enabled: true, title: "หัวข้อใหม่", body: "รายละเอียด" },
    schedule: { id, type: "schedule", enabled: true, title: "กำหนดการ", items: [{ time: "17:00", title: "เริ่มงาน", description: "" }] },
    faq: { id, type: "faq", enabled: true, title: "คำถามที่พบบ่อย", items: [{ question: "ต้องเตรียมอะไรบ้าง", answer: "กรุณาแสดง QR Code หน้างาน" }] },
    cta: { id, type: "cta", enabled: true, title: "พร้อมเข้าร่วมกิจกรรม", buttonLabel: "ลงทะเบียน", buttonUrl: registerUrl },
  };
  return map[type] || map.richText;
}

function LayoutPreview({ layoutKey, config, event }) {
  if (layoutKey === "registrationForm") {
    const fields = Array.isArray(config?.fields) ? config.fields : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <Typography variant="h6" fontWeight={950}>แบบฟอร์มลงทะเบียน</Typography>
        <Stack spacing={1.25} mt={1.5}>
          {fields.filter((field) => field.enabled !== false).map((field) => (
            <TextField key={field.id || field.name || field.key} size="small" label={`${field.label || field.name}${field.required ? " *" : ""}`} placeholder={field.placeholder || ""} select={field.type === "select"} disabled>
              {(field.options || []).map((option) => <MenuItem key={option.value || option.label} value={option.value || option.label}>{option.label || option.value}</MenuItem>)}
            </TextField>
          ))}
        </Stack>
      </Paper>
    );
  }
  if (layoutKey === "dashboard") {
    const widgets = Array.isArray(config?.widgets) ? config.widgets.filter((item) => item.enabled !== false) : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <Grid container spacing={1.25}>
          {widgets.map((widget) => (
            <Grid item xs={12} sm={widget.type === "table" ? 12 : 6} key={widget.id || widget.title}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: widget.type === "table" ? "#f8fafc" : "#fff8e1" }}>
                <Typography variant="caption" color="text.secondary">{widget.type}</Typography>
                <Typography fontWeight={950}>{widget.title}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    );
  }
  if (layoutKey === "ticket") {
    const blocks = Array.isArray(config?.blocks) ? config.blocks.filter((item) => item.enabled !== false) : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <Paper sx={{ overflow: "hidden", borderRadius: 2, border: "1px solid #e4e7ec" }}>
          <Box sx={{ p: 1.5, bgcolor: event?.branding?.secondaryColor || "#114b5f", color: "#fff" }}>
            <Typography fontWeight={950}>{event?.name || "บัตรเข้างาน"}</Typography>
          </Box>
          <Stack spacing={1} sx={{ p: 2 }}>
            {blocks.map((block) => (
              <Paper key={block.id || block.label} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{block.label || block.type}</Typography>
                <Typography fontWeight={900}>{block.title || block.body || block.value || "-"}</Typography>
              </Paper>
            ))}
          </Stack>
        </Paper>
      </Paper>
    );
  }
  if (layoutKey === "report") {
    const columns = Array.isArray(config?.columns) ? config.columns.filter((item) => item.enabled !== false) : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead><TableRow>{columns.map((column) => <TableCell key={column.id || column.key}>{column.label || column.key}</TableCell>)}</TableRow></TableHead>
            <TableBody><TableRow>{columns.map((column) => <TableCell key={column.id || column.key}>ตัวอย่าง</TableCell>)}</TableRow></TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  const blocks = Array.isArray(config?.blocks) ? config.blocks.filter((block) => block.enabled !== false) : [];
  if (blocks.length === 0) {
    return <EmptyState title="ยังไม่มีบล็อกในหน้านี้" description="เพิ่มบล็อกด้านซ้ายเพื่อเริ่มออกแบบหน้า Landing" />;
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
      <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
      <Stack spacing={1.5}>
        {blocks.map((block) => {
          if (block.type === "hero") {
            return (
              <Paper key={block.id} sx={{ p: 2.5, borderRadius: 2, color: "#fff", background: `linear-gradient(135deg, ${event?.branding?.secondaryColor || "#114b5f"}, ${event?.branding?.primaryColor || "#f7b500"})` }}>
                {block.logoUrl && <Box component="img" src={block.logoUrl} alt="" sx={{ width: 56, height: 56, objectFit: "contain", bgcolor: "#fff", borderRadius: 1, p: 0.5, mb: 1 }} />}
                <Typography variant="h5" fontWeight={950}>{block.title || event?.name || "ชื่อกิจกรรม"}</Typography>
                <Typography fontWeight={800} sx={{ opacity: 0.9 }}>{block.subtitle}</Typography>
                {block.body && <Typography variant="body2" sx={{ mt: 1, opacity: 0.85 }}>{block.body}</Typography>}
                {block.primaryActionLabel && <Chip sx={{ mt: 1.5, bgcolor: "#fff", fontWeight: 900 }} label={block.primaryActionLabel} />}
              </Paper>
            );
          }
          if (block.type === "schedule") {
            return (
              <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography fontWeight={950}>{block.title || "กำหนดการ"}</Typography>
                <Stack spacing={1} mt={1}>
                  {(block.items || []).map((item, index) => (
                    <Stack key={`${block.id}-preview-${index}`} direction="row" spacing={1}>
                      <Chip size="small" label={item.time || "-"} />
                      <Box>
                        <Typography variant="body2" fontWeight={850}>{item.title || "รายการ"}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            );
          }
          if (block.type === "faq") {
            return (
              <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography fontWeight={950}>{block.title || "FAQ"}</Typography>
                {(block.items || []).slice(0, 3).map((item, index) => (
                  <Box key={`${block.id}-faq-${index}`} sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight={850}>{item.question || "คำถาม"}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.answer || "คำตอบ"}</Typography>
                  </Box>
                ))}
              </Paper>
            );
          }
          if (block.type === "cta") {
            return (
              <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: "center", bgcolor: "#fff8e1" }}>
                <Typography fontWeight={950}>{block.title || "Call to action"}</Typography>
                <Button size="small" variant="contained" sx={{ mt: 1 }}>{block.buttonLabel || "เปิด"}</Button>
              </Paper>
            );
          }
          return (
            <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography fontWeight={950}>{block.title || "ข้อความ"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>{block.body}</Typography>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
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
    cloneParts: [],
    enabledFeatures: defaultFeatures,
  });

  const [layoutEventId, setLayoutEventId] = useState("");
  const [layoutKey, setLayoutKey] = useState("landingPage");
  const [layoutJson, setLayoutJson] = useState(prettyJson(defaultJson.landingPage));
  const [layoutError, setLayoutError] = useState("");
  const [advancedJsonOpen, setAdvancedJsonOpen] = useState(false);
  const [dragBlockId, setDragBlockId] = useState("");
  const [eventDetailForm, setEventDetailForm] = useState({
    name: "",
    slug: "",
    eventYear: thisYear(),
    linkingMode: "series-linked",
    status: "draft",
    logoUrl: "",
    coverImageUrl: "",
    primaryColor: "#f7b500",
    secondaryColor: "#114b5f",
    accentColor: "#22a06b",
    enableRegister: true,
    maintenanceMode: false,
    enabledFeatures: defaultFeatures,
    allowRegistrationReuse: false,
    registrationReuseMode: "series-linked",
    registrationReuseEventIds: [],
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
  const layoutConfig = useMemo(
    () => safeParseJson(layoutJson, defaultJson[layoutKey] || {}),
    [layoutJson, layoutKey]
  );
  const layoutBlocks = Array.isArray(layoutConfig?.blocks) ? layoutConfig.blocks : [];

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
    const storedConfig = event?.layouts?.[layoutKey]?.config || {};
    const config = isEmptyTemplate(layoutKey, storedConfig) ? (defaultJson[layoutKey] || {}) : storedConfig;
    setLayoutJson(prettyJson(config));
    setLayoutError("");
  }, [catalog.events, layoutEventId, layoutKey]);

  useEffect(() => {
    if (!layoutEvent) return;
    setEventDetailForm({
      name: layoutEvent.name || "",
      slug: layoutEvent.slug || "",
      eventYear: layoutEvent.eventYear || thisYear(),
      linkingMode: layoutEvent.linkingMode || "series-linked",
      status: layoutEvent.status || "draft",
      logoUrl: layoutEvent.branding?.logoUrl || "",
      coverImageUrl: layoutEvent.branding?.coverImageUrl || "",
      primaryColor: layoutEvent.branding?.primaryColor || "#f7b500",
      secondaryColor: layoutEvent.branding?.secondaryColor || "#114b5f",
      accentColor: layoutEvent.branding?.accentColor || "#22a06b",
      enableRegister: layoutEvent.config?.enableRegister !== false,
      maintenanceMode: layoutEvent.config?.maintenanceMode === true,
      enabledFeatures: layoutEvent.config?.enabledFeatures
        ? normalizeFeatures(layoutEvent.config.enabledFeatures)
        : legacyFeatureDefaults,
      allowRegistrationReuse: layoutEvent.config?.allowRegistrationReuse === true,
      registrationReuseMode: layoutEvent.config?.registrationReuseMode || layoutEvent.linkingMode || "series-linked",
      registrationReuseEventIds: layoutEvent.config?.registrationReuseEventIds || layoutEvent.linkedEventIds || [],
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
        name: eventDetailForm.name,
        slug: eventDetailForm.slug,
        eventYear: eventDetailForm.eventYear,
        linkingMode: eventDetailForm.linkingMode,
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
          enabledFeatures: normalizeFeatures(eventDetailForm.enabledFeatures),
          allowRegistrationReuse: eventDetailForm.allowRegistrationReuse,
          registrationReuseMode: eventDetailForm.registrationReuseMode,
          registrationReuseRequiresOtp: true,
          registrationReuseEventIds: eventDetailForm.registrationReuseEventIds,
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
    const parsed = safeParseJson(layoutJson, defaultJson[layoutKey] || {});
    const currentBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    setLayoutJson(prettyJson({ ...parsed, blocks: [...currentBlocks, createLayoutBlock(type, layoutEvent)] }));
    setLayoutError("");
  };

  const updateLayoutConfig = (config) => {
    setLayoutJson(prettyJson(config));
    setLayoutError("");
  };

  const updateBlock = (blockId, patch) => {
    updateLayoutConfig({
      ...layoutConfig,
      blocks: layoutBlocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    });
  };

  const removeBlock = (blockId) => {
    updateLayoutConfig({
      ...layoutConfig,
      blocks: layoutBlocks.filter((block) => block.id !== blockId),
    });
  };

  const moveBlock = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const next = [...layoutBlocks];
    const fromIndex = next.findIndex((block) => block.id === fromId);
    const toIndex = next.findIndex((block) => block.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    updateLayoutConfig({ ...layoutConfig, blocks: next });
  };

  const updateBlockItem = (blockId, key, index, patch) => {
    const block = layoutBlocks.find((item) => item.id === blockId);
    if (!block) return;
    const items = Array.isArray(block[key]) ? [...block[key]] : [];
    items[index] = { ...(items[index] || {}), ...patch };
    updateBlock(blockId, { [key]: items });
  };

  const addBlockItem = (blockId, key, value) => {
    const block = layoutBlocks.find((item) => item.id === blockId);
    if (!block) return;
    updateBlock(blockId, { [key]: [...(Array.isArray(block[key]) ? block[key] : []), value] });
  };

  const removeBlockItem = (blockId, key, index) => {
    const block = layoutBlocks.find((item) => item.id === blockId);
    if (!block) return;
    updateBlock(blockId, { [key]: (Array.isArray(block[key]) ? block[key] : []).filter((_, itemIndex) => itemIndex !== index) });
  };

  const collection = (key) => (Array.isArray(layoutConfig?.[key]) ? layoutConfig[key] : []);
  const updateCollectionItem = (key, index, patch) => {
    const next = [...collection(key)];
    next[index] = { ...(next[index] || {}), ...patch };
    updateLayoutConfig({ ...layoutConfig, [key]: next });
  };
  const addCollectionItem = (key, value) => {
    updateLayoutConfig({ ...layoutConfig, [key]: [...collection(key), value] });
  };
  const removeCollectionItem = (key, index) => {
    updateLayoutConfig({ ...layoutConfig, [key]: collection(key).filter((_, itemIndex) => itemIndex !== index) });
  };
  const moveCollectionItem = (key, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...collection(key)];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    updateLayoutConfig({ ...layoutConfig, [key]: next });
  };

  const applyDefaultTemplate = () => {
    updateLayoutConfig(defaultJson[layoutKey] || {});
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

  const renderBlockEditor = (block) => {
    const commonFields = (
      <Stack spacing={1.25}>
        <FormControlLabel
          control={<Switch checked={block.enabled !== false} onChange={(event) => updateBlock(block.id, { enabled: event.target.checked })} />}
          label="แสดงบล็อกนี้บนหน้า Public"
        />
      </Stack>
    );
    if (block.type === "hero") {
      return (
        <Stack spacing={1.5}>
          {commonFields}
          <TextField size="small" label="หัวข้อหลัก" value={block.title || ""} onChange={(event) => updateBlock(block.id, { title: event.target.value })} />
          <TextField size="small" label="หัวข้อรอง" value={block.subtitle || ""} onChange={(event) => updateBlock(block.id, { subtitle: event.target.value })} />
          <TextField size="small" multiline minRows={2} label="รายละเอียด" value={block.body || ""} onChange={(event) => updateBlock(block.id, { body: event.target.value })} />
          <TextField size="small" label="URL รูปปก" value={block.imageUrl || ""} onChange={(event) => updateBlock(block.id, { imageUrl: event.target.value })} />
          <TextField size="small" label="URL โลโก้เฉพาะบล็อก" value={block.logoUrl || ""} onChange={(event) => updateBlock(block.id, { logoUrl: event.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField fullWidth size="small" label="ข้อความปุ่มหลัก" value={block.primaryActionLabel || ""} onChange={(event) => updateBlock(block.id, { primaryActionLabel: event.target.value })} />
            <TextField fullWidth size="small" label="ลิงก์ปุ่มหลัก" value={block.primaryActionUrl || ""} onChange={(event) => updateBlock(block.id, { primaryActionUrl: event.target.value })} />
          </Stack>
        </Stack>
      );
    }
    if (block.type === "schedule") {
      return (
        <Stack spacing={1.5}>
          {commonFields}
          <TextField size="small" label="หัวข้อบล็อก" value={block.title || ""} onChange={(event) => updateBlock(block.id, { title: event.target.value })} />
          {(block.items || []).map((item, index) => (
            <Paper key={`${block.id}-schedule-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                <TextField size="small" label="เวลา" value={item.time || ""} onChange={(event) => updateBlockItem(block.id, "items", index, { time: event.target.value })} sx={{ minWidth: 110 }} />
                <TextField size="small" label="หัวข้อ" value={item.title || ""} onChange={(event) => updateBlockItem(block.id, "items", index, { title: event.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" label="คำอธิบาย" value={item.description || ""} onChange={(event) => updateBlockItem(block.id, "items", index, { description: event.target.value })} sx={{ flex: 1 }} />
                <IconButton color="error" onClick={() => removeBlockItem(block.id, "items", index)}><DeleteIcon /></IconButton>
              </Stack>
            </Paper>
          ))}
          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addBlockItem(block.id, "items", { time: "", title: "รายการใหม่", description: "" })}>
            เพิ่มรายการกำหนดการ
          </Button>
        </Stack>
      );
    }
    if (block.type === "faq") {
      return (
        <Stack spacing={1.5}>
          {commonFields}
          <TextField size="small" label="หัวข้อบล็อก" value={block.title || ""} onChange={(event) => updateBlock(block.id, { title: event.target.value })} />
          {(block.items || []).map((item, index) => (
            <Paper key={`${block.id}-faq-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack spacing={1}>
                <TextField size="small" label="คำถาม" value={item.question || ""} onChange={(event) => updateBlockItem(block.id, "items", index, { question: event.target.value })} />
                <TextField size="small" label="คำตอบ" value={item.answer || ""} onChange={(event) => updateBlockItem(block.id, "items", index, { answer: event.target.value })} />
                <Box><IconButton color="error" onClick={() => removeBlockItem(block.id, "items", index)}><DeleteIcon /></IconButton></Box>
              </Stack>
            </Paper>
          ))}
          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addBlockItem(block.id, "items", { question: "คำถามใหม่", answer: "" })}>
            เพิ่มคำถาม
          </Button>
        </Stack>
      );
    }
    if (block.type === "cta") {
      return (
        <Stack spacing={1.5}>
          {commonFields}
          <TextField size="small" label="หัวข้อ" value={block.title || ""} onChange={(event) => updateBlock(block.id, { title: event.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField fullWidth size="small" label="ข้อความปุ่ม" value={block.buttonLabel || ""} onChange={(event) => updateBlock(block.id, { buttonLabel: event.target.value })} />
            <TextField fullWidth size="small" label="ลิงก์ปุ่ม" value={block.buttonUrl || ""} onChange={(event) => updateBlock(block.id, { buttonUrl: event.target.value })} />
          </Stack>
        </Stack>
      );
    }
    return (
      <Stack spacing={1.5}>
        {commonFields}
        <TextField size="small" label="หัวข้อ" value={block.title || ""} onChange={(event) => updateBlock(block.id, { title: event.target.value })} />
        <TextField size="small" multiline minRows={4} label="รายละเอียด" value={block.body || ""} onChange={(event) => updateBlock(block.id, { body: event.target.value })} />
      </Stack>
    );
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
                        <TableCell align="right">ข้อมูลในรอบนี้</TableCell>
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
                                ผู้เข้าร่วม {event.eventDataCounts?.participants || 0} / สนับสนุน {event.eventDataCounts?.donations || 0} / รางวัล {event.eventDataCounts?.prizes || 0} / แพ็กเกจ {event.eventDataCounts?.packages || 0}
                              </Typography>
                              {Object.values(event.legacyDataCounts || {}).some((count) => Number(count) > 0) && (
                                <Typography variant="caption" color="warning.main" display="block">
                                  มีข้อมูลเก่ารอ Migration ในปีนี้
                                </Typography>
                              )}
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

          {(showSettings || showLayouts) && (
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                {showSettings && (
                <Box mb={3}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2} mb={2}>
                    <Box>
                      <Typography variant="h6" fontWeight={900}>หน้าและฟีเจอร์ของกิจกรรม</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ตั้งค่าโลโก้ ภาพปก สี ข้อความ และเลือกเครื่องมือที่กิจกรรมนี้ใช้งาน
                      </Typography>
                    </Box>
                    <Button startIcon={<SaveIcon />} variant="outlined" onClick={handleSaveEventDetail} disabled={saving || !layoutEventId}>
                      บันทึกข้อมูลหน้า public
                    </Button>
                  </Stack>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                      <TextField size="small" fullWidth label="ชื่อกิจกรรม" value={eventDetailForm.name} onChange={(e) => setEventDetailForm({ ...eventDetailForm, name: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField size="small" fullWidth label="ปีงาน" value={eventDetailForm.eventYear} onChange={(e) => setEventDetailForm({ ...eventDetailForm, eventYear: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField size="small" fullWidth label="รหัส URL" helperText="เช่น event-name-2569" value={eventDetailForm.slug} onChange={(e) => setEventDetailForm({ ...eventDetailForm, slug: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField select size="small" fullWidth label="การเชื่อมข้อมูล" value={eventDetailForm.linkingMode} onChange={(e) => setEventDetailForm({ ...eventDetailForm, linkingMode: e.target.value })}>
                        <MenuItem value="isolated">{linkingModeLabels.isolated}</MenuItem>
                        <MenuItem value="series-linked">{linkingModeLabels["series-linked"]}</MenuItem>
                        <MenuItem value="manual-linked">{linkingModeLabels["manual-linked"]}</MenuItem>
                      </TextField>
                    </Grid>
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
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "#fff" }}>
                        <Typography fontWeight={900}>ฟีเจอร์ที่เปิดใช้</Typography>
                        <Typography variant="caption" color="text.secondary">ปิดฟีเจอร์ที่ไม่ใช้ เพื่อลดเมนูที่ไม่เกี่ยวข้องและลดความสับสนของทีมงาน</Typography>
                        <Grid container spacing={1} mt={0.5}>
                          {featureOptions.map((feature) => (
                            <Grid item xs={12} sm={6} md={4} key={feature.key}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    size="small"
                                    checked={eventDetailForm.enabledFeatures?.[feature.key] !== false}
                                    onChange={(e) => {
                                      const enabledFeatures = {
                                        ...eventDetailForm.enabledFeatures,
                                        [feature.key]: e.target.checked,
                                      };
                                      setEventDetailForm({
                                        ...eventDetailForm,
                                        enabledFeatures,
                                        enableRegister: feature.key === "registration" ? e.target.checked : eventDetailForm.enableRegister,
                                      });
                                    }}
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
                    </Grid>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        การดึงข้อมูลลงทะเบียนเดิมใช้กับงานที่จัดต่อเนื่องรายปี ผู้เข้าร่วมจะขอ OTP ทางอีเมลก่อน ระบบจึงจะเติมข้อมูลเดิมให้ ไม่เปิดเผยข้อมูลจากการเดาอีเมล
                      </Alert>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField select size="small" fullWidth label="ดึงข้อมูลลงทะเบียนเดิม" value={eventDetailForm.allowRegistrationReuse ? "yes" : "no"} onChange={(e) => setEventDetailForm({ ...eventDetailForm, allowRegistrationReuse: e.target.value === "yes" })}>
                        <MenuItem value="no">ปิด</MenuItem>
                        <MenuItem value="yes">เปิด และบังคับ OTP</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField select size="small" fullWidth label="แหล่งข้อมูลเดิม" value={eventDetailForm.registrationReuseMode} onChange={(e) => setEventDetailForm({ ...eventDetailForm, registrationReuseMode: e.target.value })}>
                        <MenuItem value="series-linked">รอบก่อนในชุดกิจกรรมเดียวกัน</MenuItem>
                        <MenuItem value="manual-linked">เลือกกิจกรรมเอง</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField size="small" fullWidth label="การยืนยันตัวตน" value="OTP ทางอีเมล (บังคับ)" InputProps={{ readOnly: true }} />
                    </Grid>
                    {eventDetailForm.registrationReuseMode === "manual-linked" && (
                      <Grid item xs={12}>
                        <TextField
                          select
                          fullWidth
                          size="small"
                          SelectProps={{ multiple: true }}
                          label="กิจกรรมต้นทางที่อนุญาตให้ดึงข้อมูลเดิม"
                          value={(eventDetailForm.registrationReuseEventIds || []).map(String)}
                          onChange={(e) => setEventDetailForm({ ...eventDetailForm, registrationReuseEventIds: e.target.value })}
                          helperText="เลือกได้หลายรอบ เช่น งานปี 2024/2025 เพื่อให้ผู้เข้าร่วมยืนยันอีเมลแล้วดึงข้อมูลมาเติมได้"
                        >
                          {catalog.events.filter((item) => getId(item) !== layoutEventId).map((item) => (
                            <MenuItem key={getId(item)} value={getId(item)}>{item.name} / {item.eventYear}</MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                    )}
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
                    <Typography variant="caption" color="text.secondary">ออกแบบด้วยบล็อกแบบลากเรียงลำดับได้ ระบบยังตรวจ schema ให้ก่อนบันทึกเหมือนเดิม</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button variant="outlined" onClick={applyDefaultTemplate} disabled={saving}>ใช้แม่แบบมาตรฐาน</Button>
                    <Button startIcon={<ContentCopyIcon />} onClick={handleCloneSettings} disabled={saving || !eventForm.cloneFromEventId || !layoutEventId}>
                      คัดลอกไปยังรอบที่เลือก
                    </Button>
                  </Stack>
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
                  <Grid container spacing={2}>
                    <Grid item xs={12} lg={7}>
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff" }}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addLayoutBlock("hero")}>Hero</Button>
                          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addLayoutBlock("richText")}>ข้อความ</Button>
                          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addLayoutBlock("schedule")}>กำหนดการ</Button>
                          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addLayoutBlock("faq")}>FAQ</Button>
                          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addLayoutBlock("cta")}>ปุ่ม CTA</Button>
                        </Stack>

                        <Stack spacing={1.25}>
                          {layoutBlocks.length === 0 && (
                            <EmptyState title="ยังไม่มีบล็อก" description="เลือกบล็อกด้านบนเพื่อเริ่มจัดหน้า Landing ของกิจกรรมนี้" />
                          )}
                          {layoutBlocks.map((block, index) => (
                            <Accordion
                              key={block.id}
                              defaultExpanded={index === 0}
                              draggable
                              onDragStart={() => setDragBlockId(block.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                moveBlock(dragBlockId, block.id);
                                setDragBlockId("");
                              }}
                              sx={{
                                border: "1px solid",
                                borderColor: dragBlockId && dragBlockId !== block.id ? "primary.main" : "divider",
                                borderRadius: "8px !important",
                                boxShadow: "none",
                                "&:before": { display: "none" },
                              }}
                            >
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: "100%" }}>
                                  <DragIndicatorIcon color="disabled" />
                                  <Chip size="small" label={index + 1} />
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography fontWeight={950} noWrap>{blockTitle(block)}: {block.title || block.subtitle || block.buttonLabel || "-"}</Typography>
                                    <Typography variant="caption" color="text.secondary">{block.enabled === false ? "ซ่อนอยู่" : "แสดงบนหน้า Public"}</Typography>
                                  </Box>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      removeBlock(block.id);
                                    }}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </AccordionSummary>
                              <AccordionDetails>
                                {renderBlockEditor(block)}
                              </AccordionDetails>
                            </Accordion>
                          ))}
                        </Stack>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} lg={5}>
                      <LayoutPreview layoutKey={layoutKey} config={layoutConfig} event={layoutEvent} />
                    </Grid>
                  </Grid>
                )}
                {layoutKey !== "landingPage" && (
                  <Grid container spacing={2}>
                  <Grid item xs={12} lg={7}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff" }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      แม่แบบส่วนนี้แก้ผ่านฟอร์มได้เลย หากต้องปรับละเอียดมากกว่านี้ให้เปิด JSON ขั้นสูงด้านล่าง
                    </Alert>
                    <Stack spacing={1.5}>
                      {layoutKey === "registrationForm" && (
                        <Stack spacing={1.5}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography fontWeight={900}>ช่องข้อมูลในแบบฟอร์ม</Typography>
                              <Typography variant="caption" color="text.secondary">เหมาะกับ field เฉพาะกิจกรรม ส่วน field หลักยังจัดการได้จาก Participant Fields</Typography>
                            </Box>
                            <Button
                              size="small"
                              startIcon={<AddIcon />}
                              variant="outlined"
                              onClick={() => {
                                const id = `field_${Date.now()}`;
                                addCollectionItem("fields", { id, key: id, name: id, label: "ช่องข้อมูลใหม่", type: "text", required: false });
                              }}
                            >
                              เพิ่ม Field
                            </Button>
                          </Stack>
                          {collection("fields").length === 0 && <EmptyState title="ยังไม่มี field เฉพาะกิจกรรม" description="กดเพิ่ม Field หากกิจกรรมนี้ต้องถามข้อมูลพิเศษ" />}
                          {collection("fields").map((field, index) => (
                            <Paper
                              key={`${field.name || field.key || index}`}
                              variant="outlined"
                              draggable
                              onDragStart={() => setDragBlockId(`fields:${index}`)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                const fromIndex = Number(String(dragBlockId).split(":")[1]);
                                moveCollectionItem("fields", fromIndex, index);
                                setDragBlockId("");
                              }}
                              sx={{ p: 1.5, borderRadius: 2, borderColor: dragBlockId ? "primary.main" : "divider" }}
                            >
                              <Grid container spacing={1.25} alignItems="center">
                                <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Key" value={field.name || field.key || ""} onChange={(event) => updateCollectionItem("fields", index, { id: event.target.value, key: event.target.value, name: event.target.value })} /></Grid>
                                <Grid item xs={12} md={4}><TextField fullWidth size="small" label="ชื่อช่อง" value={field.label || ""} onChange={(event) => updateCollectionItem("fields", index, { label: event.target.value })} /></Grid>
                                <Grid item xs={12} md={2}>
                                  <TextField select fullWidth size="small" label="ประเภท" value={field.type || "text"} onChange={(event) => updateCollectionItem("fields", index, { type: event.target.value })}>
                                    <MenuItem value="text">ข้อความ</MenuItem>
                                    <MenuItem value="email">อีเมล</MenuItem>
                                    <MenuItem value="tel">เบอร์โทร</MenuItem>
                                    <MenuItem value="select">ตัวเลือก</MenuItem>
                                    <MenuItem value="textarea">หลายบรรทัด</MenuItem>
                                  </TextField>
                                </Grid>
                                <Grid item xs={8} md={2}>
                                  <FormControlLabel control={<Switch checked={field.required === true} onChange={(event) => updateCollectionItem("fields", index, { required: event.target.checked })} />} label="บังคับกรอก" />
                                </Grid>
                                <Grid item xs={4} md={1} textAlign="right"><IconButton color="error" onClick={() => removeCollectionItem("fields", index)}><DeleteIcon /></IconButton></Grid>
                              </Grid>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                      {layoutKey === "dashboard" && (
                        <Stack spacing={1.5}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography fontWeight={900}>Widgets ใน Dashboard</Typography>
                            <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addCollectionItem("widgets", { type: "metric", title: "Widget ใหม่", enabled: true })}>เพิ่ม Widget</Button>
                          </Stack>
                          {collection("widgets").length === 0 && <EmptyState title="ใช้ Dashboard มาตรฐาน" description="เพิ่ม Widget เฉพาะกิจกรรมเมื่ออยากจัดหน้า dashboard เอง" />}
                          {collection("widgets").map((widget, index) => (
                            <Paper
                              key={`${widget.id || widget.type || "widget"}-${index}`}
                              variant="outlined"
                              draggable
                              onDragStart={() => setDragBlockId(`widgets:${index}`)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                const fromIndex = Number(String(dragBlockId).split(":")[1]);
                                moveCollectionItem("widgets", fromIndex, index);
                                setDragBlockId("");
                              }}
                              sx={{ p: 1.5, borderRadius: 2, borderColor: dragBlockId ? "primary.main" : "divider" }}
                            >
                              <Grid container spacing={1.25} alignItems="center">
                                <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="ชนิด" value={widget.type || "metric"} onChange={(event) => updateCollectionItem("widgets", index, { type: event.target.value })}><MenuItem value="metric">Metric</MenuItem><MenuItem value="chart">Chart</MenuItem><MenuItem value="table">Table</MenuItem></TextField></Grid>
                                <Grid item xs={12} md={6}><TextField fullWidth size="small" label="ชื่อ Widget" value={widget.title || ""} onChange={(event) => updateCollectionItem("widgets", index, { title: event.target.value })} /></Grid>
                                <Grid item xs={8} md={2}><FormControlLabel control={<Switch checked={widget.enabled !== false} onChange={(event) => updateCollectionItem("widgets", index, { enabled: event.target.checked })} />} label="เปิด" /></Grid>
                                <Grid item xs={4} md={1} textAlign="right"><IconButton color="error" onClick={() => removeCollectionItem("widgets", index)}><DeleteIcon /></IconButton></Grid>
                              </Grid>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                      {layoutKey === "ticket" && (
                        <Stack spacing={1.5}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography fontWeight={900}>บล็อกในบัตร/อีเมลยืนยัน</Typography>
                            <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addCollectionItem("blocks", { type: "text", title: "หัวข้อ", body: "รายละเอียด", enabled: true })}>เพิ่มบล็อก</Button>
                          </Stack>
                          {collection("blocks").length === 0 && <EmptyState title="ใช้บัตร/อีเมลมาตรฐาน" description="เพิ่มบล็อกเมื่ออยากใส่ข้อความเฉพาะกิจกรรม" />}
                          {collection("blocks").map((block, index) => (
                            <Paper
                              key={`${block.id || block.title || "ticket"}-${index}`}
                              variant="outlined"
                              draggable
                              onDragStart={() => setDragBlockId(`blocks:${index}`)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                const fromIndex = Number(String(dragBlockId).split(":")[1]);
                                moveCollectionItem("blocks", fromIndex, index);
                                setDragBlockId("");
                              }}
                              sx={{ p: 1.5, borderRadius: 2, borderColor: dragBlockId ? "primary.main" : "divider" }}
                            >
                              <Stack spacing={1}>
                                <TextField size="small" label="หัวข้อ" value={block.title || ""} onChange={(event) => updateCollectionItem("blocks", index, { title: event.target.value })} />
                                <TextField size="small" multiline minRows={2} label="รายละเอียด" value={block.body || ""} onChange={(event) => updateCollectionItem("blocks", index, { body: event.target.value })} />
                                <Box><IconButton color="error" onClick={() => removeCollectionItem("blocks", index)}><DeleteIcon /></IconButton></Box>
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                      {layoutKey === "report" && (
                        <Stack spacing={1.5}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography fontWeight={900}>คอลัมน์รายงาน</Typography>
                            <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => addCollectionItem("columns", { key: "name", label: "ชื่อ", enabled: true })}>เพิ่มคอลัมน์</Button>
                          </Stack>
                          {collection("columns").length === 0 && <EmptyState title="ใช้คอลัมน์รายงานมาตรฐาน" description="เพิ่มคอลัมน์เมื่ออยากกำหนดรายงานเฉพาะกิจกรรม" />}
                          {collection("columns").map((column, index) => (
                            <Paper
                              key={`${column.id || column.key || "column"}-${index}`}
                              variant="outlined"
                              draggable
                              onDragStart={() => setDragBlockId(`columns:${index}`)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                const fromIndex = Number(String(dragBlockId).split(":")[1]);
                                moveCollectionItem("columns", fromIndex, index);
                                setDragBlockId("");
                              }}
                              sx={{ p: 1.5, borderRadius: 2, borderColor: dragBlockId ? "primary.main" : "divider" }}
                            >
                              <Grid container spacing={1.25} alignItems="center">
                                <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Key" value={column.key || ""} onChange={(event) => updateCollectionItem("columns", index, { key: event.target.value })} /></Grid>
                                <Grid item xs={12} md={5}><TextField fullWidth size="small" label="ชื่อคอลัมน์" value={column.label || ""} onChange={(event) => updateCollectionItem("columns", index, { label: event.target.value })} /></Grid>
                                <Grid item xs={8} md={2}><FormControlLabel control={<Switch checked={column.enabled !== false} onChange={(event) => updateCollectionItem("columns", index, { enabled: event.target.checked })} />} label="เปิด" /></Grid>
                                <Grid item xs={4} md={1} textAlign="right"><IconButton color="error" onClick={() => removeCollectionItem("columns", index)}><DeleteIcon /></IconButton></Grid>
                              </Grid>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                  </Grid>
                  <Grid item xs={12} lg={5}>
                    <LayoutPreview layoutKey={layoutKey} config={layoutConfig} event={layoutEvent} />
                  </Grid>
                  </Grid>
                )}
                <Accordion expanded={advancedJsonOpen} onChange={(_, expanded) => setAdvancedJsonOpen(expanded)} sx={{ mt: 2, borderRadius: "8px !important", boxShadow: "none", border: "1px solid #e4e7ec", "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight={900}>JSON ขั้นสูงสำหรับทีมเทคนิค</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TextField
                      value={layoutJson}
                      onChange={(e) => setLayoutJson(e.target.value)}
                      error={!!layoutError}
                      helperText={layoutError || "ระบบจะตรวจ schema ฝั่ง server ก่อนบันทึกเสมอ"}
                      multiline
                      minRows={10}
                      fullWidth
                      sx={{ fontFamily: "monospace", "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
                    />
                  </AccordionDetails>
                </Accordion>
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
