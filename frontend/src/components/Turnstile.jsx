// frontend/src/components/Turnstile.jsx
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

// ✅ แก้ไข URL ให้ชัดเจนว่า Render Explicit
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

const Turnstile = forwardRef(({
  siteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY,
  action,
  theme = "auto",
  size = "normal",
  onVerify,
  onError,
  retry = "auto",
  appearance = "always",
}, ref) => {
  const containerRef = useRef(null);
  const widgetId = useRef(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.turnstile && widgetId.current) {
        window.turnstile.reset(widgetId.current);
      }
    },
    execute: () => {
       if (window.turnstile && widgetId.current) {
         window.turnstile.execute(widgetId.current);
       }
    }
  }));

  useEffect(() => {
    // 1. เช็คว่ามี Script อยู่ใน DOM หรือยัง (ค้นหาจาก src หรือ id)
    let script = document.getElementById(SCRIPT_ID) || document.querySelector(`script[src*="turnstile/v0/api.js"]`);
    
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetId.current) return;

      try {
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          retry,
          action,
          appearance,
          callback: (token) => {
            if (onVerify) onVerify(token);
          },
          "error-callback": (err) => {
            if (onError) onError(err);
          },
        });
      } catch (err) {
        // Ignored warning (already rendered)
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      script.addEventListener('load', renderWidget);
    }

    return () => {
      if (script) script.removeEventListener('load', renderWidget);
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        } catch (e) {}
      }
    };
  }, [siteKey, theme, size, action, retry, appearance]);

  return (
    <div 
        ref={containerRef} 
        style={{ minHeight: size === 'compact' ? 120 : 65 }} 
    />
  );
});

Turnstile.displayName = "Turnstile";
export default Turnstile;