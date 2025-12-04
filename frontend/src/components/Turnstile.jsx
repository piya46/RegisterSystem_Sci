import React, { useEffect, useRef } from "react";

const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Turnstile widget (Managed/Invisible)
 * - invisible=true : เรียก executeTurnstile() เพื่อขอ token แล้ว onVerify ถูกเรียก
 * - managed (default) : widget จะขอ token อัตโนมัติเมื่อพร้อม
 */
export default function Turnstile({
  siteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY,
  options = {},      // { theme, size, action, cData, retry, appearance }
  onVerify,          // (token) => void
  onError,           // (err) => void
  invisible = false, // true = โหมด invisible
}) {
  const elRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const ensureScript = () =>
      new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const s = document.createElement("script");
        s.src = scriptUrl;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    ensureScript()
      .then(() => {
        if (!mounted || !elRef.current) return;
        widgetIdRef.current = window.turnstile.render(elRef.current, {
          sitekey: siteKey,
          callback: (token) => onVerify && onVerify(token),
          "error-callback": () => onError && onError("turnstile-error"),
          "expired-callback": () => {
            try { window.turnstile.reset(widgetIdRef.current); } catch {}
          },
          theme: "auto",
          ...options,
          ...(invisible ? { size: "invisible" } : {}),
        });
      })
      .catch((e) => onError && onError(e));

    return () => {
      mounted = false;
      try {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {}
    };
    // eslint-disable-next-line
  }, [siteKey]);

  return <div ref={elRef} />;
}

/** helper สำหรับ invisible: เรียก execute() ของทุก widget ที่เป็น invisible */
export function executeTurnstile() {
  try {
    if (window.turnstile) window.turnstile.execute();
  } catch {}
}
