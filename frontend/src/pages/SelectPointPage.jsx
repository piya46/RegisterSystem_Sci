// frontend/src/pages/RegistrationPointSelector.jsx
import React, { useEffect, useMemo, useState } from "react";
import { listRegistrationPoints } from "../utils/api";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, TextField, MenuItem, Button,
  CircularProgress, Alert, Stack, Avatar, Chip, InputAdornment, Container
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HistoryIcon from "@mui/icons-material/History";

// Theme Configuration
const THEME = {
  gradientBg: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #ffe082 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
  primary: "#FFC107", // Amber
  dark: "#F57F17",
  text: "#4E342E"
};

/**
 * Props:
 * - redirectTo: path ปลายทาง (Default: /kiosk or /staff)
 * - title: Custom Title
 */
export default function RegistrationPointSelector({ redirectTo: propRedirectTo, title }) {
  const [points, setPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");

  // Determine Destination
  const params = new URLSearchParams(location.search);
  const targetPath =
    propRedirectTo ||
    params.get("redirectTo") ||
    (window.location.pathname.includes("staff") ? "/staff" : "/kiosk");

  // Load Last Used Point
  useEffect(() => {
    const last = localStorage.getItem("lastPoint");
    if (last) setSelectedPoint(last);
  }, []);

  // Fetch Data
  const fetchPoints = () => {
    setLoading(true);
    setError("");
    listRegistrationPoints(token)
      .then((res) => setPoints(res.data || res || []))
      .catch((err) => {
        console.error(err);
        setError("Failed to load registration points.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPoint) return;
    localStorage.setItem("lastPoint", selectedPoint);
    navigate(`${targetPath}?point=${selectedPoint}`);
  };

  // Check if current selection is the same as last used
  const lastPointId = localStorage.getItem("lastPoint");
  const isLastUsed = lastPointId && lastPointId === selectedPoint;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: THEME.gradientBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2
      }}
    >
      <Container maxWidth="xs">
        <Card
          elevation={8}
          sx={{
            borderRadius: 5,
            background: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 193, 7, 0.3)",
            overflow: "visible" // Allow Avatar to float if needed
          }}
        >
          <CardContent sx={{ p: 4, textAlign: "center" }}>
            
            {/* Logo Section */}
            <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
              <Avatar
                src="/logo.svg"
                alt="Logo"
                sx={{
                  width: 80, height: 80,
                  bgcolor: "#fff",
                  boxShadow: "0 4px 12px rgba(255, 193, 7, 0.4)",
                  border: "2px solid #FFECB3"
                }}
              />
            </Box>

            {/* Header */}
            <Typography variant="h5" fontWeight={800} sx={{ color: THEME.text, mb: 0.5 }}>
              {title || "Select Registration Point"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Choose your location to proceed
            </Typography>

            {/* Content Area */}
            {loading ? (
              <Box sx={{ py: 4 }}>
                <CircularProgress sx={{ color: THEME.primary }} />
                <Typography variant="caption" display="block" sx={{ mt: 2, color: "text.secondary" }}>
                  Loading Points...
                </Typography>
              </Box>
            ) : error ? (
              <Alert 
                severity="error" 
                action={
                  <Button color="inherit" size="small" onClick={fetchPoints} startIcon={<RefreshIcon />}>
                    Retry
                  </Button>
                }
                sx={{ borderRadius: 3, mb: 2, textAlign: "left" }}
              >
                {error}
              </Alert>
            ) : (
              <form onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  
                  {/* Selector */}
                  <TextField
                    select
                    label="Registration Point"
                    value={selectedPoint}
                    onChange={(e) => setSelectedPoint(e.target.value)}
                    fullWidth
                    required
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationOnIcon sx={{ color: THEME.primary }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3,
                        bgcolor: "#fff",
                        "& fieldset": { borderColor: "#FFECB3" },
                        "&:hover fieldset": { borderColor: THEME.primary },
                        "&.Mui-focused fieldset": { borderColor: THEME.primary }
                      }
                    }}
                  >
                    <MenuItem value="" disabled>
                      <em>-- Select Location --</em>
                    </MenuItem>
                    {points.map((p) => (
                      <MenuItem key={p._id || p.id} value={p._id || p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  {/* Feedback / Status */}
                  {selectedPoint && (
                     <Box 
                       sx={{ 
                         p: 1.5, 
                         borderRadius: 3, 
                         bgcolor: isLastUsed ? "#FFF8E1" : "#F1F8E9", 
                         border: `1px dashed ${isLastUsed ? "#FFC107" : "#AED581"}`,
                         display: "flex", alignItems: "center", gap: 1
                       }}
                     >
                        {isLastUsed ? <HistoryIcon color="warning" fontSize="small"/> : <CheckCircleIcon color="success" fontSize="small"/>}
                        <Typography variant="caption" fontWeight={600} color={isLastUsed ? "warning.dark" : "success.dark"}>
                           {isLastUsed ? "Last Used Location" : "Location Selected"}
                        </Typography>
                     </Box>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={!selectedPoint}
                    endIcon={<ArrowForwardIcon />}
                    sx={{
                      borderRadius: 3,
                      fontWeight: 800,
                      py: 1.5,
                      bgcolor: THEME.primary,
                      color: "#4e342e",
                      boxShadow: "0 8px 16px rgba(255, 193, 7, 0.4)",
                      "&:hover": { bgcolor: THEME.dark }
                    }}
                  >
                    Next
                  </Button>

                  {/* Destination Hint */}
                  <Typography variant="caption" color="text.disabled">
                    Target Path: <b>{targetPath}</b>
                  </Typography>

                </Stack>
              </form>
            )}

          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}