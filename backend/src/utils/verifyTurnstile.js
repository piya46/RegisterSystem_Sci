const axios = require('axios');

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  
  if (!secret) {
    console.warn("⚠️ TURNSTILE_SECRET_KEY not set. Skipping verification.");
    return true; 
  }

  if (!token) {
    console.log("❌ Turnstile Verify: No token provided");
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const res = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', formData);
    
    const data = res.data;

    // ✅ จุดที่ควรเพิ่ม: เช็คว่า Success ไหม ถ้าไม่ ให้ Log Error Codes ออกมาดู
    if (!data.success) {
        console.error("❌ Turnstile Verification Failed:", {
            ip: ip,
            errorCodes: data['error-codes'], // ตรงนี้สำคัญมาก! มันจะบอกสาเหตุ
            messages: data.messages
        });
        
        // ตัวอย่าง error-codes ที่พบบ่อย:
        // 'timeout-or-duplicate' -> นี่แหละคือตัวการที่ทำให้เกิด Loop! (Token ถูกใช้ไปแล้ว)
        // 'invalid-input-response' -> Token มั่ว หรือหมดอายุ
        // 'invalid-input-secret' -> Secret key ใน .env ผิด
    }

    return data.success;

  } catch (err) {
    console.error("🔥 Turnstile Network Error:", err.message);
    if (err.response) console.error("Cloudflare Response:", err.response.data);
    return false;
  }
}

module.exports = verifyTurnstile;