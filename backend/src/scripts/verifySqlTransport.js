require('dotenv').config();

const {
  closeSQL,
  connectSQL,
  productionPlaintextExceptionEnabled,
} = require('../config/sql');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');

async function verifySqlTransport() {
  if (process.env.SQL_TRANSPORT_VERIFY !== 'true') {
    throw new Error('SQL_TRANSPORT_VERIFY=true is required for the read-only transport check');
  }
  if (process.env.SQL_ENABLED !== 'true') {
    throw new Error('SQL_ENABLED=true is required for the transport check');
  }

  const requiredNames = ['SQL_PASSWORD'];
  if (process.env.SQL_SSL_CA_SECRET_NAME) requiredNames.push('SQL_SSL_CA');
  await hydrateRuntimeSecrets({ requiredNames, managedNames: requiredNames });

  const status = await connectSQL();
  const verifiedTls = status.transport === 'tcp_tls' && status.tlsActive === true;
  const acceptedPlaintextException = productionPlaintextExceptionEnabled()
    && status.transport === 'tcp_plain'
    && status.tlsActive === false;
  if (!status.connected || (!verifiedTls && !acceptedPlaintextException)) {
    const error = new Error('SQL transport verification did not produce an approved connection');
    error.code = 'SQL_TRANSPORT_VERIFY_FAILED';
    throw error;
  }
  return {
    connected: true,
    provider: String(process.env.SQL_PROVIDER || 'unknown'),
    expectedHostMatched: process.env.SQL_HOST === process.env.SQL_EXPECTED_HOST,
    transport: status.transport,
    tlsActive: status.tlsActive,
    plaintextException: acceptedPlaintextException,
  };
}

async function main() {
  try {
    const result = await verifySqlTransport();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeSQL().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL transport verification failed: ${error.code || 'SQL_TRANSPORT_VERIFY_FAILED'}`);
    process.exitCode = 1;
  });
}

module.exports = { verifySqlTransport };
