#!/usr/bin/env node

const net = require('node:net');

const CLIENT_SSL = 0x00000800;
const MAX_GREETING_BYTES = 1024 * 1024;

function parseMariaDbGreeting(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 5) {
    throw new Error('MariaDB greeting packet is incomplete');
  }

  const payloadLength = packet.readUIntLE(0, 3);
  if (payloadLength < 1 || payloadLength > MAX_GREETING_BYTES) {
    throw new Error('MariaDB greeting packet length is invalid');
  }
  if (packet.length < payloadLength + 4) {
    throw new Error('MariaDB greeting packet is truncated');
  }

  const payload = packet.subarray(4, payloadLength + 4);
  if (payload[0] === 0xff) throw new Error('MariaDB returned an error greeting');

  let offset = 0;
  const protocolVersion = payload[offset];
  offset += 1;
  const versionTerminator = payload.indexOf(0, offset);
  if (versionTerminator < 0) throw new Error('MariaDB greeting has no server version terminator');

  offset = versionTerminator + 1;
  const minimumLegacyFields = 4 + 8 + 1 + 2;
  if (payload.length < offset + minimumLegacyFields) {
    throw new Error('MariaDB greeting is missing capability flags');
  }

  offset += 4 + 8 + 1;
  const lowerCapabilities = payload.readUInt16LE(offset);
  offset += 2;

  let upperCapabilities = 0;
  if (payload.length >= offset + 5) {
    offset += 1 + 2;
    upperCapabilities = payload.readUInt16LE(offset);
  }

  const capabilities = (lowerCapabilities | (upperCapabilities << 16)) >>> 0;
  return {
    protocolVersion,
    tlsAdvertised: Boolean(capabilities & CLIENT_SSL),
  };
}

function probeMariaDbTls({
  host,
  port = 3306,
  timeoutMs = 5000,
} = {}) {
  const normalizedHost = String(host || '').trim();
  const normalizedPort = Number(port);
  const normalizedTimeout = Number(timeoutMs);
  if (!normalizedHost) return Promise.reject(new Error('MariaDB probe host is required'));
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    return Promise.reject(new Error('MariaDB probe port is invalid'));
  }
  if (!Number.isFinite(normalizedTimeout) || normalizedTimeout < 250 || normalizedTimeout > 60000) {
    return Promise.reject(new Error('MariaDB probe timeout is invalid'));
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: normalizedHost, port: normalizedPort });
    const chunks = [];
    let receivedBytes = 0;
    let expectedBytes = null;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.setTimeout(normalizedTimeout);
    socket.once('timeout', () => {
      const error = new Error('MariaDB greeting probe timed out');
      error.code = 'SQL_PROBE_TIMEOUT';
      finish(error);
    });
    socket.once('error', (cause) => {
      const error = new Error('MariaDB greeting probe failed');
      error.code = cause.code || 'SQL_PROBE_CONNECT_FAILED';
      finish(error);
    });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_GREETING_BYTES + 4) {
        const error = new Error('MariaDB greeting exceeded the maximum size');
        error.code = 'SQL_PROBE_GREETING_TOO_LARGE';
        finish(error);
        return;
      }

      const combined = Buffer.concat(chunks, receivedBytes);
      if (expectedBytes === null && combined.length >= 4) {
        expectedBytes = combined.readUIntLE(0, 3) + 4;
      }
      if (expectedBytes !== null && combined.length >= expectedBytes) {
        try {
          finish(null, {
            host: normalizedHost,
            port: normalizedPort,
            reachable: true,
            ...parseMariaDbGreeting(combined.subarray(0, expectedBytes)),
          });
        } catch (error) {
          error.code = error.code || 'SQL_PROBE_INVALID_GREETING';
          finish(error);
        }
      }
    });
  });
}

function optionValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

async function main() {
  const host = optionValue('host', process.env.SQL_HOST);
  const port = Number(optionValue('port', process.env.SQL_PORT || 3306));
  const timeoutMs = Number(optionValue('timeout-ms', 5000));
  try {
    const result = await probeMariaDbTls({ host, port, timeoutMs });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.tlsAdvertised) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      reachable: false,
      tlsAdvertised: false,
      code: error.code || 'SQL_PROBE_FAILED',
    })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CLIENT_SSL,
  parseMariaDbGreeting,
  probeMariaDbTls,
};
