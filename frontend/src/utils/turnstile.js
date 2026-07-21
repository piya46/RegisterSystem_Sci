const SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITE_KEY;

let scriptReadyPromise = null;

function waitTurnstileLoaded(timeoutMs) {
  if (window.turnstile) return Promise.resolve();
  if (!scriptReadyPromise) {
    scriptReadyPromise = new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if (window.turnstile) return resolve();
        if (Date.now() - startedAt >= timeoutMs) {
          scriptReadyPromise = null;
          return reject(new Error('Turnstile script load timeout'));
        }
        window.setTimeout(check, 50);
      };
      check();
    });
  }
  return scriptReadyPromise;
}

function safeAction(value) {
  const action = String(value || '').trim();
  return /^[a-z0-9_-]{1,32}$/i.test(action) ? action : 'generic';
}

export async function getTurnstileToken(action = 'generic', timeoutMs = 10000) {
  if (!SITE_KEY) return '';
  await waitTurnstileLoaded(timeoutMs);

  const mount = document.createElement('div');
  Object.assign(mount.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none',
    bottom: '0',
    right: '0',
  });
  document.body.appendChild(mount);

  return new Promise((resolve, reject) => {
    let widgetId = null;
    let completed = false;
    const cleanup = () => {
      if (widgetId !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId); } catch {
          // The widget may already have removed itself after an error.
        }
      }
      mount.remove();
    };
    const finish = (callback, value) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeoutId);
      cleanup();
      callback(value);
    };
    const timeoutId = window.setTimeout(
      () => finish(reject, new Error('Turnstile timeout')),
      timeoutMs
    );

    try {
      widgetId = window.turnstile.render(mount, {
        sitekey: SITE_KEY,
        size: 'invisible',
        execution: 'execute',
        appearance: 'interaction-only',
        action: safeAction(action),
        callback: (token) => finish(resolve, token),
        'error-callback': () => finish(reject, new Error('Turnstile error')),
        'expired-callback': () => finish(reject, new Error('Turnstile token expired')),
      });
      window.turnstile.execute(widgetId);
    } catch (error) {
      finish(reject, error);
    }
  });
}
