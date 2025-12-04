const axios = require('axios');

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  
  if (!secret) {
    console.warn("⚠️ TURNSTILE_SECRET_KEY not set. Skipping verification.");
    return true; 
  }

  if (!token) return false;

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const res = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', formData);
    
    return res.data && res.data.success;
  } catch (err) {
    console.error("Turnstile verification error:", err.message);
    // เพิ่มบรรทัดนี้เพื่อดู response จริงจาก Cloudflare ถ้ามี
    if (err.response) console.error("Cloudflare Response:", err.response.data);
    return false;
  }
}

module.exports = verifyTurnstile;