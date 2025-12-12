const cron = require('node-cron');
const { getReportData } = require('../services/reportService');
const { generatePDF } = require('../utils/pdfGenerator');
const { uploadToDrive } = require('../utils/googleDrive');
const CronLog = require('../models/cronLog');
const logger = require('../utils/logger');

const runBackupTask = async () => {
  const jobName = 'Auto PDF Report (Mon-Wed-Fri)';
  logger.info(`[Scheduler] Starting ${jobName}...`);
  
  const logEntry = await CronLog.create({ jobName, status: 'running' });

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    
    const data = await getReportData();
    const pdfBuffer = await generatePDF(data, 'System Authorized Access Auto');
    const fileName = `Report_${dateStr}_${timeStr}.pdf`;

    const driveFile = await uploadToDrive(fileName, pdfBuffer, 'application/pdf');

    logEntry.status = 'success';
    logEntry.endTime = new Date();
    logEntry.detail = `Uploaded: ${fileName} (ID: ${driveFile.id})`;
    await logEntry.save();

    logger.info('[Scheduler] Task success.');
  } catch (error) {
    logEntry.status = 'failed';
    logEntry.endTime = new Date();
    logEntry.detail = error.message;
    await logEntry.save();
    
    logger.error(`[Scheduler] Task failed: ${error.message}`);
  }
};

const initScheduler = () => {
  // จันทร์(1), พุธ(3), ศุกร์(5) เวลา 19:00 น.
  cron.schedule('0 19 * * 1,3,5', () => {
    runBackupTask();
  }, { scheduled: true, timezone: "Asia/Bangkok" });
  
  logger.info('[Scheduler] Initialized: Mon, Wed, Fri at 19:00');
};

module.exports = initScheduler;