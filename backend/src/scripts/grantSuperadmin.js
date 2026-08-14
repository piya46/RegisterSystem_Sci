const mongoose = require('mongoose');
const Admin = require('../models/admin');
const ApiLog = require('../models/apilog');
const {
  evidenceReference,
  explicitMigrationApply,
} = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');

function grantSuperadminOptions({
  args = process.argv.slice(2),
  env = process.env,
} = {}) {
  const username = String(
    args.find((value) => !String(value).startsWith('--')) || env.SUPERADMIN_USERNAME || ''
  ).trim();
  if (!/^[A-Za-z0-9._@-]{1,128}$/.test(username)) {
    throw new Error('An explicit safe superadmin username is required');
  }

  const apply = explicitMigrationApply({
    writeFlag: 'SUPERADMIN_GRANT_WRITE',
    args,
    env,
  });
  if (apply && env.CONFIRM_SUPERADMIN_GRANT !== `grant-superadmin:${username}`) {
    throw new Error(`CONFIRM_SUPERADMIN_GRANT=grant-superadmin:${username} is required`);
  }
  const changeReference = String(env.SUPERADMIN_GRANT_CHANGE_REFERENCE || '').trim();
  if (
    apply
    && (
      !evidenceReference(changeReference)
      || !/^[A-Za-z0-9._:/-]{8,128}$/.test(changeReference)
    )
  ) {
    throw new Error('SUPERADMIN_GRANT_CHANGE_REFERENCE must identify the approved break-glass change');
  }
  return { apply, changeReference, username };
}

async function inspectAdmin(username) {
  const admin = await Admin.findOne({ username }).select('_id role').lean();
  if (!admin) throw new Error(`ไม่พบบัญชี ${username}`);
  const roles = Array.isArray(admin.role) ? admin.role : [admin.role].filter(Boolean);
  return {
    adminId: String(admin._id),
    alreadySuperadmin: roles.includes('superadmin'),
  };
}

async function applySuperadminGrant({ username, changeReference }) {
  const session = await mongoose.startSession();
  let report = null;
  try {
    await session.withTransaction(async () => {
      const admin = await Admin.findOne({ username }).session(session);
      if (!admin) throw new Error(`ไม่พบบัญชี ${username}`);
      const roles = Array.isArray(admin.role) ? admin.role : [admin.role].filter(Boolean);
      if (roles.includes('superadmin')) {
        report = {
          adminId: String(admin._id),
          alreadySuperadmin: true,
          changed: false,
        };
        return;
      }

      admin.role = ['superadmin', ...roles.filter((role) => role !== 'superadmin')];
      await admin.save({ session });
      await ApiLog.create([{
        user: 'break-glass-cli',
        userId: String(admin._id),
        method: 'CLI',
        url: '',
        status: 200,
        ip: '',
        userAgent: '',
        action: 'GRANT_SUPERADMIN_BREAK_GLASS',
        detail: JSON.stringify({ changeReference }),
        error: '',
      }], { session });
      report = {
        adminId: String(admin._id),
        alreadySuperadmin: false,
        changed: true,
      };
    });
    return report;
  } finally {
    await session.endSession();
  }
}

async function main() {
  require('dotenv').config();
  const options = grantSuperadminOptions();
  if (!process.env.MONGODB_URI) throw new Error('Missing MONGODB_URI');

  await connectMongoForMigration(process.env.MONGODB_URI);
  try {
    if (!options.apply) {
      const inspection = await inspectAdmin(options.username);
      console.log(JSON.stringify({
        dryRun: true,
        username: options.username,
        wouldGrant: !inspection.alreadySuperadmin,
      }, null, 2));
      console.log(
        'Dry run only. Use --apply with SUPERADMIN_GRANT_WRITE=true, exact confirmation, and a change reference.'
      );
      return;
    }

    const report = await applySuperadminGrant(options);
    console.log(JSON.stringify({
      dryRun: false,
      changed: report.changed,
      alreadySuperadmin: report.alreadySuperadmin,
      changeReference: options.changeReference,
    }, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(`Superadmin grant failed: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = {
  applySuperadminGrant,
  grantSuperadminOptions,
};
