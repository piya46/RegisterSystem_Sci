// src/components/QrScanner.jsx
import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

/** สร้าง ID สุ่มสำหรับ container เพื่อป้องกันการชนกัน */
function makeId() {
  return "qr-reader-" + Math.random().toString(36).slice(2, 10);
}

export default function QrScanner({
  onScan,
  onError,
  style,
  constraints = {},
  scanDelayMs = 700,
  once = false,
  showControls = true,
  preferredFacingMode = "environment",
  cameraId,
  vibrate = true,
  beep = true,
  onCameraList,
}) {
  const containerId = useRef(makeId());
  const qr = useRef(null);
  const lastScanAt = useRef(0);
  
  const [devices, setDevices] = useState([]);
  const [activeCamId, setActiveCamId] = useState(cameraId || null);
  const [paused, setPaused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capabilities, setCapabilities] = useState({ torch: false });
  
  // 🌟 State สำหรับขนาดของกรอบสแกนอัตโนมัติ
  const [boxSize, setBoxSize] = useState(250);

  // คำนวณขนาดกรอบอัตโนมัติตามขนาดหน้าจอ
  useEffect(() => {
    const calculateSize = () => {
      // อิงความกว้างจาก Container หรือ หน้าจอ
      const wrapper = document.getElementById(`qr-wrapper-${containerId.current}`);
      const w = wrapper ? wrapper.clientWidth : window.innerWidth;
      const h = window.innerHeight;
      const minDim = Math.min(w, h);
      
      // ให้กรอบมีขนาด 70% ของด้านที่แคบที่สุด (จำกัดขั้นต่ำ 200px และสูงสุด 350px)
      const size = Math.max(200, Math.min(350, Math.floor(minDim * 0.7)));
      setBoxSize(size);
    };

    calculateSize(); // คำนวณครั้งแรก
    window.addEventListener("resize", calculateSize); // คำนวณใหม่เมื่อหมุนจอหรือปรับขนาด
    return () => window.removeEventListener("resize", calculateSize);
  }, []);

  // เสียง Beep เมื่อสแกนติด
  const beepOnce = () => {
    if (!beep) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.04, ctx.currentTime);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.08);
    } catch {}
  };

  const buildConfig = () => {
    // 💡 เราไม่ส่งค่า qrbox เข้าไปใน config เพื่อให้กล้องแสกนทั้งภาพ 
    // แล้วเราใช้ CSS วาดกรอบหลอกให้ผู้ใช้เอา QR มาวางตรงกลางแทน (ช่วยให้สแกนติดง่ายขึ้น)
    const base = { fps: 12, aspectRatio: 1.33, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };
    return { ...base, ...constraints };
  };

  const stopScanner = async () => {
    try {
      if (qr.current?.isScanning) await qr.current.stop();
      await qr.current?.clear();
    } catch {}
  };

  const startScanner = async (devId = activeCamId) => {
    try {
      if (!qr.current) qr.current = new Html5Qrcode(containerId.current);

      const cameraConfig = devId ? { deviceId: { exact: devId } } : { facingMode: preferredFacingMode };
      const cfg = buildConfig();

      await qr.current.start(
        cameraConfig,
        cfg,
        (text) => {
          const now = Date.now();
          if (now - lastScanAt.current < scanDelayMs) return; 
          lastScanAt.current = now;

          if (vibrate && navigator.vibrate) navigator.vibrate(35);
          beepOnce();

          onScan && onScan(text);
          if (once) stopScanner();
        },
        () => { /* ไม่ต้อง log error ระหว่างมองหา QR */ }
      );

      // เช็คว่ากล้องนี้เปิดไฟฉายได้ไหม
      try {
        const track = qr.current.getState()?.videoTrack || qr.current._qrRegion?.videoElement?.srcObject?.getVideoTracks?.()[0];
        const caps = track?.getCapabilities?.() || {};
        setCapabilities({ torch: !!caps.torch });
      } catch {
        setCapabilities({ torch: false });
      }
    } catch (e) {
      onError && onError(e?.message || e);
    }
  };

  useEffect(() => {
    let mounted = true;
    Html5Qrcode.getCameras()
      .then((list) => {
        if (!mounted) return;
        const mapped = (list || []).map((d) => ({ id: d.id, label: d.label || "Camera" }));
        setDevices(mapped);
        onCameraList && onCameraList(mapped);

        if (!activeCamId) {
          if (cameraId) setActiveCamId(cameraId);
          else {
            const back = mapped.find((d) => /back|rear|environment/i.test(d.label));
            setActiveCamId(back?.id || null);
          }
        }
      })
      .catch((err) => onError && onError(err?.message || err));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let unmounted = false;
    (async () => {
      await stopScanner();
      if (!unmounted) await startScanner(activeCamId);
    })();
    return () => {
      unmounted = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCamId]);

  const handlePauseResume = async () => {
    if (!qr.current) return;
    try {
      if (paused) {
        await startScanner(activeCamId);
        setPaused(false);
      } else {
        await stopScanner();
        setPaused(true);
      }
    } catch {}
  };

  const toggleTorch = async () => {
    if (!capabilities.torch || !qr.current) return;
    try {
      const track = qr.current.getState()?.videoTrack || qr.current._qrRegion?.videoElement?.srcObject?.getVideoTracks?.()[0];
      if (!track) return;
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (e) {
      onError && onError("Torch not supported on this device/browser.");
    }
  };

  useEffect(() => {
    const vis = async () => {
      try {
        if (document.visibilityState === "visible" && !paused) {
          await stopScanner();
          await startScanner(activeCamId);
        } else await stopScanner();
      } catch {}
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, activeCamId]);

  const wrapperStyle = style || {
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 12px 32px rgba(136,74,252,.15)",
    background: "#000",
  };

  return (
    <div id={`qr-wrapper-${containerId.current}`} style={{ position: "relative", ...wrapperStyle }}>
      {/* ซ่อนลิงก์ขยะและจัดระเบียบวิดีโอ */}
      <style>{`
        #${containerId.current} a { display: none !important; }
        #${containerId.current} video { object-fit: cover; width: 100% !important; border-radius: 16px; display: block; }
        @keyframes scan-line {
          0% { transform: translateY(-${boxSize / 2 - 10}px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(${boxSize / 2 - 10}px); opacity: 0; }
        }
      `}</style>

      {/* Video Container */}
      <div id={containerId.current} style={{ width: "100%" }} />

      {/* 🌟 Overlay Frame อัตโนมัติ (ปรับตามขนาดหน้าจอ) */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: boxSize,
            height: boxSize,
            borderRadius: 24,
            border: "3px solid rgba(136,74,252, 0.9)",
            // ใช้ Box Shadow บังพื้นที่ด้านนอกกรอบแทน (ทำให้ตรงกลางใส และรอบนอกมืด)
            boxShadow: "0 0 0 9999px rgba(0,0,0, 0.45), 0 0 20px rgba(136,74,252, 0.5)",
            transition: "all 0.3s ease-out", // เอฟเฟกต์สมูทเวลาขนาดเปลี่ยน
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* เส้นวิ่งแสกนเนอร์ (Scanning Line) */}
          {!paused && (
            <div
              style={{
                width: "90%",
                height: 3,
                background: "linear-gradient(90deg, transparent, rgba(136,74,252,1), transparent)",
                boxShadow: "0 0 10px rgba(136,74,252,0.8)",
                animation: "scan-line 2.5s infinite linear",
              }}
            />
          )}
        </div>
      </div>

      {/* Controls Area */}
      {showControls && (
        <div
          style={{
            position: "absolute",
            bottom: 12, left: 12, right: 12,
            display: "flex", gap: 8,
            justifyContent: "space-between", alignItems: "center",
            zIndex: 20
          }}
        >
          <select
            value={activeCamId || ""}
            onChange={(e) => setActiveCamId(e.target.value || null)}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.85)", fontWeight: 700, backdropFilter: "blur(4px)", outline: "none"
            }}
          >
            {!activeCamId && <option value="">เลือกกล้องอัตโนมัติ</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label || `Camera ${d.id.slice(0, 5)}`}</option>
            ))}
          </select>

          <button
            onClick={handlePauseResume}
            style={{
              padding: "10px 16px", borderRadius: 12, border: "none",
              background: paused ? "#884afc" : "rgba(255,255,255,0.85)",
              color: paused ? "#fff" : "#4b2a8f", fontWeight: 800, cursor: "pointer", backdropFilter: "blur(4px)"
            }}
          >
            {paused ? "RESUME" : "PAUSE"}
          </button>

          <button
            onClick={toggleTorch}
            disabled={!capabilities.torch}
            style={{
              padding: "10px 16px", borderRadius: 12, border: "none",
              background: capabilities.torch ? (torchOn ? "#ffb300" : "rgba(255,255,255,0.85)") : "rgba(255,255,255,0.4)",
              color: torchOn ? "#3a2500" : "#4b2a8f", fontWeight: 800, cursor: capabilities.torch ? "pointer" : "not-allowed",
              backdropFilter: "blur(4px)"
            }}
          >
            🔦
          </button>
        </div>
      )}
    </div>
  );
}