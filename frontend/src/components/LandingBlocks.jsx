import React from 'react';
import { Box, Container, Stack, Avatar, Typography, Button, Paper, Divider } from '@mui/material';

export default function LandingBlocks({ event, blocks = [], hideRegistration = false }) {
  const branding = event?.branding || {};
  const visibleBlocks = (blocks || []).filter((block) => block.enabled !== false);
  const registrationUrl = event?.publicLinks?.registrationPath || `/e/${event?.slug}/register`;

  if (visibleBlocks.length === 0) {
    visibleBlocks.push({
      id: "default-hero",
      type: "hero",
      title: event?.name || "กิจกรรม",
      subtitle: event?.config?.welcomeMessage || "",
      primaryActionLabel: "ลงทะเบียน",
      primaryActionUrl: registrationUrl,
    });
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f7f9fb" }}>
      {visibleBlocks.map((block, index) => {
        if (block.type === "hero") {
          const imageUrl = block.imageUrl || branding.coverImageUrl;
          return (
            <Box
              key={block.id || index}
              sx={{
                minHeight: { xs: "82vh", md: "78vh" },
                display: "flex",
                alignItems: "center",
                color: "#fff",
                position: "relative",
                overflow: "hidden",
                bgcolor: branding.secondaryColor || "#114b5f",
                backgroundImage: imageUrl
                  ? `linear-gradient(90deg, rgba(8,28,41,.86), rgba(8,28,41,.45)), url(${imageUrl})`
                  : `linear-gradient(135deg, ${branding.secondaryColor || "#114b5f"}, ${branding.primaryColor || "#f7b500"})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <Container maxWidth="lg">
                <Stack spacing={3} sx={{ maxWidth: 760 }}>
                  {(block.logoUrl || branding.logoUrl) && (
                    <Avatar
                      src={block.logoUrl || branding.logoUrl}
                      alt={event?.name}
                      sx={{ width: 92, height: 92, bgcolor: "#fff", border: "3px solid rgba(255,255,255,.75)" }}
                    />
                  )}
                  <Box>
                    <Typography variant="overline" sx={{ fontWeight: 900, color: branding.primaryColor || "#ffd24d", letterSpacing: 0 }}>
                      {event?.eventYear ? `กิจกรรมปี ${event.eventYear}` : "Event"}
                    </Typography>
                    <Typography variant="h2" sx={{ fontWeight: 950, lineHeight: 1.05, fontSize: { xs: 40, md: 68 }, letterSpacing: 0 }}>
                      {block.title || event?.name}
                    </Typography>
                  </Box>
                  {(block.subtitle || block.body) && (
                    <Typography variant="h6" sx={{ maxWidth: 680, lineHeight: 1.75, color: "rgba(255,255,255,.9)" }}>
                      {block.subtitle || block.body}
                    </Typography>
                  )}
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    {!hideRegistration && (
                      <Button
                        component="a"
                        href={block.primaryActionUrl || registrationUrl}
                        variant="contained"
                        size="large"
                        sx={{ bgcolor: branding.primaryColor || "#f7b500", color: "#1f1a00", fontWeight: 900, px: 4 }}
                      >
                        {block.primaryActionLabel || "ลงทะเบียน"}
                      </Button>
                    )}
                    {block.secondaryActionLabel && block.secondaryActionUrl && (
                      <Button component="a" href={block.secondaryActionUrl} variant="outlined" size="large" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.65)" }}>
                        {block.secondaryActionLabel}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Container>
            </Box>
          );
        }

        if (block.type === "schedule") {
          return (
            <Container key={block.id || index} maxWidth="md" sx={{ py: 7 }}>
              <Typography variant="h4" fontWeight={900} mb={1}>{block.title || "กำหนดการ"}</Typography>
              {block.subtitle && <Typography color="text.secondary" mb={3}>{block.subtitle}</Typography>}
              <Stack spacing={1.5}>
                {(block.items || []).map((item, itemIndex) => (
                  <Paper key={`${block.id}-${itemIndex}`} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography fontWeight={900} color="primary.main">{item.time}</Typography>
                    <Typography fontWeight={800}>{item.title}</Typography>
                    {item.description && <Typography color="text.secondary">{item.description}</Typography>}
                  </Paper>
                ))}
              </Stack>
            </Container>
          );
        }

        if (block.type === "faq") {
          return (
            <Container key={block.id || index} maxWidth="md" sx={{ py: 7 }}>
              <Typography variant="h4" fontWeight={900} mb={3}>{block.title || "คำถามที่พบบ่อย"}</Typography>
              <Stack spacing={1.5}>
                {(block.items || []).map((item, itemIndex) => (
                  <Paper key={`${block.id}-${itemIndex}`} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography fontWeight={900}>{item.question}</Typography>
                    <Typography color="text.secondary">{item.answer}</Typography>
                  </Paper>
                ))}
              </Stack>
            </Container>
          );
        }

        if (block.type === "cta") {
          return (
            <Box key={block.id || index} sx={{ bgcolor: "#fff", py: 6 }}>
              <Container maxWidth="md">
                <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 3, textAlign: "center" }}>
                  <Typography variant="h4" fontWeight={900}>{block.title || "พร้อมเข้าร่วมกิจกรรมแล้วใช่ไหม"}</Typography>
                  {block.body && <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>{block.body}</Typography>}
                  <Button component="a" href={block.buttonUrl || registrationUrl} variant="contained" size="large">
                    {block.buttonLabel || "ลงทะเบียน"}
                  </Button>
                </Paper>
              </Container>
            </Box>
          );
        }

        if (block.type === "divider") return <Divider key={block.id || index} />;

        return (
          <Container key={block.id || index} maxWidth="md" sx={{ py: 7 }}>
            <Typography variant="h4" fontWeight={900} mb={1}>{block.title}</Typography>
            {block.subtitle && <Typography color="text.secondary" mb={2}>{block.subtitle}</Typography>}
            {block.body && <Typography sx={{ whiteSpace: "pre-line", lineHeight: 1.8 }}>{block.body}</Typography>}
          </Container>
        );
      })}
    </Box>
  );
}
