// import React, { useEffect, useRef } from "react";
// import { Html5Qrcode } from "html5-qrcode";

// function makeId() {
//   return "qr-reader-" + Math.random().toString(36).slice(2, 10);
// }

// export default function QrScanner({ onScan, onError, style, constraints = {} }) {
//   const qrId = useRef(makeId());
//   const qrInstance = useRef(null);

//   useEffect(() => {
//     let isUnmounted = false;
//     qrInstance.current = new Html5Qrcode(qrId.current);

//     Html5Qrcode.getCameras().then(devices => {
//       if (devices && devices.length && !isUnmounted) {
//         qrInstance.current.start(
//           { facingMode: "environment" },
//           { fps: 12, qrbox: 220, aspectRatio: 1.33, ...constraints },
//           (qrText) => {
//             if (!isUnmounted && qrText) onScan(qrText);
//           },
//           (err) => {
//             if (onError && !isUnmounted) onError(err);
//           }
//         );
//       }
//     }).catch(err => {
//       if (onError && !isUnmounted) onError(err.message || err);
//     });

//     return () => {
//       isUnmounted = true;
//       if (qrInstance.current) {
//         try {
//           qrInstance.current.stop()
//             .catch(() => {})
//             .finally(() => {
//               try { qrInstance.current.clear(); } catch {}
//             });
//         } catch {}
//       }
//     };
//     // eslint-disable-next-line
//   }, []);

//   return (
//     <div
//       id={qrId.current}
//       style={style || { width: 260, margin: "auto", borderRadius: 12, overflow: "hidden" }}
//     />
//   );
// }


// src/components/QrScanner.jsx
import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

/** random id for container */
function makeId() {
  return "qr-reader-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Props:
 * - onScan(text)                : callback เมื่อสแกนได้
 * - onError(err)                : callback เมื่อเกิดข้อผิดพลาด
 * - style                       : inline style ของ container
 * - constraints                 : override option { fps, qrbox, aspectRatio, ... }
 * - scanDelayMs = 700           : กันสแกนซ้ำภายในช่วงเวลา (debounce)
 * - once = false                : สแกนครั้งเดียวแล้วหยุด
 * - showControls = true         : แสดงปุ่มสลับกล้อง/ไฟฉาย/หยุด/เล่น
 * - preferredFacingMode = "environment" | "user"
 * - cameraId                    : เลือกกล้องด้วย deviceId (ถ้ากำหนดจะ override facingMode)
 * - vibrate = true              : สั่นเมื่อสแกนได้ (อุปกรณ์รองรับ)
 * - beep = true                 : เล่น beep เบา ๆ เมื่อสแกนได้
 * - onCameraList(list)          : คืนรายการกล้อง [{id,label}]
 */
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

  // tiny beep
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

  // calc responsive qrbox if not provided
  const buildConfig = () => {
    const base = { fps: 12, aspectRatio: 1.33, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };
    let cfg = { ...base, ...constraints };
    if (!cfg.qrbox) {
      const w = Math.min(380, Math.floor(window.innerWidth * 0.8));
      const size = Math.max(180, Math.min(280, w - 40));
      cfg.qrbox = size;
    }
    return cfg;
  };

  const stopScanner = async () => {
    try {
      if (qr.current?.isScanning) {
        await qr.current.stop();
      }
      await qr.current?.clear();
    } catch {}
  };

  const startScanner = async (devId = activeCamId) => {
    try {
      if (!qr.current) qr.current = new Html5Qrcode(containerId.current);

      // pick camera config (deviceId or facingMode)
      const cameraConfig = devId ? { deviceId: { exact: devId } } : { facingMode: preferredFacingMode };
      const cfg = buildConfig();

      await qr.current.start(
        cameraConfig,
        cfg,
        (text) => {
          const now = Date.now();
          if (now - lastScanAt.current < scanDelayMs) return; // debounce
          lastScanAt.current = now;

          // feedback
          if (vibrate && navigator.vibrate) navigator.vibrate(35);
          beepOnce();

          onScan && onScan(text);
          if (once) {
            stopScanner();
          }
        },
        (err) => {
          // stream errors (decode/lighting) — ไม่ต้องส่งถี่เกินไป
          // เงียบไว้ เว้นแต่ onError ต้องการรายงานทั้งหมด
        }
      );

      // capabilities (torch)
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

  // enumerate cameras
  useEffect(() => {
    let mounted = true;

    Html5Qrcode.getCameras()
      .then((list) => {
        if (!mounted) return;
        const mapped = (list || []).map((d) => ({ id: d.id, label: d.label || "Camera" }));
        setDevices(mapped);
        onCameraList && onCameraList(mapped);

        // initial camera: if prop cameraId provided use it, else pick back camera if any
        if (!activeCamId) {
          if (cameraId) {
            setActiveCamId(cameraId);
          } else {
            // try to pick environment/back camera by label
            const back = mapped.find((d) => /back|rear|environment/i.test(d.label));
            setActiveCamId(back?.id || null);
          }
        }
      })
      .catch((err) => {
        onError && onError(err?.message || err);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // start/stop on mount/unmount + react to activeCamId changes
  useEffect(() => {
    let unmounted = false;
    (async () => {
      await stopScanner(); // ensure clean
      if (!unmounted) await startScanner(activeCamId);
    })();

    return () => {
      unmounted = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCamId]);

  // pause/resume
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

  // torch toggle
  const toggleTorch = async () => {
    if (!capabilities.torch || !qr.current) return;
    try {
      const track =
        qr.current.getState()?.videoTrack ||
        qr.current._qrRegion?.videoElement?.srcObject?.getVideoTracks?.()[0];
      if (!track) return;
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (e) {
      onError && onError("Torch not supported on this device/browser.");
    }
  };

  // handle tab visibility (iOS safari ชอบหยุด stream)
  useEffect(() => {
    const vis = async () => {
      try {
        if (document.visibilityState === "visible" && !paused) {
          // restart softly
          await stopScanner();
          await startScanner(activeCamId);
        } else {
          await stopScanner();
        }
      } catch {}
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, activeCamId]);

  // fallback style
  const containerStyle = style || {
    width: 280,
    margin: "12px auto",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 8px 28px rgba(136,74,252,.15)",
  };

  return (
    <div style={{ position: "relative" }}>
      {/* video container */}
      <div id={containerId.current} style={containerStyle} />

      {/* overlay frame */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: 180,
            height: 180,
            maxWidth: "70vw",
            maxHeight: "70vw",
            borderRadius: 12,
            border: "3px solid rgba(136,74,252,.9)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,.15)",
            backdropFilter: "blur(1px)",
          }}
        />
      </div>

      {/* controls */}
      {showControls && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* camera picker (if multiple) */}
          <select
            value={activeCamId || ""}
            onChange={(e) => setActiveCamId(e.target.value || null)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e6ddff",
              background: "rgba(255,255,255,.9)",
              fontWeight: 600,
              backdropFilter: "blur(2px)",
            }}
          >
            {!activeCamId && <option value="">เลือกกล้อง (auto)</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label || d.id}
              </option>
            ))}
          </select>

          {/* pause/resume */}
          <button
            onClick={handlePauseResume}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e6ddff",
              background: paused ? "#6d38b6" : "rgba(255,255,255,.9)",
              color: paused ? "#fff" : "#4b2a8f",
              fontWeight: 800,
              cursor: "pointer",
            }}
            aria-label={paused ? "Resume" : "Pause"}
            title={paused ? "เล่นต่อ" : "หยุดชั่วคราว"}
          >
            {paused ? "Resume" : "Pause"}
          </button>

          {/* torch */}
          <button
            onClick={toggleTorch}
            disabled={!capabilities.torch}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #e6ddff",
              background: capabilities.torch
                ? torchOn
                  ? "#ffb300"
                  : "rgba(255,255,255,.9)"
                : "rgba(255,255,255,.6)",
              color: torchOn ? "#3a2500" : "#4b2a8f",
              fontWeight: 800,
              cursor: capabilities.torch ? "pointer" : "not-allowed",
            }}
            aria-label="Toggle torch"
            title={capabilities.torch ? "ไฟฉาย" : "ไม่รองรับไฟฉาย"}
          >
            Torch
          </button>
        </div>
      )}
    </div>
  );
}
