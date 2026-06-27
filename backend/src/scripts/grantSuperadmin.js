require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/admin');

const username = process.argv[2] || process.env.SUPERADMIN_USERNAME || 'piya.s';

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const admin = await Admin.findOne({ username });
  if (!admin) {
    throw new Error(`ไม่พบบัญชี ${username}`);
  }
  const roles = Array.isArray(admin.role) ? admin.role : [admin.role].filter(Boolean);
  if (!roles.includes('superadmin')) {
    admin.role = ['superadmin', ...roles.filter((role) => role !== 'superadmin')];
    await admin.save();
    console.log(`Granted superadmin to ${username}`);
  } else {
    console.log(`${username} is already superadmin`);
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during script failure
  }
  process.exit(1);
});
