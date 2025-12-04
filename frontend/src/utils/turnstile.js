// src/utils/turnstile.js
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let scriptReadyPromise = null;
let widgetId = null;
let containerEl = null;

function waitTurnstileLoaded() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptReadyPromise) {
    scriptReadyPromise = new Promise((resolve) => {
      const check = () => {
        if (window.turnstile) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }
  return scriptReadyPromise;
}

function ensureContainer() {
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.id = 'turnstile-invisible-container';
    Object.assign(containerEl.style, {
      position: 'fixed',
      width: '0px',
      height: '0px',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      bottom: '0',
      right: '0',
      zIndex: '-1',
    });
    document.body.appendChild(containerEl);
  }
  return containerEl;
}

/**
 * getTurnstileToken(action?: string, timeoutMs?: number)
 * - เรนเดอร์ invisible widget หนึ่งตัว (reuse ได้) แล้ว execute เพื่อรับโทเค็น
 * - คืน Promise<string> เป็น cfToken
 */
export async function getTurnstileToken(action = 'generic', timeoutMs = 10000) {
  if (!SITE_KEY) {
    // ถ้าไม่ได้ตั้งค่าไว้ ให้ผ่าน (หลังบ้านจะเป็นด่านสุดท้าย)
    return '';
  }
  await waitTurnstileLoaded();
  const mount = ensureContainer();

  if (widgetId == null) {
    widgetId = window.turnstile.render(mount, {
      sitekey: SITE_KEY,
      size: 'invisible',
      retry: 'auto',
      'error-callback': () => {},
    });
  }

  // Execute และรอโทเค็น
  return new Promise((resolve, reject) => {
    let done = false;
    const tid = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('Turnstile timeout'));
      }
    }, timeoutMs);

    try {
      window.turnstile.execute(widgetId, {
        action,
        callback: (token) => {
          if (!done) {
            done = true;
            clearTimeout(tid);
            resolve(token);
          }
        },
        'error-callback': () => {
          if (!done) {
            done = true;
            clearTimeout(tid);
            reject(new Error('Turnstile error'));
          }
        },
      });
    } catch (e) {
      clearTimeout(tid);
      reject(e);
    }
  });
}
