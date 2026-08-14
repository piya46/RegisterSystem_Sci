require('dotenv').config();

const { closeSQL, connectSQL, executeSql } = require('../config/sql');

async function read(sql, params = []) {
  return (await executeSql(sql, params, {
    operation: 'read',
    timeoutMs: 60000,
  })).rows;
}

async function main() {
  await connectSQL();
  try {
    const events = await read(
      `SELECT e.id, e.mongo_id, e.event_year, e.slug, e.status,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id=e.id) AS registrations,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id=e.id AND r.registered_point_id IS NOT NULL) AS registrations_with_point_id,
              (SELECT COUNT(*) FROM event_registration_checkins c WHERE c.event_id=e.id) AS checkins,
              (SELECT COUNT(*) FROM event_registration_checkins c WHERE c.event_id=e.id AND c.registration_point_id IS NOT NULL) AS checkins_with_point_id
         FROM events e
        ORDER BY e.id`
    );
    const runtimeConfigs = await read(
      `SELECT c.event_id, e.mongo_id,
              JSON_UNQUOTE(JSON_EXTRACT(c.registration_config_json, '$.status')) AS status,
              JSON_UNQUOTE(JSON_EXTRACT(c.registration_config_json, '$.config.kioskStartDate')) AS kioskStartDate,
              JSON_UNQUOTE(JSON_EXTRACT(c.registration_config_json, '$.config.kioskEndDate')) AS kioskEndDate
         FROM event_runtime_configs c
         JOIN events e ON e.id = c.event_id
        ORDER BY c.event_id`
    );
    const points = await read(
      `SELECT event_id, enabled, point_type, COUNT(*) AS count
         FROM event_registration_points
        GROUP BY event_id, enabled, point_type
        ORDER BY event_id, enabled, point_type`
    );
    console.log(JSON.stringify({ events, runtimeConfigs, points }, null, 2));
  } finally {
    await closeSQL();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL event registration state inspection failed: ${error.message}`);
    process.exitCode = 1;
  });
}
