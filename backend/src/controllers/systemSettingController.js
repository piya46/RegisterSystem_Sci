const SystemSetting = require('../models/SystemSetting');
const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const Prize = require('../models/prize');
const EventModel = require('../models/event');
const auditLog = require('../helpers/auditLog');
const { serverError, pickAllowed } = require('../utils/httpResponses');
const { defaultEventYear, normalizeEventYear } = require('../utils/eventYear');

const SETTING_FIELDS = [
  'eventName',
  'defaultOrganizationId',
  'currentEventSeriesId',
  'currentEventId',
  'currentEventYear',
  'eventLinkingMode',
  'archivedEventYears',
  'enableRegister',
  'maintenanceMode',
  'enablePickup',
  'enableDelivery',
  'contactEmail',
  'welcomeMessage',
  'preRegStartDate',
  'preRegEndDate',
  'kioskStartDate',
  'kioskEndDate'
];

exports.getSettings = async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    if (!settings.currentEventYear) {
      settings.currentEventYear = defaultEventYear();
      await settings.save();
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    serverError(res);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = pickAllowed(req.body, SETTING_FIELDS);
    if (updates.currentEventYear !== undefined) {
      updates.currentEventYear = normalizeEventYear(updates.currentEventYear);
    }
    if (updates.archivedEventYears !== undefined) {
      updates.archivedEventYears = Array.isArray(updates.archivedEventYears)
        ? [...new Set(updates.archivedEventYears.map(normalizeEventYear))]
        : [];
    }
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create(updates);
    } else {
      settings = await SystemSetting.findOneAndUpdate(
        { _id: settings._id },
        { $set: updates },
        { new: true, runValidators: true }
      );
    }
    auditLog({ req, action: 'UPDATE_SYSTEM_SETTINGS', detail: 'Admin updated system settings' });
    res.json({ success: true, data: settings, message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (error) {
    serverError(res);
  }
};

exports.getEventYears = async (req, res) => {
  try {
    const settings = await SystemSetting.findOne();
    const [participantYears, donationYears, prizeYears, eventYears] = await Promise.all([
      Participant.distinct('eventYear', { eventYear: { $ne: '' } }),
      Donation.distinct('eventYear', { eventYear: { $ne: '' } }),
      Prize.distinct('eventYear', { eventYear: { $ne: '' } }),
      EventModel.distinct('eventYear', { eventYear: { $ne: '' } }),
    ]);

    const years = new Set([
      normalizeEventYear(settings?.currentEventYear),
      ...(settings?.archivedEventYears || []).map(normalizeEventYear),
      ...participantYears.map(normalizeEventYear),
      ...donationYears.map(normalizeEventYear),
      ...prizeYears.map(normalizeEventYear),
      ...eventYears.map(normalizeEventYear),
    ]);

    res.json({
      success: true,
      currentEventYear: normalizeEventYear(settings?.currentEventYear),
      data: [...years].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a))),
    });
  } catch (error) {
    serverError(res);
  }
};
