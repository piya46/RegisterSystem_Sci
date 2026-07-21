const mongoose = require('mongoose');
const Organization = require('../models/organization');
const EventSeries = require('../models/eventSeries');
const Event = require('../models/event');
const SystemSetting = require('../models/SystemSetting');
const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const Prize = require('../models/prize');
const Package = require('../models/Package');
const auditLog = require('../helpers/auditLog');
const { normalizeEventYear, defaultEventYear } = require('../utils/eventYear');
const { pickAllowed, serverError } = require('../utils/httpResponses');
const {
  LAYOUT_KEYS,
  clampShortText,
  isPublicEventStatus,
  sanitizeBranding,
  sanitizeLayoutConfig,
  sanitizePublicLinks,
  sanitizeUrl,
} = require('../utils/eventLayout');
const { hasRole, isAdminLike, isSuperadmin } = require('../utils/permissions');
const {
  claimEventPublicObject,
  parsePublicObjectId,
  unlinkEventPublicObject,
} = require('../utils/objectStorage');

const ORGANIZATION_FIELDS = ['name', 'slug', 'description', 'status', 'securityPolicy', 'metadata'];
const SERIES_FIELDS = ['organizationId', 'name', 'slug', 'description', 'status', 'defaultLinkingMode', 'metadata'];
const EVENT_FIELDS = [
  'organizationId',
  'seriesId',
  'name',
  'slug',
  'eventYear',
  'status',
  'startsAt',
  'endsAt',
  'timezone',
  'linkingMode',
  'linkedEventIds',
  'config',
  'branding',
  'publicLinks',
  'publication',
  'templates',
];
const SETTINGS_CONFIG_FIELDS = [
  'enableRegister',
  'maintenanceMode',
  'enablePickup',
  'enableDelivery',
  'enabledFeatures',
  'allowRegistrationReuse',
  'registrationReuseMode',
  'registrationReuseRequiresOtp',
  'registrationReuseEventIds',
  'contactEmail',
  'welcomeMessage',
  'preRegStartDate',
  'preRegEndDate',
  'kioskStartDate',
  'kioskEndDate',
  'bankAccountName',
  'bankAccountNumber',
  'bankName',
  'paymentQrUrl',
];
const EVENT_MEDIA_FIELDS = [
  { section: 'branding', key: 'logoUrl', field: 'branding.logoUrl', purpose: 'event_media' },
  { section: 'branding', key: 'coverImageUrl', field: 'branding.coverImageUrl', purpose: 'event_media' },
  { section: 'config', key: 'paymentQrUrl', field: 'config.paymentQrUrl', purpose: 'payment_qr' },
];
const FEATURE_DEFAULTS = {
  registration: true,
  checkin: true,
  dashboard: true,
  publicReport: true,
  donations: false,
  packages: false,
  luckyDraw: false,
  certificate: false,
  wallet: false,
};
const LEGACY_FEATURE_DEFAULTS = {
  registration: true,
  checkin: true,
  dashboard: true,
  publicReport: true,
  donations: true,
  packages: true,
  luckyDraw: true,
  certificate: true,
  wallet: true,
};

function featuresForEvent(event) {
  return event?.config?.enabledFeatures
    ? { ...FEATURE_DEFAULTS, ...event.config.enabledFeatures }
    : LEGACY_FEATURE_DEFAULTS;
}
const LEGACY_DATASETS = [
  { key: 'participants', label: 'ผู้เข้าร่วม', model: Participant },
  { key: 'donations', label: 'รายการสนับสนุน', model: Donation },
  { key: 'prizes', label: 'ของรางวัล', model: Prize },
  { key: 'packages', label: 'แพ็กเกจ', model: Package },
];

function toSlug(value, fallback = 'item') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-ฮะ-์]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function cleanObjectIdList(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(String).filter((value) => mongoose.Types.ObjectId.isValid(value)))];
}

function idList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value))
    .filter(Boolean);
}

function canAccessOrganization(user, organizationId) {
  if (isSuperadmin(user) || hasRole(user, 'admin')) return true;
  const organizationIds = idList(user?.organizationIds);
  return organizationIds.includes(String(organizationId));
}

function canAccessEvent(user, event) {
  if (isSuperadmin(user) || hasRole(user, 'admin')) return true;
  if (!event) return false;
  const eventIds = idList(user?.eventIds);
  if (eventIds.includes(String(event._id))) return true;
  if (hasRole(user, 'org_admin')) return canAccessOrganization(user, event.organizationId);
  return false;
}

function requireEventScope(req, res, event) {
  if (canAccessEvent(req.user, event)) return true;
  res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์จัดการกิจกรรมนี้' });
  return false;
}

function missingEventYearFilter() {
  return {
    $or: [
      { eventYear: null },
      { eventYear: '' },
      { eventYear: { $exists: false } },
    ],
  };
}

function unmappedEventFilter() {
  return {
    $or: [{ eventId: null }, { eventId: { $exists: false } }],
  };
}

function migrationBackfillYear(settings) {
  return normalizeEventYear(process.env.BACKFILL_EVENT_YEAR || settings?.currentEventYear);
}

function settingsToEventConfig(settings) {
  const config = SETTINGS_CONFIG_FIELDS.reduce((acc, field) => {
    if (settings?.[field] !== undefined) acc[field] = settings[field];
    return acc;
  }, {});
  if (config.enabledFeatures !== undefined) {
    config.enabledFeatures = {
      ...FEATURE_DEFAULTS,
      ...Object.fromEntries(
        Object.keys(FEATURE_DEFAULTS).map((key) => [key, config.enabledFeatures?.[key] === true])
      ),
    };
    if (config.enabledFeatures.registration === false) config.enableRegister = false;
  }
  if (config.allowRegistrationReuse !== undefined) config.allowRegistrationReuse = config.allowRegistrationReuse === true;
  if (config.registrationReuseRequiresOtp !== undefined) config.registrationReuseRequiresOtp = true;
  if (config.registrationReuseMode !== undefined && !['series-linked', 'manual-linked'].includes(config.registrationReuseMode)) {
    config.registrationReuseMode = 'series-linked';
  }
  if (config.registrationReuseEventIds !== undefined) {
    config.registrationReuseEventIds = cleanObjectIdList(config.registrationReuseEventIds);
  }
  for (const key of ['bankAccountName', 'bankAccountNumber', 'bankName']) {
    if (config[key] !== undefined) config[key] = clampShortText(config[key]);
  }
  if (config.paymentQrUrl !== undefined) config.paymentQrUrl = sanitizeUrl(config.paymentQrUrl);
  return config;
}

function externalEventMediaAllowed() {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.EVENT_MEDIA_ALLOW_EXTERNAL_URLS || '').toLowerCase());
}

async function reconcileEventMediaLinks({ current, payload, eventId, session }) {
  for (const descriptor of EVENT_MEDIA_FIELDS) {
    const section = payload[descriptor.section];
    if (!section || !Object.prototype.hasOwnProperty.call(section, descriptor.key)) continue;
    const previousUrl = String(current?.[descriptor.section]?.[descriptor.key] || '').trim();
    const nextUrl = String(section[descriptor.key] || '').trim();
    const previousId = parsePublicObjectId(previousUrl);
    const nextId = parsePublicObjectId(nextUrl);

    if (nextUrl) {
      if (!nextId && nextUrl !== previousUrl && !externalEventMediaAllowed()) {
        const error = new Error('กรุณาอัปโหลดรูปภาพผ่านระบบจัดเก็บไฟล์ของกิจกรรม');
        error.statusCode = 400;
        throw error;
      }
      if (nextId) {
        const claimed = await claimEventPublicObject(nextUrl, {
          eventId,
          purpose: descriptor.purpose,
          field: descriptor.field,
          session,
        });
        section[descriptor.key] = claimed.url;
      }
    }

    if (previousId && previousId !== nextId) {
      await unlinkEventPublicObject(previousUrl, {
        eventId,
        field: descriptor.field,
        session,
      });
    }
  }
}

async function countRowsByEventIds(eventIds = []) {
  const objectIds = eventIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  const result = {};
  await Promise.all(LEGACY_DATASETS.map(async ({ key, model }) => {
    const rows = await model.aggregate([
      { $match: { eventId: { $in: objectIds } } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]);
    result[key] = rows.reduce((acc, row) => {
      acc[String(row._id)] = row.count;
      return acc;
    }, {});
  }));
  return result;
}

async function countRowsForEventId(eventId) {
  const countsByDataset = await countRowsByEventIds([eventId]);
  const id = String(eventId);
  return LEGACY_DATASETS.reduce((acc, { key }) => {
    acc[key] = countsByDataset[key]?.[id] || 0;
    return acc;
  }, {});
}

function totalEventRows(counts = {}) {
  return Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
}

function eventConfigToSettings(event) {
  const config = event?.config || {};
  const updates = SETTINGS_CONFIG_FIELDS.reduce((acc, field) => {
    if (config[field] !== undefined) acc[field] = config[field];
    return acc;
  }, {});
  return {
    ...updates,
    eventName: event.name,
    currentEventYear: normalizeEventYear(event.eventYear),
    currentEventId: event._id,
    currentEventSeriesId: event.seriesId,
    defaultOrganizationId: event.organizationId,
    eventLinkingMode: event.linkingMode,
  };
}

async function getOrCreateSettings() {
  let settings = await SystemSetting.findOne();
  if (!settings) settings = await SystemSetting.create({});
  if (!settings.currentEventYear) {
    settings.currentEventYear = defaultEventYear();
    await settings.save();
  }
  return settings;
}

async function getSettingsReadOnly() {
  const settings = await SystemSetting.findOne();
  return settings || {
    eventName: 'Event Name',
    currentEventYear: defaultEventYear(),
    archivedEventYears: [],
    eventLinkingMode: 'series-linked',
  };
}

async function ensureDefaultCatalog() {
  const settings = await getOrCreateSettings();
  const currentYear = normalizeEventYear(settings.currentEventYear);

  let organization = settings.defaultOrganizationId
    ? await Organization.findById(settings.defaultOrganizationId)
    : null;

  if (!organization) {
    organization = await Organization.findOne({ slug: 'default' });
  }

  if (!organization) {
    organization = await Organization.create({
      name: 'Default Organization',
      slug: 'default',
      description: 'Default organization created for existing event data',
    });
  }

  let series = settings.currentEventSeriesId
    ? await EventSeries.findById(settings.currentEventSeriesId)
    : null;

  if (!series) {
    series = await EventSeries.findOne({
      organizationId: organization._id,
      slug: 'main-event-series',
    });
  }

  if (!series) {
    series = await EventSeries.create({
      organizationId: organization._id,
      name: settings.eventName || 'Main Event',
      slug: 'main-event-series',
      description: 'Default event series created for existing yearly events',
    });
  }

  let event = settings.currentEventId
    ? await Event.findById(settings.currentEventId)
    : null;

  if (!event) {
    event = await Event.findOne({
      organizationId: organization._id,
      seriesId: series._id,
      eventYear: currentYear,
    });
  }

  if (!event) {
    event = await Event.create({
      organizationId: organization._id,
      seriesId: series._id,
      name: settings.eventName || `Event ${currentYear}`,
      slug: toSlug(`${settings.eventName || 'event'}-${currentYear}`, `event-${currentYear}`),
      eventYear: currentYear,
      status: 'active',
      linkingMode: settings.eventLinkingMode || 'series-linked',
      config: settingsToEventConfig(settings),
    });
  }

  const settingsNeedsUpdate = !settings.defaultOrganizationId
    || !settings.currentEventSeriesId
    || !settings.currentEventId
    || normalizeEventYear(settings.currentEventYear) !== normalizeEventYear(event.eventYear);

  if (settingsNeedsUpdate) {
    Object.assign(settings, eventConfigToSettings(event));
    await settings.save();
  }

  return { settings, organization, series, event };
}

async function enrichEvents(events) {
  const years = events.map((event) => normalizeEventYear(event.eventYear)).filter(Boolean);
  const eventIds = events.map((event) => event._id).filter(Boolean);
  const settings = await getSettingsReadOnly();
  const backfillYear = migrationBackfillYear(settings);
  const [eventCountsByDataset, unmappedCountsByYear] = await Promise.all([
    countRowsByEventIds(eventIds),
    countUnmappedRowsByYear(years, backfillYear),
  ]);

  return events.map((event) => {
    const year = normalizeEventYear(event.eventYear);
    const eventId = String(event._id);
    const plain = event.toObject ? event.toObject() : event;
    return {
      ...plain,
      eventDataCounts: {
        participants: eventCountsByDataset.participants?.[eventId] || 0,
        donations: eventCountsByDataset.donations?.[eventId] || 0,
        prizes: eventCountsByDataset.prizes?.[eventId] || 0,
        packages: eventCountsByDataset.packages?.[eventId] || 0,
      },
      legacyDataCounts: {
        participants: unmappedCountsByYear.participants?.[year] || 0,
        donations: unmappedCountsByYear.donations?.[year] || 0,
        prizes: unmappedCountsByYear.prizes?.[year] || 0,
        packages: unmappedCountsByYear.packages?.[year] || 0,
      },
    };
  });
}

async function distinctLegacyYears(settings) {
  const distinctResults = await Promise.all(
    LEGACY_DATASETS.map(({ model }) => model.distinct('eventYear', { eventYear: { $nin: ['', null] } }))
  );
  const years = new Set([
    normalizeEventYear(settings.currentEventYear),
    migrationBackfillYear(settings),
    ...(settings.archivedEventYears || []).map(normalizeEventYear),
    ...distinctResults.flat().map(normalizeEventYear),
  ]);

  return [...years].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
}

async function countLegacyRowsByYear(years, backfillYear) {
  const result = {};
  await Promise.all(LEGACY_DATASETS.map(async ({ key, model }) => {
    const [rows, missingYearCount] = await Promise.all([
      model.aggregate([
        { $match: { eventYear: { $in: years } } },
        { $group: { _id: '$eventYear', count: { $sum: 1 } } },
      ]),
      model.countDocuments(missingEventYearFilter()),
    ]);
    result[key] = rows.reduce((acc, row) => {
      acc[normalizeEventYear(row._id)] = row.count;
      return acc;
    }, {});
    if (missingYearCount > 0) {
      result[key][backfillYear] = (result[key][backfillYear] || 0) + missingYearCount;
    }
  }));
  return result;
}

async function countUnmappedRowsByYear(years, backfillYear) {
  const result = {};
  await Promise.all(LEGACY_DATASETS.map(async ({ key, model }) => {
    const [rows, missingYearUnmappedCount] = await Promise.all([
      model.aggregate([
        {
          $match: {
            eventYear: { $in: years },
            ...unmappedEventFilter(),
          },
        },
        { $group: { _id: '$eventYear', count: { $sum: 1 } } },
      ]),
      model.countDocuments({
        $and: [
          missingEventYearFilter(),
          unmappedEventFilter(),
        ],
      }),
    ]);
    result[key] = rows.reduce((acc, row) => {
      acc[normalizeEventYear(row._id)] = row.count;
      return acc;
    }, {});
    if (missingYearUnmappedCount > 0) {
      result[key][backfillYear] = (result[key][backfillYear] || 0) + missingYearUnmappedCount;
    }
  }));
  return result;
}

async function getLegacyMigrationPreview({ ensureCatalog = true } = {}) {
  const catalog = ensureCatalog ? await ensureDefaultCatalog() : null;
  const settings = catalog?.settings || await getSettingsReadOnly();
  const backfillYear = migrationBackfillYear(settings);
  const years = await distinctLegacyYears(settings);
  const [events, countsByDataset, unmappedByDataset] = await Promise.all([
    Event.find({ eventYear: { $in: years } }).sort({ eventYear: -1 }),
    countLegacyRowsByYear(years, backfillYear),
    countUnmappedRowsByYear(years, backfillYear),
  ]);
  const eventsByYear = new Map();
  events.forEach((event) => {
    const year = normalizeEventYear(event.eventYear);
    if (!eventsByYear.has(year)) eventsByYear.set(year, event);
  });

  const yearsSummary = years.map((year) => {
    const event = eventsByYear.get(year);
    const counts = {};
    const unmapped = {};
    LEGACY_DATASETS.forEach(({ key }) => {
      counts[key] = countsByDataset[key]?.[year] || 0;
      unmapped[key] = unmappedByDataset[key]?.[year] || 0;
    });
    return {
      eventYear: year,
      hasEvent: Boolean(event),
      eventId: event?._id || null,
      eventName: event?.name || '',
      isCurrent: normalizeEventYear(settings.currentEventYear) === year,
      counts,
      unmapped,
    };
  });

  return {
    datasets: LEGACY_DATASETS.map(({ key, label }) => ({ key, label })),
    currentEventYear: normalizeEventYear(settings.currentEventYear),
    backfillEventYear: backfillYear,
    years: yearsSummary,
  };
}

async function migrateLegacyEventData({ dryRun = false } = {}) {
  const catalog = dryRun
    ? { settings: await getSettingsReadOnly(), organization: null, series: null }
    : await ensureDefaultCatalog();
  const { settings, organization, series } = catalog;
  const backfillYear = migrationBackfillYear(settings);
  const preview = await getLegacyMigrationPreview({ ensureCatalog: !dryRun });
  const createdEvents = [];
  const updated = {};
  LEGACY_DATASETS.forEach(({ key }) => { updated[key] = 0; });

  for (const yearSummary of preview.years) {
    const eventYear = normalizeEventYear(yearSummary.eventYear);
    let event = yearSummary.eventId ? await Event.findById(yearSummary.eventId) : null;

    if (!event && !dryRun) {
      const isCurrent = normalizeEventYear(settings.currentEventYear) === eventYear;
      event = await Event.create({
        organizationId: organization._id,
        seriesId: series._id,
        name: isCurrent
          ? settings.eventName || `กิจกรรมปี ${eventYear}`
          : `${settings.eventName || series.name || 'กิจกรรม'} ปี ${eventYear}`,
        slug: toSlug(`${settings.eventName || series.name || 'event'}-${eventYear}`, `event-${eventYear}`),
        eventYear,
        status: isCurrent ? 'active' : 'archived',
        linkingMode: settings.eventLinkingMode || series.defaultLinkingMode || 'series-linked',
        config: settingsToEventConfig(settings),
      });
      createdEvents.push({ eventYear, eventId: event._id, name: event.name });
    } else if (!event && dryRun) {
      createdEvents.push({ eventYear, eventId: null, name: `${settings.eventName || series?.name || 'กิจกรรม'} ปี ${eventYear}` });
    }

    if (!event && dryRun) {
      LEGACY_DATASETS.forEach(({ key }) => {
        updated[key] += yearSummary.unmapped?.[key] || 0;
      });
      continue;
    }

    const refs = {
      organizationId: event.organizationId,
      seriesId: event.seriesId,
      eventId: event._id,
    };

    for (const { key, model } of LEGACY_DATASETS) {
      if (dryRun) {
        updated[key] += yearSummary.unmapped?.[key] || 0;
        continue;
      }
      const updateResult = await model.updateMany(
        {
          eventYear,
          ...unmappedEventFilter(),
        },
        { $set: refs }
      );
      updated[key] += updateResult.modifiedCount || 0;

      if (eventYear === backfillYear) {
        const missingYearUpdateResult = await model.updateMany(
          {
            $and: [
              missingEventYearFilter(),
              unmappedEventFilter(),
            ],
          },
          { $set: { ...refs, eventYear } }
        );
        updated[key] += missingYearUpdateResult.modifiedCount || 0;
      }
    }
  }

  const after = dryRun ? preview : await getLegacyMigrationPreview();
  return {
    dryRun,
    createdEvents,
    updated,
    before: preview,
    after,
  };
}

function prepareOrganizationPayload(body) {
  const payload = pickAllowed(body, ORGANIZATION_FIELDS);
  if (!payload.slug) payload.slug = toSlug(payload.name, 'organization');
  return payload;
}

function prepareSeriesPayload(body) {
  const payload = pickAllowed(body, SERIES_FIELDS);
  if (!payload.slug) payload.slug = toSlug(payload.name, 'series');
  return payload;
}

function prepareEventPayload(body) {
  const payload = pickAllowed(body, EVENT_FIELDS);
  if (payload.eventYear !== undefined) payload.eventYear = normalizeEventYear(payload.eventYear);
  if (!payload.slug) payload.slug = toSlug(`${payload.name || 'event'}-${payload.eventYear || defaultEventYear()}`, 'event');
  if (payload.slug && payload.eventYear && !String(payload.slug).includes(String(payload.eventYear))) {
    payload.slug = toSlug(`${payload.slug}-${payload.eventYear}`, `event-${payload.eventYear}`);
  }
  if (payload.linkedEventIds !== undefined) payload.linkedEventIds = cleanObjectIdList(payload.linkedEventIds);
  if (payload.branding !== undefined) payload.branding = sanitizeBranding(payload.branding);
  if (payload.publicLinks !== undefined) payload.publicLinks = sanitizePublicLinks(payload.publicLinks);
  if (payload.publication !== undefined) {
    payload.publication = {
      consentVersion: clampShortText(payload.publication?.consentVersion),
      requireConsent: payload.publication?.requireConsent !== false,
    };
  }
  if (payload.config !== undefined) payload.config = settingsToEventConfig(payload.config);
  return payload;
}

function publicEventPayload(event) {
  const canonicalPath = (value, fallback, eventPathPattern) => {
    const sanitized = sanitizeUrl(value);
    if (!sanitized || eventPathPattern.test(sanitized)) return fallback;
    return sanitized;
  };
  const landingPath = canonicalPath(
    event.publicLinks?.landingPath,
    `/e/${event.slug}`,
    /^\/e\/[^/?#]+\/?(?:[?#].*)?$/u
  );
  const registrationPath = canonicalPath(
    event.publicLinks?.registrationPath,
    `/e/${event.slug}/register`,
    /^\/e\/[^/?#]+\/register\/?(?:[?#].*)?$/u
  );
  const checkinPath = canonicalPath(
    event.publicLinks?.checkinPath,
    `/e/${event.slug}/checkin`,
    /^\/e\/[^/?#]+\/checkin\/?(?:[?#].*)?$/u
  );
  const reportPath = canonicalPath(
    event.publicLinks?.reportPath,
    `/e/${event.slug}/report`,
    /^\/e\/[^/?#]+\/report\/?(?:[?#].*)?$/u
  );
  const enabledFeatures = featuresForEvent(event);
  const layoutPayload = (key, fallbackConfig) => {
    const layout = event.layouts?.[key] || {};
    const version = Number.parseInt(layout.version, 10);
    return {
      version: Number.isSafeInteger(version) && version > 0 ? version : 1,
      config: sanitizeLayoutConfig(key, layout.config || fallbackConfig),
    };
  };
  const landingPage = layoutPayload('landingPage', { blocks: [] });
  landingPage.config.blocks = landingPage.config.blocks.map((block) => {
    const actionKey = block.type === 'hero'
      ? 'primaryActionUrl'
      : block.type === 'cta'
        ? 'buttonUrl'
        : null;
    if (!actionKey || !/^\/e\/[^/?#]+\/register(?:[?#].*)?$/u.test(block[actionKey] || '')) return block;
    return { ...block, [actionKey]: registrationPath };
  });

  return {
    name: event.name,
    slug: event.slug,
    eventYear: event.eventYear,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    branding: sanitizeBranding(event.branding || {}),
    config: {
      enableRegister: event.config?.enableRegister !== false,
      maintenanceMode: event.config?.maintenanceMode === true,
      contactEmail: clampShortText(event.config?.contactEmail),
      welcomeMessage: clampShortText(event.config?.welcomeMessage),
      preRegStartDate: event.config?.preRegStartDate || null,
      preRegEndDate: event.config?.preRegEndDate || null,
      enablePickup: event.config?.enablePickup !== false,
      enableDelivery: event.config?.enableDelivery !== false,
      enabledFeatures,
      allowRegistrationReuse: event.config?.allowRegistrationReuse === true,
      ...(enabledFeatures.donations ? {
        bankAccountName: clampShortText(event.config?.bankAccountName),
        bankAccountNumber: clampShortText(event.config?.bankAccountNumber),
        bankName: clampShortText(event.config?.bankName),
        paymentQrUrl: sanitizeUrl(event.config?.paymentQrUrl),
      } : {}),
    },
    publication: {
      publishedAt: event.publication?.publishedAt || null,
      consentVersion: event.publication?.consentVersion || '',
      requireConsent: event.publication?.requireConsent !== false,
    },
    publicLinks: sanitizePublicLinks({ landingPath, registrationPath, checkinPath, reportPath }),
    layouts: {
      landingPage,
      registrationForm: layoutPayload('registrationForm', { sections: [], fields: [] }),
    },
  };
}

function addVersionHistory(event, { kind, snapshot, userId, note = '' }) {
  const current = event.layouts?.[kind]?.version || event.versionHistory?.filter((item) => item.kind === kind).length + 1 || 1;
  event.versionHistory = [
    {
      kind,
      version: Number(current),
      snapshot,
      note: clampShortText(note),
      publishedBy: userId || null,
      publishedAt: new Date(),
    },
    ...(event.versionHistory || []),
  ].slice(0, 30);
  event.markModified('versionHistory');
}

exports.ensureDefaultCatalog = ensureDefaultCatalog;
exports.getLegacyMigrationPreviewData = getLegacyMigrationPreview;
exports.migrateLegacyEventData = migrateLegacyEventData;
exports.publicEventPayload = publicEventPayload;

exports.getCurrentEvent = async (req, res) => {
  try {
    const catalog = await ensureDefaultCatalog();
    res.json({ success: true, data: catalog.event });
  } catch (error) {
    serverError(res);
  }
};

exports.getEventById = async (req, res) => {
  try {
    const eventId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: 'รหัสกิจกรรมไม่ถูกต้อง' });
    }
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, event)) return;
    return res.json({ success: true, data: event });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.getPublicCurrentEvent = async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().select('currentEventId').lean();
    if (!settings?.currentEventId) {
      return res.status(404).json({ success: false, message: 'ยังไม่ได้กำหนดกิจกรรมสาธารณะปัจจุบัน' });
    }

    const event = await Event.findById(settings.currentEventId).lean();
    if (!event || !isPublicEventStatus(event.status)) {
      return res.status(404).json({ success: false, message: 'กิจกรรมปัจจุบันยังไม่เปิดเผยแพร่' });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.json({ success: true, data: publicEventPayload(event) });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.getPublicEventById = async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม หรือกิจกรรมยังไม่เปิดเผยแพร่' });
    }

    const event = await Event.findById(eventId).lean();
    if (!event || !isPublicEventStatus(event.status)) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม หรือกิจกรรมยังไม่เปิดเผยแพร่' });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.json({ success: true, data: publicEventPayload(event) });
  } catch (error) {
    return serverError(res, error);
  }
};

exports.getPublicEventBySlug = async (req, res) => {
  try {
    const slug = toSlug(req.params.slug, '');
    const event = await Event.findOne({ slug }).lean();
    if (!event || !isPublicEventStatus(event.status)) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม หรือกิจกรรมยังไม่เปิดเผยแพร่' });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({ success: true, data: publicEventPayload(event) });
  } catch (error) {
    serverError(res, error);
  }
};

exports.getCatalog = async (req, res) => {
  try {
    const { settings } = await ensureDefaultCatalog();
    const [allOrganizations, allSeries, allEvents] = await Promise.all([
      Organization.find().sort({ name: 1 }),
      EventSeries.find().sort({ name: 1 }),
      Event.find().sort({ eventYear: -1, createdAt: -1 }),
    ]);
    const rawEvents = isAdminLike(req.user)
      ? allEvents
      : allEvents.filter((event) => canAccessEvent(req.user, event));
    const visibleOrganizationIds = new Set(rawEvents.map((event) => String(event.organizationId)));
    idList(req.user?.organizationIds).forEach((id) => visibleOrganizationIds.add(id));
    const visibleSeriesIds = new Set(rawEvents.map((event) => String(event.seriesId)));
    const organizations = isAdminLike(req.user)
      ? allOrganizations
      : allOrganizations.filter((organization) => visibleOrganizationIds.has(String(organization._id)));
    const series = isAdminLike(req.user)
      ? allSeries
      : allSeries.filter((item) => visibleSeriesIds.has(String(item._id)) || visibleOrganizationIds.has(String(item.organizationId)));
    const events = await enrichEvents(rawEvents);
    res.json({
      success: true,
      data: {
        settings,
        organizations,
        series,
        events,
      },
    });
  } catch (error) {
    serverError(res);
  }
};

exports.getMigrationPreview = async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ success: false, message: 'เฉพาะ Superadmin/Admin เท่านั้นที่ตรวจ migration ข้อมูลเดิมได้' });
    }
    const preview = await getLegacyMigrationPreview();
    res.json({ success: true, data: preview });
  } catch (error) {
    serverError(res, error);
  }
};

exports.runLegacyMigration = async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ success: false, message: 'เฉพาะ Superadmin/Admin เท่านั้นที่รัน migration ข้อมูลเดิมได้' });
    }
    const dryRun = req.body?.dryRun === true;
    const result = await migrateLegacyEventData({ dryRun });
    auditLog({
      req,
      action: dryRun ? 'PREVIEW_LEGACY_EVENT_MIGRATION' : 'RUN_LEGACY_EVENT_MIGRATION',
      detail: dryRun
        ? 'Previewed legacy event migration'
        : `Migrated legacy event data; createdEvents=${result.createdEvents.length}`,
    });
    res.json({
      success: true,
      data: result,
      message: dryRun ? 'ตรวจสอบข้อมูลเดิมสำเร็จ' : 'เชื่อมข้อมูลเดิมเข้ากิจกรรมสำเร็จ',
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.createOrganization = async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ success: false, message: 'เฉพาะ Superadmin/Admin เท่านั้นที่สร้างหน่วยงานใหม่ได้' });
    }
    const payload = prepareOrganizationPayload(req.body);
    const organization = await Organization.create(payload);
    auditLog({ req, action: 'CREATE_ORGANIZATION', detail: `Created organization ${organization._id}` });
    res.status(201).json({ success: true, data: organization });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'slug องค์กรนี้ถูกใช้แล้ว' });
    }
    serverError(res, error);
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const payload = prepareOrganizationPayload(req.body);
    const current = await Organization.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'ไม่พบองค์กร' });
    if (!isAdminLike(req.user) && !canAccessOrganization(req.user, current._id)) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์จัดการหน่วยงานนี้' });
    }
    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!organization) return res.status(404).json({ success: false, message: 'ไม่พบองค์กร' });
    auditLog({ req, action: 'UPDATE_ORGANIZATION', detail: `Updated organization ${organization._id}` });
    res.json({ success: true, data: organization });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'slug องค์กรนี้ถูกใช้แล้ว' });
    }
    serverError(res, error);
  }
};

exports.createSeries = async (req, res) => {
  try {
    const payload = prepareSeriesPayload(req.body);
    if (!canAccessOrganization(req.user, payload.organizationId)) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์สร้างชุดกิจกรรมในหน่วยงานนี้' });
    }
    const series = await EventSeries.create(payload);
    auditLog({ req, action: 'CREATE_EVENT_SERIES', detail: `Created event series ${series._id}` });
    res.status(201).json({ success: true, data: series });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'slug ซีรีส์นี้ถูกใช้แล้วในองค์กรนี้' });
    }
    serverError(res, error);
  }
};

exports.updateSeries = async (req, res) => {
  try {
    const payload = prepareSeriesPayload(req.body);
    const current = await EventSeries.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'ไม่พบซีรีส์กิจกรรม' });
    if (!canAccessOrganization(req.user, current.organizationId)) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์จัดการชุดกิจกรรมนี้' });
    }
    const series = await EventSeries.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!series) return res.status(404).json({ success: false, message: 'ไม่พบซีรีส์กิจกรรม' });
    auditLog({ req, action: 'UPDATE_EVENT_SERIES', detail: `Updated event series ${series._id}` });
    res.json({ success: true, data: series });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'slug ซีรีส์นี้ถูกใช้แล้วในองค์กรนี้' });
    }
    serverError(res, error);
  }
};

exports.createEvent = async (req, res) => {
  const dbSession = await mongoose.startSession();
  try {
    const payload = prepareEventPayload(req.body);
    if (!canAccessOrganization(req.user, payload.organizationId)) {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์สร้างกิจกรรมในหน่วยงานนี้' });
    }
    const sourceEventId = req.body.cloneFromEventId;
    const cloneParts = Array.isArray(req.body.cloneParts) ? req.body.cloneParts : [];
    let cloneBaseline = {};

    if (sourceEventId && cloneParts.length > 0) {
      const sourceEvent = await Event.findById(sourceEventId);
      if (sourceEvent) {
        if (!canAccessEvent(req.user, sourceEvent)) {
          return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์คัดลอกจากกิจกรรมต้นทางนี้' });
        }
        if (cloneParts.includes('branding')) payload.branding = sourceEvent.branding;
        if (cloneParts.includes('config')) {
          payload.config = {
            ...sourceEvent.config,
            ...(payload.config || {}),
            allowRegistrationReuse: false,
            registrationReuseEventIds: [],
          };
        }
        if (cloneParts.includes('layouts')) payload.layouts = sourceEvent.layouts;
        if (cloneParts.includes('templates')) payload.templates = sourceEvent.templates;
        cloneBaseline = {
          branding: cloneParts.includes('branding') ? sourceEvent.branding : {},
          config: cloneParts.includes('config') ? sourceEvent.config : {},
        };
      }
    }

    const event = new Event(payload);
    await dbSession.withTransaction(async () => {
      await reconcileEventMediaLinks({
        current: cloneBaseline,
        payload,
        eventId: event._id,
        session: dbSession,
      });
      event.set(payload);
      await event.save({ session: dbSession });
    });
    auditLog({ req, action: 'CREATE_EVENT', detail: `Created event ${event._id}` });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'slug กิจกรรมนี้ถูกใช้แล้วในซีรีส์นี้' });
    }
    serverError(res, error);
  } finally {
    dbSession.endSession();
  }
};

exports.updateEvent = async (req, res) => {
  const dbSession = await mongoose.startSession();
  try {
    const current = await Event.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, current)) return;
    let event;
    await dbSession.withTransaction(async () => {
      const payload = prepareEventPayload(req.body);
      delete payload.status;
      const transactionalCurrent = await Event.findById(req.params.id).session(dbSession);
      if (!transactionalCurrent) {
        const error = new Error('ไม่พบกิจกรรม');
        error.statusCode = 404;
        throw error;
      }
      if (req.body.branding !== undefined) {
        payload.branding = sanitizeBranding({
          ...(transactionalCurrent.branding?.toObject?.() || transactionalCurrent.branding || {}),
          ...(req.body.branding || {}),
        });
      }
      if (payload.config) {
        payload.config = {
          ...(transactionalCurrent.config || {}),
          ...payload.config,
          enabledFeatures: {
            ...((transactionalCurrent.config || {}).enabledFeatures || {}),
            ...(payload.config.enabledFeatures || {}),
          },
        };
        if (payload.config.enabledFeatures.registration === false) payload.config.enableRegister = false;
      }
      await reconcileEventMediaLinks({
        current: transactionalCurrent,
        payload,
        eventId: transactionalCurrent._id,
        session: dbSession,
      });
      transactionalCurrent.set(payload);
      event = await transactionalCurrent.save({ session: dbSession });
    });
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    auditLog({ req, action: 'UPDATE_EVENT', detail: `Updated event ${event._id}` });
    res.json({ success: true, data: event });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'slug กิจกรรมนี้ถูกใช้แล้วในซีรีส์นี้' });
    }
    serverError(res, error);
  } finally {
    dbSession.endSession();
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, event)) return;

    const settings = await getSettingsReadOnly();
    if (String(settings.currentEventId || '') === String(event._id)) {
      return res.status(409).json({
        success: false,
        message: 'ไม่สามารถลบรอบกิจกรรมปัจจุบันได้ กรุณาตั้งรอบอื่นเป็นปัจจุบันหรือเก็บย้อนหลังแทน',
      });
    }

    const counts = await countRowsForEventId(event._id);
    if (totalEventRows(counts) > 0) {
      auditLog({ req, action: 'DELETE_EVENT_BLOCKED', detail: `eventId=${event._id} has rows`, status: 409 });
      return res.status(409).json({
        success: false,
        message: 'รอบกิจกรรมนี้มีข้อมูลผู้เข้าร่วมหรือข้อมูลประกอบอยู่แล้ว จึงลบไม่ได้เพื่อรักษารายงานและ Audit Log กรุณาใช้เก็บย้อนหลังแทน',
        data: { counts },
      });
    }

    event.status = 'archived';
    event.archivedAt = new Date();
    await event.save();
    auditLog({ req, action: 'ARCHIVE_EVENT', detail: `Archived empty event ${event._id}` });
    res.json({ success: true, data: event, message: 'เก็บรอบกิจกรรมย้อนหลังสำเร็จ' });
  } catch (error) {
    serverError(res, error);
  }
};

exports.activateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, event)) return;

    if (event.status === 'draft') event.status = 'published';
    event.activatedAt = new Date();
    await event.save();

    const settings = await getOrCreateSettings();
    Object.assign(settings, eventConfigToSettings(event));
    await settings.save();

    auditLog({ req, action: 'ACTIVATE_EVENT', detail: `Activated event ${event._id}` });
    res.json({ success: true, data: { event, settings }, message: 'ตั้งเป็นกิจกรรมปัจจุบันสำเร็จ' });
  } catch (error) {
    serverError(res, error);
  }
};

exports.updateEventStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'published', 'registration_open', 'registration_closed', 'event_day', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, message: 'สถานะกิจกรรมไม่ถูกต้อง' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, event)) return;

    event.status = status;
    if (status === 'published' && !event.publication?.publishedAt) {
      event.publication.publishedAt = new Date();
      event.publication.publishedBy = req.user?._id || null;
    }
    if (status === 'registration_open') event.publication.registrationOpenedAt = new Date();
    if (status === 'registration_closed') event.publication.registrationClosedAt = new Date();
    if (status === 'archived') event.archivedAt = new Date();

    addVersionHistory(event, {
      kind: 'event',
      snapshot: publicEventPayload(event),
      userId: req.user?._id,
      note: `status=${status}`,
    });
    event.markModified('publication');
    await event.save();

    auditLog({ req, action: 'UPDATE_EVENT_STATUS', detail: `Updated event ${event._id} status=${status}` });
    res.json({ success: true, data: event, message: 'อัปเดตสถานะกิจกรรมสำเร็จ' });
  } catch (error) {
    serverError(res, error);
  }
};

exports.publishEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, event)) return;

    event.layouts = event.layouts || {};
    event.layouts.landingPage = event.layouts.landingPage || { version: 1, config: { blocks: [] } };
    event.layouts.registrationForm = event.layouts.registrationForm || { version: 1, config: { sections: [], fields: [] } };
    event.publication = event.publication || {};
    const landingConfig = sanitizeLayoutConfig('landingPage', event.layouts?.landingPage?.config || {});
    const registrationConfig = sanitizeLayoutConfig('registrationForm', event.layouts?.registrationForm?.config || {});
    event.layouts.landingPage.config = landingConfig;
    event.layouts.registrationForm.config = registrationConfig;
    event.status = event.status === 'draft' ? 'published' : event.status;
    event.publication.publishedAt = new Date();
    event.publication.publishedBy = req.user?._id || null;
    event.publicLinks = sanitizePublicLinks({
      landingPath: `/e/${event.slug}`,
      registrationPath: `/e/${event.slug}/register`,
      checkinPath: `/e/${event.slug}/checkin`,
      reportPath: `/e/${event.slug}/report`,
      ...(event.publicLinks || {}),
    });
    addVersionHistory(event, {
      kind: 'landingPage',
      snapshot: publicEventPayload(event),
      userId: req.user?._id,
      note: clampShortText(req.body?.note || 'publish'),
    });
    event.markModified('layouts');
    event.markModified('publication');
    event.markModified('publicLinks');
    await event.save();

    auditLog({ req, action: 'PUBLISH_EVENT', detail: `Published event ${event._id}` });
    res.json({ success: true, data: event, message: 'เผยแพร่กิจกรรมสำเร็จ' });
  } catch (error) {
    serverError(res, error);
  }
};

exports.updateLayout = async (req, res) => {
  try {
    const { layoutKey } = req.params;
    if (!LAYOUT_KEYS.includes(layoutKey)) {
      return res.status(400).json({ success: false, message: 'layout key ไม่ถูกต้อง' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรม' });
    if (!requireEventScope(req, res, event)) return;

    event.layouts = event.layouts || {};
    const current = event.layouts?.[layoutKey] || { version: 0 };
    event.layouts[layoutKey] = {
      version: Number(current.version || 0) + 1,
      updatedBy: req.user?._id || null,
      updatedAt: new Date(),
      config: sanitizeLayoutConfig(layoutKey, req.body?.config || {}),
    };
    addVersionHistory(event, {
      kind: layoutKey,
      snapshot: event.layouts[layoutKey].config,
      userId: req.user?._id,
      note: req.body?.note || 'layout update',
    });
    event.markModified(`layouts.${layoutKey}`);
    await event.save();

    auditLog({ req, action: 'UPDATE_EVENT_LAYOUT', detail: `Updated layout ${layoutKey} for event ${event._id}` });
    res.json({ success: true, data: event.layouts[layoutKey], message: 'บันทึก layout สำเร็จ' });
  } catch (error) {
    serverError(res, error);
  }
};

exports.cloneSettings = async (req, res) => {
  try {
    const { sourceEventId, targetEventId } = req.body;
    const [sourceEvent, targetEvent] = await Promise.all([
      Event.findById(sourceEventId),
      Event.findById(targetEventId),
    ]);
    if (!sourceEvent || !targetEvent) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรมต้นทางหรือปลายทาง' });
    }
    if (!requireEventScope(req, res, sourceEvent) || !requireEventScope(req, res, targetEvent)) return;

    targetEvent.config = sourceEvent.config;
    targetEvent.layouts = sourceEvent.layouts;
    targetEvent.templates = sourceEvent.templates;
    targetEvent.markModified('config');
    targetEvent.markModified('layouts');
    targetEvent.markModified('templates');
    await targetEvent.save();

    auditLog({ req, action: 'CLONE_EVENT_SETTINGS', detail: `Cloned settings ${sourceEvent._id} -> ${targetEvent._id}` });
    res.json({ success: true, data: targetEvent, message: 'คัดลอก settings/layout/templates สำเร็จ' });
  } catch (error) {
    serverError(res, error);
  }
};
