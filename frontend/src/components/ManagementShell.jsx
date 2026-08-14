import React, { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Breadcrumbs,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  TextField,
} from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import useAuth from "../hooks/useAuth";
import getAvatarUrl from "../utils/getAvatarUrl";
import { appendQuery, eventContextFromSearch, eventContextToParams } from "../utils/eventContext";
import managementTheme from "../theme/managementTheme";
import CommandPalette from "./CommandPalette";
import { canSee, findNavItem, navGroups, rolePreviewOptions, rolesOf } from "../utils/navigation";
import { getEventCatalog } from "../utils/api";

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
  const [commandOpen, setCommandOpen] = useState(false);
  const [previewRole, setPreviewRole] = useState("");
  const [eventsById, setEventsById] = useState({});
  const eventParams = useMemo(
    () => eventContextToParams(eventContextFromSearch(location.search)),
    [location.search]
  );
  const displayName = user?.fullName || user?.username || "ผู้ใช้งาน";
  const isSuperadmin = rolesOf(user).includes("superadmin");

  const visibleGroups = useMemo(
    () => navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canSee(user, item.roles, previewRole)),
      }))
      .filter((group) => group.items.length > 0),
    [previewRole, user]
  );

  useEffect(() => {
    let alive = true;
    getEventCatalog()
      .then((res) => {
        if (!alive) return;
        const next = {};
        (res.data?.data?.events || []).forEach((event) => {
          const id = event?._id || event?.id;
          if (id) next[id] = event;
        });
        setEventsById(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (path) => {
    setAnchorByGroup({});
    navigate(appendQuery(path, eventParams));
  };

  const isActiveItem = (item) => (
    item.exact ? location.pathname === item.path : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );
  const currentItem = findNavItem(location.pathname);
  const currentEvent = eventParams.eventId ? eventsById[eventParams.eventId] : null;
  const breadcrumbs = [
    { label: "กิจกรรม", path: "/workspace" },
    currentEvent ? { label: currentEvent.name || `งาน ${currentEvent.eventYear || ""}`, path: `/workspace/events/${eventParams.eventId}` } : null,
    currentItem ? { label: currentItem.label, path: currentItem.path } : null,
  ].filter(Boolean);

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
                  const GroupIcon = group.icon;
                  return (
                    <Box key={group.label}>
                      <Button
                        startIcon={<GroupIcon fontSize="small" />}
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
                              <Box sx={{ color: "primary.dark", display: "flex" }}>
                                {React.createElement(item.icon || group.icon, { fontSize: "small" })}
                              </Box>
                              <Typography fontWeight={800}>{item.label}</Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </Menu>
                    </Box>
                  );
                })}
              </Stack>

              <Tooltip title="ค้นหาเร็ว (⌘K / Ctrl K)">
                <IconButton onClick={() => setCommandOpen(true)} sx={{ border: "1px solid #e4e7ec", bgcolor: "#fff" }}>
                  <SearchIcon />
                </IconButton>
              </Tooltip>

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
                {isSuperadmin && (
                  <Box sx={{ px: 2, pb: 1.25 }}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="ดูเมนูในมุมมอง"
                      value={previewRole}
                      onChange={(event) => setPreviewRole(event.target.value)}
                    >
                      {rolePreviewOptions.map((item) => (
                        <MenuItem key={item.value || "real"} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </TextField>
                  </Box>
                )}
                <Divider />
                <MenuItem onClick={() => { setProfileAnchor(null); navigate("/profile"); }}>
                  <PersonIcon sx={{ mr: 1.25 }} fontSize="small" /> โปรไฟล์
                </MenuItem>
                <MenuItem onClick={() => { setProfileAnchor(null); logout(); }} sx={{ color: "error.main" }}>
                  <LogoutIcon sx={{ mr: 1.25 }} fontSize="small" /> ออกจากระบบ
                </MenuItem>
              </Menu>
            </Toolbar>
            <Box sx={{ px: { xs: 1.5, md: 3 }, pb: 1.25, display: { xs: "none", md: "block" } }}>
              <Breadcrumbs separator="›" aria-label="breadcrumb">
                {breadcrumbs.map((item, index) => {
                  const last = index === breadcrumbs.length - 1;
                  const path = item.path?.startsWith("/workspace/events/")
                    ? appendQuery(item.path, eventParams)
                    : appendQuery(item.path || "/workspace", eventParams);
                  return last ? (
                    <Typography key={`${item.label}-${index}`} variant="caption" color="text.primary" fontWeight={900}>{item.label}</Typography>
                  ) : (
                    <Button key={`${item.label}-${index}`} size="small" color="inherit" onClick={() => navigate(path)} sx={{ minWidth: 0, p: 0, fontSize: 12 }}>
                      {item.label}
                    </Button>
                  );
                })}
              </Breadcrumbs>
              {previewRole && (
                <Typography variant="caption" color="warning.dark" fontWeight={800}>
                  Role preview: กำลังดูเมนูแบบ {rolePreviewOptions.find((item) => item.value === previewRole)?.label}
                </Typography>
              )}
            </Box>
          </Container>
        </AppBar>
        <Box>{children}</Box>
        <CommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          user={user}
          eventParams={eventParams}
          previewRole={previewRole}
          onNavigate={navigate}
        />
      </Box>
    </ThemeProvider>
  );
}
