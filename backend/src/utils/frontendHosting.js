const fs = require('fs');
const path = require('path');
const express = require('express');

const FRONTEND_ROUTE = /^\/(?!api(?:\/|$)|health(?:\/|$)|uploads(?:\/|$)).*/;

function frontendHostingEnabled() {
  return String(process.env.SERVE_FRONTEND || '').toLowerCase() === 'true';
}

function frontendDistPath() {
  return path.resolve(
    process.env.FRONTEND_DIST_DIR || path.join(__dirname, '../../../frontend/dist')
  );
}

function isFrontendRoute(requestPath) {
  return FRONTEND_ROUTE.test(String(requestPath || ''));
}

function configureFrontendHosting(app) {
  if (!frontendHostingEnabled()) return { enabled: false, distPath: null };

  const distPath = frontendDistPath();
  const indexPath = path.join(distPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`SERVE_FRONTEND=true but frontend build is missing at ${indexPath}`);
  }

  app.use(express.static(distPath, {
    dotfiles: 'deny',
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));

  app.get(FRONTEND_ROUTE, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexPath);
  });

  return { enabled: true, distPath };
}

module.exports = {
  configureFrontendHosting,
  frontendDistPath,
  frontendHostingEnabled,
  isFrontendRoute,
};
