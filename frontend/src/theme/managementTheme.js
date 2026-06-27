import { createTheme } from "@mui/material";

export const managementTokens = {
  color: {
    gold: "#f6b700",
    goldDark: "#7a5200",
    ink: "#263238",
    muted: "#667085",
    border: "#e4e7ec",
    surface: "#ffffff",
    canvas: "#f6f8fb",
    green: "#1f7a5f",
    red: "#d92d20",
    blue: "#2563eb",
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 12,
  },
  shadow: {
    card: "0 10px 30px rgba(16, 24, 40, 0.06)",
    menu: "0 18px 45px rgba(16, 24, 40, 0.14)",
  },
  spacing: {
    pageY: 3,
    toolbarHeight: 68,
  },
};

const managementTheme = createTheme({
  palette: {
    primary: { main: managementTokens.color.gold, dark: managementTokens.color.goldDark, contrastText: "#332400" },
    secondary: { main: managementTokens.color.green, contrastText: "#ffffff" },
    background: { default: managementTokens.color.canvas, paper: managementTokens.color.surface },
    text: { primary: managementTokens.color.ink, secondary: managementTokens.color.muted },
    error: { main: managementTokens.color.red },
    info: { main: managementTokens.color.blue },
  },
  typography: {
    fontFamily: "'Prompt', 'Kanit', sans-serif",
    button: { textTransform: "none", fontWeight: 800 },
  },
  shape: { borderRadius: managementTokens.radius.md },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: managementTokens.radius.md,
          letterSpacing: 0,
          boxShadow: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: managementTokens.radius.md, fontWeight: 800 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: managementTokens.radius.md,
          boxShadow: managementTokens.shadow.card,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
  },
});

export default managementTheme;
