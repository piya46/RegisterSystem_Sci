const http = require('node:http');
const { loadConfig } = require('./src/config');
const { assertFrontendBuild, createGatewayApp } = require('./src/gateway');

let app;
let server;

try {
  const config = loadConfig();
  assertFrontendBuild(config);
  app = createGatewayApp(config);
  server = http.createServer(app);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[gateway] listening on managed Passenger socket; release=${config.releaseId}`);
  });
} catch (error) {
  console.error(`[gateway] startup failed: ${error.message}`);
  throw error;
}

function shutdown(signal) {
  console.log(`[gateway] received ${signal}; stopping`);
  if (!server) process.exit(0);
  server.close((error) => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
