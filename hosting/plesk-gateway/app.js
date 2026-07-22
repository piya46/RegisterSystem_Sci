const http = require('node:http');
const { loadConfig } = require('./src/config');
const { assertFrontendBuild, createGatewayApp } = require('./src/gateway');

const config = loadConfig();
assertFrontendBuild(config);
const app = createGatewayApp(config);
const server = http.createServer(app);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[gateway] listening on port ${config.port}; release=${config.releaseId}`);
});

function shutdown(signal) {
  console.log(`[gateway] received ${signal}; stopping`);
  server.close((error) => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
