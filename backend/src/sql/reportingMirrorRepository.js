const { executeSql } = require('../config/sql');
const { xorChecksum } = require('./checksum');

const ID_TABLES = new Set([
  'organizations',
  'event_series',
  'events',
  'participants_core',
  'wallets',
  'vendors',
  'wallet_transactions',
  'receipts',
  'donation_summaries',
  'packages',
]);

const COUNT_TABLES = new Set(ID_TABLES);

function identifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

function executorFor(transaction) {
  if (transaction) {
    return {
      read: (sql, params) => transaction.executeRead(sql, params),
      write: (sql, params) => transaction.executeWrite(sql, params),
    };
  }
  return {
    read: (sql, params) => executeSql(sql, params, { operation: 'read' }),
    write: (sql, params) => executeSql(sql, params, { operation: 'write' }),
  };
}

function mirrorRepositoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createReportingMirrorRepository({ transaction = null, idCache = new Map() } = {}) {
  const executor = executorFor(transaction);

  async function upsertRow(table, row, { touchMirroredAt = true } = {}) {
    const columns = Object.keys(row);
    if (columns.length === 0) throw new Error(`Cannot upsert an empty ${table} row`);
    const quotedColumns = columns.map(identifier);
    const updates = columns
      .filter((column) => column !== 'mongo_id')
      .map((column) => `${identifier(column)}=VALUES(${identifier(column)})`);
    if (touchMirroredAt) updates.push('`mirrored_at`=CURRENT_TIMESTAMP(3)');

    const sql = `INSERT INTO ${identifier(table)} (${quotedColumns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), ${updates.join(', ')}`;
    const result = await executor.write(sql, columns.map((column) => row[column]));
    return result.rows.insertId;
  }

  async function findId(table, mongoId, { required = true } = {}) {
    if (!mongoId) {
      if (required) {
        throw mirrorRepositoryError('SQL_MIRROR_PARENT_MISSING', `SQL mirror parent id is missing for ${table}`);
      }
      return null;
    }
    if (!ID_TABLES.has(table)) throw new Error(`SQL id lookup is not allowed for table ${table}`);
    const cacheKey = `${table}:${mongoId}`;
    if (idCache.has(cacheKey)) return idCache.get(cacheKey);

    const result = await executor.read(`SELECT id FROM ${identifier(table)} WHERE mongo_id = ? LIMIT 1`, [mongoId]);
    const id = result.rows[0]?.id || null;
    if (!id && required) {
      throw mirrorRepositoryError('SQL_MIRROR_PARENT_MISSING', `SQL mirror parent is missing: ${table}:${mongoId}`);
    }
    if (id) idCache.set(cacheKey, id);
    return id;
  }

  async function upsertParent(table, row) {
    await upsertRow(table, row);
    const id = await findId(table, row.mongo_id, { required: false });
    if (!id) {
      throw mirrorRepositoryError(
        'SQL_MIRROR_UNIQUE_CONFLICT',
        `SQL unique-key conflict does not belong to source record ${table}:${row.mongo_id}`
      );
    }
    return id;
  }

  async function optionalParent(table, mongoId) {
    return mongoId ? findId(table, mongoId, { required: true }) : null;
  }

  async function upsertOrganization(data) {
    return upsertParent('organizations', data.row);
  }

  async function upsertEventSeries(data) {
    return upsertParent('event_series', {
      ...data.row,
      organization_id: await findId('organizations', data.refs.organizationMongoId),
    });
  }

  async function upsertEvent(data) {
    return upsertParent('events', {
      ...data.row,
      organization_id: await findId('organizations', data.refs.organizationMongoId),
      series_id: await findId('event_series', data.refs.seriesMongoId),
    });
  }

  async function upsertParticipant(data) {
    return upsertParent('participants_core', {
      ...data.row,
      organization_id: await optionalParent('organizations', data.refs.organizationMongoId),
      series_id: await optionalParent('event_series', data.refs.seriesMongoId),
      event_id: await optionalParent('events', data.refs.eventMongoId),
    });
  }

  async function upsertWallet(data) {
    const walletId = await upsertParent('wallets', {
      ...data.row,
      participant_id: await findId('participants_core', data.refs.participantMongoId),
      event_id: await optionalParent('events', data.refs.eventMongoId),
    });
    await executor.write('DELETE FROM wallet_coupons WHERE wallet_id = ?', [walletId]);
    for (const coupon of data.children.coupons) {
      await upsertRow('wallet_coupons', { wallet_id: walletId, ...coupon }, { touchMirroredAt: true });
    }
    return walletId;
  }

  async function upsertVendor(data) {
    const vendorId = await upsertParent('vendors', {
      ...data.row,
      event_id: await optionalParent('events', data.refs.eventMongoId),
    });
    await executor.write('DELETE FROM vendor_menu_items WHERE vendor_id = ?', [vendorId]);
    for (const item of data.children.menuItems) {
      await upsertRow('vendor_menu_items', { vendor_id: vendorId, ...item }, { touchMirroredAt: true });
    }
    return vendorId;
  }

  async function upsertTransaction(data) {
    const reversalId = data.refs.reversalOfMongoId
      ? await findId('wallet_transactions', data.refs.reversalOfMongoId, { required: false })
      : null;
    const transactionId = await upsertParent('wallet_transactions', {
      ...data.row,
      wallet_id: await findId('wallets', data.refs.walletMongoId),
      vendor_id: await findId('vendors', data.refs.vendorMongoId),
      event_id: await optionalParent('events', data.refs.eventMongoId),
      reversal_of_id: reversalId,
    });
    await executor.write(
      `UPDATE wallet_transactions
       SET reversal_of_id = ?
       WHERE reversal_of_mongo_id = ?
         AND (reversal_of_id IS NULL OR reversal_of_id <> ?)`,
      [transactionId, data.row.mongo_id, transactionId]
    );
    return transactionId;
  }

  async function upsertReceipt(data) {
    return upsertParent('receipts', {
      ...data.row,
      participant_id: await findId('participants_core', data.refs.participantMongoId),
      event_id: await findId('events', data.refs.eventMongoId),
    });
  }

  async function upsertDonation(data) {
    return upsertParent('donation_summaries', {
      ...data.row,
      organization_id: await optionalParent('organizations', data.refs.organizationMongoId),
      series_id: await optionalParent('event_series', data.refs.seriesMongoId),
      event_id: await optionalParent('events', data.refs.eventMongoId),
    });
  }

  async function upsertPackage(data) {
    const packageId = await upsertParent('packages', {
      ...data.row,
      organization_id: await optionalParent('organizations', data.refs.organizationMongoId),
      series_id: await optionalParent('event_series', data.refs.seriesMongoId),
      event_id: await optionalParent('events', data.refs.eventMongoId),
    });
    await executor.write('DELETE FROM package_items WHERE package_id = ?', [packageId]);
    for (const item of data.children.items) {
      const { variants, ...itemRow } = item;
      const itemId = await upsertRow('package_items', { package_id: packageId, ...itemRow }, { touchMirroredAt: false });
      for (const variant of variants) {
        await upsertRow(
          'package_variants',
          { package_item_id: itemId, ...variant },
          { touchMirroredAt: false }
        );
      }
    }
    return packageId;
  }

  async function saveCheckpoint({
    domain,
    runId,
    mapperVersion,
    highWatermarkMongoId,
    lastMongoId,
    processedCount,
    lastSourceHash,
    sourceChecksum,
  }) {
    await executor.write(
      `INSERT INTO mirror_backfill_checkpoints
        (domain_name, run_id, mapper_version, high_watermark_mongo_id, last_mongo_id,
         processed_count, last_source_hash, source_checksum, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
        run_id=VALUES(run_id), mapper_version=VALUES(mapper_version),
        high_watermark_mongo_id=VALUES(high_watermark_mongo_id), last_mongo_id=VALUES(last_mongo_id),
        processed_count=VALUES(processed_count), last_source_hash=VALUES(last_source_hash),
        source_checksum=VALUES(source_checksum), completed_at=NULL`,
      [
        domain,
        runId,
        mapperVersion,
        highWatermarkMongoId,
        lastMongoId,
        processedCount,
        lastSourceHash,
        sourceChecksum,
      ]
    );
  }

  async function checkpoint(domain) {
    const result = await executor.read(
      `SELECT domain_name, run_id, mapper_version, high_watermark_mongo_id,
              last_mongo_id, processed_count, last_source_hash, source_checksum, completed_at
       FROM mirror_backfill_checkpoints WHERE domain_name = ?`,
      [domain]
    );
    return result.rows[0] || null;
  }

  async function completeCheckpoint({ domain, runId, processedCount, sourceChecksum }) {
    await executor.write(
      `UPDATE mirror_backfill_checkpoints
       SET processed_count = ?, source_checksum = ?, completed_at = CURRENT_TIMESTAMP(3)
       WHERE domain_name = ? AND run_id = ?`,
      [processedCount, sourceChecksum, domain, runId]
    );
  }

  async function countRows(table, { highWatermarkMongoId = null } = {}) {
    if (!COUNT_TABLES.has(table)) throw new Error(`SQL count is not allowed for table ${table}`);
    const result = highWatermarkMongoId
      ? await executor.read(
        `SELECT COUNT(*) AS count FROM ${identifier(table)} WHERE mongo_id <= ?`,
        [highWatermarkMongoId]
      )
      : await executor.read(`SELECT COUNT(*) AS count FROM ${identifier(table)}`);
    return Number(result.rows[0]?.count || 0);
  }

  async function reconcileTransactionReversals() {
    return executor.write(
      `UPDATE wallet_transactions child
       JOIN wallet_transactions parent ON parent.mongo_id = child.reversal_of_mongo_id
       SET child.reversal_of_id = parent.id
       WHERE child.reversal_of_mongo_id IS NOT NULL
         AND (child.reversal_of_id IS NULL OR child.reversal_of_id <> parent.id)`
    );
  }

  async function sourceChecksum(table, { highWatermarkMongoId = null, batchSize = 1000 } = {}) {
    if (!COUNT_TABLES.has(table)) throw new Error(`SQL checksum is not allowed for table ${table}`);
    const limit = Math.min(Math.max(Math.floor(Number(batchSize) || 1000), 1), 5000);
    let lastId = '0';
    let checksum = '0'.repeat(64);
    while (true) {
      const params = [lastId];
      const highWatermarkClause = highWatermarkMongoId ? ' AND mongo_id <= ?' : '';
      if (highWatermarkMongoId) params.push(highWatermarkMongoId);
      const result = await executor.read(
        `SELECT id, source_hash FROM ${identifier(table)}
         WHERE id > ?${highWatermarkClause}
         ORDER BY id ASC LIMIT ${limit}`,
        params
      );
      if (result.rows.length === 0) break;
      for (const row of result.rows) checksum = xorChecksum(checksum, row.source_hash);
      lastId = String(result.rows[result.rows.length - 1].id);
    }
    return checksum;
  }

  return {
    checkpoint,
    completeCheckpoint,
    countRows,
    reconcileTransactionReversals,
    saveCheckpoint,
    sourceChecksum,
    upsertDonation,
    upsertEvent,
    upsertEventSeries,
    upsertOrganization,
    upsertPackage,
    upsertParticipant,
    upsertReceipt,
    upsertTransaction,
    upsertVendor,
    upsertWallet,
  };
}

module.exports = {
  createReportingMirrorRepository,
};
