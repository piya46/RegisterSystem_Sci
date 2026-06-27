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
import SyncAltIcon from "@mui/icons-material/SyncAlt";

export function rolesOf(user) {
  return Array.isArray(user?.role) ? user.role.filter(Boolean) : [user?.role].filter(Boolean);
}

export function canSee(user, roles = [], previewRole = "") {
  const userRoles = previewRole ? [previewRole] : rolesOf(user);
  return userRoles.includes("superadmin") || roles.length === 0 || roles.some((role) => userRoles.includes(role));
}

export const rolePreviewOptions = [
  { value: "", label: "สิทธิ์จริงของฉัน" },
  { value: "admin", label: "Admin" },
  { value: "event_admin", label: "Event Admin" },
  { value: "event_manager", label: "Event Manager" },
  { value: "staff", label: "Staff" },
  { value: "auditor", label: "Auditor" },
  { value: "kiosk", label: "Kiosk" },
];

export const navGroups = [
  {
    label: "กิจกรรม",
    icon: EventAvailableIcon,
    items: [
      { label: "เลือกกิจกรรม", path: "/workspace", roles: ["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff"] },
      { label: "จัดการกิจกรรม", path: "/admin/events", roles: ["admin", "org_admin", "event_admin", "event_manager"] },
      { label: "Migration ข้อมูลเดิม", path: "/admin/events/migration", roles: ["admin"], icon: SyncAltIcon },
    ],
  },
  {
    label: "ปฏิบัติงาน",
    icon: QrCodeIcon,
    items: [
      { label: "ภาพรวม", path: "/dashboard", roles: ["admin", "org_admin", "event_admin", "event_manager", "auditor", "staff", "kiosk"], icon: DashboardIcon },
      { label: "เช็คอินหน้างาน", path: "/staff", roles: ["admin", "staff"], icon: QrCodeIcon },
      { label: "เลือกจุดลงทะเบียน", path: "/staff/select-point", roles: ["admin", "staff"], icon: StoreIcon },
      { label: "เครื่องลงทะเบียน", path: "/kiosk", roles: ["admin", "staff", "kiosk"], icon: StoreIcon },
      { label: "สุ่มรางวัล", path: "/admin/lucky-draw", roles: ["admin"], icon: EmojiEventsIcon },
    ],
  },
  {
    label: "ข้อมูล",
    icon: PeopleIcon,
    items: [
      { label: "ผู้เข้าร่วม", path: "/admin/participants", roles: ["admin"], icon: PeopleIcon },
      { label: "ผู้สนับสนุน", path: "/admin/donations", roles: ["admin"], icon: VolunteerActivismIcon },
      { label: "รายงานสด", path: "/public/report", roles: ["admin", "auditor"], icon: TimelineIcon },
    ],
  },
  {
    label: "ตั้งค่า",
    icon: SettingsIcon,
    items: [
      { label: "ผู้ใช้และสิทธิ์", path: "/admin", exact: true, roles: ["admin"], icon: GroupIcon },
      { label: "จุดลงทะเบียน", path: "/registration-points", roles: ["admin"], icon: StoreIcon },
      { label: "ตั้งค่าระบบ", path: "/settings", roles: ["admin"], icon: SettingsIcon },
      { label: "Session", path: "/admin/sessions", roles: ["admin"], icon: PeopleIcon },
      { label: "Cron", path: "/admin/cron-status", roles: ["admin"], icon: TimelineIcon },
    ],
  },
];

export function flattenNavGroups(groups = navGroups) {
  return groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label, groupIcon: group.icon })));
}

export function findNavItem(pathname, groups = navGroups) {
  return flattenNavGroups(groups)
    .filter((item) => (item.exact ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0] || null;
}
