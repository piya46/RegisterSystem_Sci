import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import PeopleIcon from "@mui/icons-material/People";
import KeyboardCommandKeyIcon from "@mui/icons-material/KeyboardCommandKey";
import { appendQuery } from "../utils/eventContext";
import { getEventCatalog, searchParticipants } from "../utils/api";
import { canSee, flattenNavGroups, navGroups } from "../utils/navigation";

function getId(value) {
  return value?._id || value?.id || value || "";
}

function participantName(participant) {
  const fields = participant?.fields || {};
  return fields.name || fields.fullName || fields.fullname || "ไม่ระบุชื่อ";
}

function participantMeta(participant) {
  const fields = participant?.fields || {};
  return [fields.phone, fields.email, participant?.status].filter(Boolean).join(" / ");
}

export default function CommandPalette({ open, onClose, user, eventParams, previewRole = "", onNavigate }) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState({ events: [] });
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getEventCatalog()
      .then((res) => {
        if (!alive) return;
        setCatalog(res.data?.data || { events: [] });
      })
      .catch(() => {
        if (alive) setCatalog({ events: [] });
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setParticipants([]);
      return;
    }
    const text = query.trim();
    if (text.length < 2 || !eventParams?.eventId || !canSee(user, ["admin", "staff"], previewRole)) {
      setParticipants([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoadingParticipants(true);
      searchParticipants({ q: text, ...eventParams })
        .then((res) => {
          if (!alive) return;
          const data = Array.isArray(res.data) ? res.data : [];
          setParticipants(data.slice(0, 6));
        })
        .catch(() => {
          if (alive) setParticipants([]);
        })
        .finally(() => {
          if (alive) setLoadingParticipants(false);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [eventParams, open, previewRole, query, user]);

  const visibleNavItems = useMemo(
    () => flattenNavGroups(navGroups).filter((item) => canSee(user, item.roles, previewRole)),
    [previewRole, user]
  );

  const pageResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return visibleNavItems
      .filter((item) => !keyword || `${item.group} ${item.label}`.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [query, visibleNavItems]);

  const eventResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (catalog.events || [])
      .filter((event) => {
        if (!keyword) return true;
        return [event.name, event.slug, event.eventYear, event.status].filter(Boolean).join(" ").toLowerCase().includes(keyword);
      })
      .slice(0, 8);
  }, [catalog.events, query]);

  const navigateAndClose = (path) => {
    onNavigate(path);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SearchIcon color="warning" />
            <Typography variant="h6" fontWeight={950}>Quick Search</Typography>
          </Stack>
          <Chip size="small" icon={<KeyboardCommandKeyIcon />} label="⌘K / Ctrl K" variant="outlined" />
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="ค้นหาหน้า, กิจกรรม, ผู้เข้าร่วม"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary" fontWeight={900}>หน้าในระบบ</Typography>
            <List dense disablePadding>
              {pageResults.map((item) => {
                const Icon = item.icon || item.groupIcon;
                return (
                  <ListItemButton key={`${item.group}-${item.path}`} onClick={() => navigateAndClose(appendQuery(item.path, eventParams))} sx={{ borderRadius: 1 }}>
                    <ListItemIcon sx={{ minWidth: 38, color: "primary.dark" }}><Icon fontSize="small" /></ListItemIcon>
                    <ListItemText primary={<Typography fontWeight={850}>{item.label}</Typography>} secondary={item.group} />
                  </ListItemButton>
                );
              })}
              {pageResults.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>ไม่พบหน้าที่ตรงกับคำค้นหา</Typography>}
            </List>
          </Box>

          <Divider />
          <Box>
            <Typography variant="overline" color="text.secondary" fontWeight={900}>กิจกรรม</Typography>
            <List dense disablePadding>
              {eventResults.map((event) => {
                const id = getId(event);
                const params = { eventId: id, eventYear: event.eventYear };
                return (
                  <ListItemButton key={id} onClick={() => navigateAndClose(appendQuery(`/workspace/events/${id}`, params))} sx={{ borderRadius: 1 }}>
                    <ListItemIcon sx={{ minWidth: 44 }}>
                      <Avatar src={event.branding?.logoUrl} sx={{ width: 30, height: 30, bgcolor: event.branding?.primaryColor || "primary.main" }}>
                        <EventAvailableIcon fontSize="small" />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography fontWeight={850}>{event.name}</Typography>}
                      secondary={`ปี ${event.eventYear || "-"} / ${event.slug || "-"}`}
                    />
                    <Chip size="small" label={event.status || "-"} variant="outlined" />
                  </ListItemButton>
                );
              })}
              {eventResults.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>ไม่พบกิจกรรม</Typography>}
            </List>
          </Box>

          <Divider />
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="overline" color="text.secondary" fontWeight={900}>ผู้เข้าร่วม</Typography>
              {loadingParticipants && <CircularProgress size={14} />}
            </Stack>
            <List dense disablePadding>
              {participants.map((participant) => (
                <ListItemButton
                  key={participant._id}
                  onClick={() => navigateAndClose(appendQuery(canSee(user, ["admin"], previewRole) ? "/admin/participants" : "/staff", { ...eventParams, q: participantName(participant) }))}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: "primary.dark" }}><PeopleIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={<Typography fontWeight={850}>{participantName(participant)}</Typography>} secondary={participantMeta(participant)} />
                </ListItemButton>
              ))}
              {query.trim().length < 2 && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหาผู้เข้าร่วม</Typography>}
              {query.trim().length >= 2 && participants.length === 0 && !loadingParticipants && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>ไม่พบผู้เข้าร่วมที่ตรงกับคำค้นหา</Typography>
              )}
            </List>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
