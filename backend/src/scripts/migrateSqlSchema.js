require('dotenv').config();

const { closeSQL, connectSQL, withSqlTransaction } = require('../config/sql');
const { clearSecretCache } = require('../utils/secretProvider');
const {
  applySqlMigrationCredentials,
  hydrateSqlMigrationSecrets,
} = require('../sql/migrationRuntime');
const {
  migrationChecksum,
  migrations,
  validateMigrationPlan,
} = require('../sql/migrations');

const MIGRATION_TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id VARCHAR(190) NOT NULL,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(500) NOT NULL,
  statement_count INT UNSIGNED NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (migration_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function planSummary() {
  validateMigrationPlan();
  return migrations.map((migration) => ({
    id: migration.id,
    description: migration.description,
    statementCount: migration.statements.length,
    checksum: migrationChecksum(migration),
  }));
}

async function applyMigrations() {
  if (process.env.SQL_MIGRATION_WRITE !== 'true') {
    throw new Error('Applying SQL migrations requires SQL_MIGRATION_WRITE=true');
  }
  await hydrateSqlMigrationSecrets();
  applySqlMigrationCredentials();
  await connectSQL();

  const lockName = `psevent:migrate:${process.env.SQL_DATABASE || 'default'}`.slice(0, 64);
  const lockTimeout = integerEnv('SQL_MIGRATION_LOCK_TIMEOUT_SECONDS', 15, 1, 60);

  return withSqlTransaction(async (transaction) => {
    const lock = await transaction.executeRead('SELECT GET_LOCK(?, ?) AS acquired', [lockName, lockTimeout]);
    if (Number(lock.rows[0]?.acquired) !== 1) throw new Error('Could not acquire SQL migration advisory lock');

    try {
      await transaction.executeWrite(MIGRATION_TABLE_SQL);
      const appliedResult = await transaction.executeRead('SELECT migration_id, checksum FROM schema_migrations');
      const applied = new Map(appliedResult.rows.map((row) => [row.migration_id, row.checksum]));
      const results = [];

      for (const migration of migrations) {
        const checksum = migrationChecksum(migration);
        if (applied.has(migration.id)) {
          if (applied.get(migration.id) !== checksum) {
            throw new Error(`Checksum mismatch for applied SQL migration ${migration.id}`);
          }
          results.push({ id: migration.id, status: 'already_applied', checksum });
          continue;
        }

        for (const statement of migration.statements) {
          await transaction.executeWrite(statement);
        }
        await transaction.executeWrite(
          `INSERT INTO schema_migrations
            (migration_id, checksum, description, statement_count)
           VALUES (?, ?, ?, ?)`,
          [migration.id, checksum, migration.description, migration.statements.length]
        );
        results.push({ id: migration.id, status: 'applied', checksum });
      }
      return results;
    } finally {
      await transaction.executeRead('SELECT RELEASE_LOCK(?) AS released', [lockName]).catch(() => {});
    }
  });
}

async function main() {
  const shouldApply = process.argv.includes('--apply');
  const summary = planSummary();
  if (!shouldApply) {
    console.log(JSON.stringify({ dryRun: true, migrations: summary }, null, 2));
    return;
  }

  try {
    const results = await applyMigrations();
    console.log(JSON.stringify({ dryRun: false, results }, null, 2));
  } finally {
    await closeSQL().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL schema migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyMigrations,
  planSummary,
};
