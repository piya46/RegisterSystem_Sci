// frontend/src/pages/RegistrationPointSelector.jsx
import React, { useEffect, useMemo, useState } from "react";
import { listRegistrationPoints } from "../utils/api";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Props:
 * - redirectTo: path ปลายทาง เช่น "/kiosk" หรือ "/staff"
 *   ถ้าไม่ส่งมา จะอ่านจาก ?redirectTo=... หรือเดาอัตโนมัติจาก path ว่า staff/kiosk
 * - title: (optional) หัวข้อด้านบน
 */
export default function RegistrationPointSelector({ redirectTo: propRedirectTo, title }) {
  const [points, setPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");

  // แหล่งปลายทาง: prop > query > เดาจาก URL > default /kiosk
  const params = new URLSearchParams(location.search);
  const redirectTo =
    propRedirectTo ||
    params.get("redirectTo") ||
    (window.location.pathname.includes("staff") ? "/staff" : "/kiosk");

  // โหลด lastPoint
  useEffect(() => {
    const last = localStorage.getItem("lastPoint");
    if (last) setSelectedPoint(last);
  }, []);

  // โหลดรายการจุดลงทะเบียน
  const fetchPoints = () => {
    setLoading(true);
    setError("");
    listRegistrationPoints(token)
      .then((res) => setPoints(res.data || res || []))
      .catch(() => setError("โหลดจุดลงทะเบียนไม่สำเร็จ"))
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
    navigate(`${redirectTo}?point=${selectedPoint}`);
  };

  const selectedPointName = useMemo(() => {
    const p = points.find((x) => (x._id || x.id) === selectedPoint);
    return p?.name || "";
  }, [points, selectedPoint]);

  const lastPoint = localStorage.getItem("lastPoint");
  const isUsingLast = lastPoint && lastPoint === selectedPoint;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #ffe082 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 20,
          padding: 28,
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow:
            "0 10px 30px rgba(255,193,7,0.25), inset 0 1px 0 rgba(255,255,255,0.5)",
          border: "1px solid rgba(255,193,7,0.25)",
          transition: "transform .25s ease, box-shadow .25s ease",
          transform: hover ? "translateY(-2px)" : "none",
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* โลโก้ */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <img
            src="/logo.svg"
            alt="Logo"
            style={{
              width: 68,
              height: 68,
              objectFit: "contain",
              filter: "drop-shadow(0 4px 10px rgba(255,193,7,0.35))",
            }}
          />
        </div>

        {/* หัวเรื่อง */}
        <h2
          style={{
            margin: "4px 0 20px",
            fontWeight: 800,
            fontSize: 28,
            textAlign: "center",
            color: "#7c5600",
            letterSpacing: 0.6,
            textShadow: "0 1px 0 #fff8",
          }}
        >
          {title || "เลือกจุดลงทะเบียน"}
        </h2>

        {/* คำอธิบายย่อย */}
        <p
          style={{
            margin: "0 0 18px",
            textAlign: "center",
            color: "#6d4c00",
            opacity: 0.9,
            fontWeight: 500,
          }}
        >
          เลือกจุดที่จะใช้งาน จากนั้นกด <b>ไปต่อ</b> ระบบจะพาไปยังหน้า {redirectTo}
        </p>

        {/* สถานะโหลด/ผิดพลาด */}
        {loading && (
          <div
            role="status"
            aria-live="polite"
            style={{
              textAlign: "center",
              margin: "22px 0",
              color: "#8d6e63",
              fontWeight: 600,
            }}
          >
            กำลังโหลดจุดลงทะเบียน…
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", margin: "22px 0" }}>
            <div style={{ color: "#d32f2f", fontWeight: 700, marginBottom: 10 }}>
              {error}
            </div>
            <button
              onClick={fetchPoints}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                background: "linear-gradient(90deg,#ffa000,#ffca28)",
                color: "#4a2c00",
                border: "none",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(255,193,7,.35)",
              }}
            >
              ลองใหม่
            </button>
          </div>
        )}

        {!loading && !error && (
          <form onSubmit={handleSubmit} aria-label="เลือกจุดลงทะเบียน">
            {/* Dropdown */}
            <label
              htmlFor="pointSelect"
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 700,
                color: "#6d4c00",
              }}
            >
              จุดลงทะเบียน
            </label>
            <div
              style={{
                position: "relative",
                borderRadius: 14,
                border: "2px solid #ffe082",
                background: selectedPoint ? "#fffbe6" : "#fffdf1",
                transition: "border-color .2s, box-shadow .2s",
              }}
            >
              <select
                id="pointSelect"
                value={selectedPoint}
                onChange={(e) => setSelectedPoint(e.target.value)}
                required
                aria-required="true"
                aria-label="เลือกจุดลงทะเบียน"
                style={{
                  width: "100%",
                  padding: "14px 46px 14px 14px",
                  fontSize: 18,
                  border: "none",
                  outline: "none",
                  color: selectedPoint ? "#3e2723" : "#a1887f",
                  fontWeight: 700,
                  background: "transparent",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  cursor: "pointer",
                }}
              >
                <option value="" disabled>
                  — เลือกจุดลงทะเบียน —
                </option>
                {points.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* caret */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "6px solid transparent",
                  borderRight: "6px solid transparent",
                  borderTop: "8px solid #c49000",
                  opacity: 0.9,
                }}
              />
            </div>

            {/* Preview กล่องสรุปจุดที่เลือก */}
            {selectedPoint && (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background:
                    "linear-gradient(90deg, rgba(255,224,130,0.25), rgba(255,243,224,0.6))",
                  border: "1px dashed rgba(255, 193, 7, 0.6)",
                  color: "#5d4037",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "#ffd54f",
                    boxShadow: "0 2px 8px rgba(255,193,7,.35)",
                    fontWeight: 800,
                    color: "#4e342e",
                  }}
                >
                  ✓
                </span>
                <div style={{ fontWeight: 700 }}>
                  เลือก: <span style={{ color: "#4e342e" }}>{selectedPointName}</span>
                  {isUsingLast && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: "#fff3e0",
                        border: "1px solid #ffe0b2",
                        color: "#8d6e63",
                        fontWeight: 800,
                      }}
                    >
                      ใช้จุดล่าสุด
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ปุ่มไปต่อ */}
            <button
              type="submit"
              disabled={!selectedPoint}
              aria-label="ไปต่อ"
              style={{
                marginTop: 22,
                width: "100%",
                padding: "14px 0",
                fontSize: 20,
                fontWeight: 900,
                borderRadius: 14,
                border: "none",
                background: selectedPoint
                  ? "linear-gradient(90deg,#ffca28,#ffc107)"
                  : "#ffe082",
                color: selectedPoint ? "#4a2c00" : "#8d6e63",
                cursor: selectedPoint ? "pointer" : "not-allowed",
                boxShadow: selectedPoint
                  ? "0 8px 20px rgba(255,193,7,.35)"
                  : "none",
                transition: "transform .15s ease, box-shadow .2s ease, background .2s ease",
                transform: selectedPoint ? "translateY(0)" : "none",
              }}
              onMouseDown={(e) => {
                if (selectedPoint) e.currentTarget.style.transform = "translateY(1px)";
              }}
              onMouseUp={(e) => {
                if (selectedPoint) e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              ไปต่อ
            </button>

            {/* ลิงก์เล็ก: เปลี่ยนปลายทาง */}
            <div
              style={{
                marginTop: 12,
                textAlign: "center",
                color: "#7c5b00",
                fontSize: 13,
              }}
            >
              ปลายทาง: <b style={{ color: "#5d4037" }}>{redirectTo}</b>{" "}
              <span style={{ opacity: 0.7 }}>(เปลี่ยนได้จากพารามิเตอร์ <code>redirectTo</code>)</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
