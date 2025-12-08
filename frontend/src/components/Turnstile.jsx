// src/components/Turnstile.jsx
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const SCRIPT_ID = "cf-turnstile-script";

/**
 * Global Helper to inject Cloudflare script only once.
 */
const injectScript = () => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      // Script already exists, check if loaded
      if (window.turnstile) return resolve(window.turnstile);
      // Wait for it (simple polling or just resolve and let widget handle wait)
      return resolve(window.turnstile); 
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

/**
 * Cloudflare Turnstile Component
 * * Usage:
 * <Turnstile 
 * ref={captchaRef}
 * siteKey="..." 
 * onVerify={(token) => ...} 
 * />
 * * Methods via ref:
 * - ref.current.reset()
 * - ref.current.execute()
 * - ref.current.getResponse()
 */
const Turnstile = forwardRef(({
  siteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY,
  action,           // Optional: Action name for analytics (e.g., "login", "register")
  cData,            // Optional: Customer Data
  theme = "auto",   // "auto" | "light" | "dark"
  size = "normal",  // "normal" | "compact" | "invisible"
  retry = "auto",   // "auto" | "never"
  onVerify,         // Callback(token) -> Success
  onError,          // Callback(err) -> Error
  onExpire,         // Callback() -> Token Expired
  appearance = "always", // "always" | "execute" | "interaction-only"
  style,
  className
}, ref) => {
  const containerRef = useRef(null);
  const widgetId = useRef(null);

  // Expose methods to Parent via Ref
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
    },
    getResponse: () => {
      if (window.turnstile && widgetId.current) {
        return window.turnstile.getResponse(widgetId.current);
      }
      return null;
    }
  }));

  useEffect(() => {
    let mounted = true;

    if (!siteKey) {
      console.warn("Turnstile: Site Key is missing.");
      return;
    }

    const initWidget = async () => {
      try {
        await injectScript();
        
        if (!mounted || !containerRef.current || !window.turnstile) return;

        // Cleanup existing widget if any (safety check)
        if (widgetId.current) {
            try { window.turnstile.remove(widgetId.current); } catch {}
        }

        // Render Widget
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          retry,
          action,
          cData,
          appearance,
          callback: (token) => {
            if (onVerify) onVerify(token);
          },
          "error-callback": (code) => {
            console.error("Turnstile Error Code:", code);
            if (onError) onError(code || "turnstile-error");
          },
          "expired-callback": () => {
            if (onExpire) onExpire();
            // Optional: Auto-reset on expire? 
            // window.turnstile.reset(widgetId.current);
          },
        });

      } catch (err) {
        console.error("Turnstile Load Failed:", err);
        if (onError) onError(err);
      }
    };

    initWidget();

    return () => {
      mounted = false;
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, [siteKey, theme, size, retry, action, cData, appearance, onVerify, onError, onExpire]);

  return (
    <div 
        ref={containerRef} 
        className={className} 
        style={{ minHeight: size === 'compact' ? 120 : 65, ...style }} 
    />
  );
});

Turnstile.displayName = "Turnstile";

export default Turnstile;