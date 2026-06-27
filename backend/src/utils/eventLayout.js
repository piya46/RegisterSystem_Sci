const MAX_BLOCKS = 40;
const MAX_FIELDS = 100;
const MAX_TEXT = 2000;
const MAX_SHORT_TEXT = 180;
const MAX_URL = 800;

const EVENT_STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'event_day',
  'archived',
  'active',
];

const PUBLIC_EVENT_STATUSES = new Set(['published', 'registration_open', 'event_day', 'active']);
const REGISTRATION_OPEN_STATUSES = new Set(['registration_open', 'active']);

const LAYOUT_KEYS = ['landingPage', 'registrationForm', 'dashboard', 'ticket', 'report'];
const LANDING_BLOCK_TYPES = new Set([
  'hero',
  'richText',
  'details',
  'schedule',
  'packages',
  'sponsors',
  'faq',
  'map',
  'cta',
  'divider',
]);
const FORM_FIELD_TYPES = new Set([
  'text',
  'email',
  'phone',
  'tel',
  'number',
  'select',
  'checkbox',
  'consent',
  'textarea',
  'date',
]);

function clampText(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').slice(0, max);
}

function clampShortText(value) {
  return clampText(value, MAX_SHORT_TEXT);
}

function sanitizeUrl(value) {
  const url = clampText(value, MAX_URL).trim();
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol)) return parsed.toString();
  } catch {
    return '';
  }
  return '';
}

function sanitizeColor(value, fallback = '') {
  const color = clampShortText(value).trim();
  if (!color) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return fallback;
}

function sanitizeArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function sanitizeOptionList(value) {
  return sanitizeArray(value, 80)
    .map((item) => {
      if (typeof item === 'string') return { label: clampShortText(item), value: clampShortText(item) };
      return {
        label: clampShortText(item?.label || item?.value),
        value: clampShortText(item?.value || item?.label),
      };
    })
    .filter((item) => item.label && item.value);
}

function sanitizeLandingBlock(block, index) {
  const type = LANDING_BLOCK_TYPES.has(block?.type) ? block.type : 'richText';
  const id = clampShortText(block?.id) || `${type}-${index + 1}`;
  const base = {
    id,
    type,
    enabled: block?.enabled !== false,
    title: clampShortText(block?.title),
    subtitle: clampText(block?.subtitle, 500),
    body: clampText(block?.body),
  };

  if (type === 'hero') {
    return {
      ...base,
      imageUrl: sanitizeUrl(block?.imageUrl),
      logoUrl: sanitizeUrl(block?.logoUrl),
      primaryActionLabel: clampShortText(block?.primaryActionLabel || 'ลงทะเบียน'),
      primaryActionUrl: sanitizeUrl(block?.primaryActionUrl),
      secondaryActionLabel: clampShortText(block?.secondaryActionLabel),
      secondaryActionUrl: sanitizeUrl(block?.secondaryActionUrl),
    };
  }

  if (type === 'schedule') {
    return {
      ...base,
      items: sanitizeArray(block?.items, 80).map((item) => ({
        time: clampShortText(item?.time),
        title: clampShortText(item?.title),
        description: clampText(item?.description, 500),
      })).filter((item) => item.time || item.title || item.description),
    };
  }

  if (type === 'sponsors') {
    return {
      ...base,
      items: sanitizeArray(block?.items, 80).map((item) => ({
        name: clampShortText(item?.name),
        logoUrl: sanitizeUrl(item?.logoUrl),
        url: sanitizeUrl(item?.url),
      })).filter((item) => item.name || item.logoUrl),
    };
  }

  if (type === 'faq') {
    return {
      ...base,
      items: sanitizeArray(block?.items, 80).map((item) => ({
        question: clampShortText(item?.question),
        answer: clampText(item?.answer, 800),
      })).filter((item) => item.question || item.answer),
    };
  }

  if (type === 'map') {
    return {
      ...base,
      address: clampText(block?.address, 500),
      mapUrl: sanitizeUrl(block?.mapUrl),
    };
  }

  if (type === 'cta') {
    return {
      ...base,
      buttonLabel: clampShortText(block?.buttonLabel || 'ดำเนินการต่อ'),
      buttonUrl: sanitizeUrl(block?.buttonUrl),
    };
  }

  return base;
}

function sanitizeRegistrationField(field, index) {
  const type = FORM_FIELD_TYPES.has(field?.type) ? field.type : 'text';
  const name = clampShortText(field?.name || `field_${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return {
    id: clampShortText(field?.id) || name || `field_${index + 1}`,
    name: name || `field_${index + 1}`,
    label: clampShortText(field?.label || field?.name || `ช่องข้อมูล ${index + 1}`),
    type,
    required: field?.required === true,
    helpText: clampText(field?.helpText, 500),
    placeholder: clampShortText(field?.placeholder),
    options: type === 'select' ? sanitizeOptionList(field?.options) : [],
  };
}

function sanitizeLayoutConfig(layoutKey, config) {
  if (layoutKey === 'landingPage') {
    return {
      blocks: sanitizeArray(config?.blocks, MAX_BLOCKS).map(sanitizeLandingBlock),
    };
  }

  if (layoutKey === 'registrationForm') {
    return {
      sections: sanitizeArray(config?.sections, 30).map((section, index) => ({
        id: clampShortText(section?.id) || `section-${index + 1}`,
        title: clampShortText(section?.title),
        description: clampText(section?.description, 500),
      })),
      fields: sanitizeArray(config?.fields, MAX_FIELDS).map(sanitizeRegistrationField),
    };
  }

  if (layoutKey === 'dashboard') {
    return {
      widgets: sanitizeArray(config?.widgets, 60).map((widget, index) => ({
        id: clampShortText(widget?.id) || `widget-${index + 1}`,
        type: clampShortText(widget?.type || 'metric'),
        title: clampShortText(widget?.title),
        enabled: widget?.enabled !== false,
      })),
    };
  }

  if (layoutKey === 'ticket') {
    return {
      blocks: sanitizeArray(config?.blocks, 60).map((block, index) => ({
        id: clampShortText(block?.id) || `ticket-block-${index + 1}`,
        type: clampShortText(block?.type || 'text'),
        label: clampShortText(block?.label),
        value: clampText(block?.value, 500),
        enabled: block?.enabled !== false,
      })),
    };
  }

  if (layoutKey === 'report') {
    return {
      columns: sanitizeArray(config?.columns, 100).map((column, index) => ({
        id: clampShortText(column?.id) || `column-${index + 1}`,
        key: clampShortText(column?.key || column?.id || `column_${index + 1}`),
        label: clampShortText(column?.label || column?.key || `คอลัมน์ ${index + 1}`),
        enabled: column?.enabled !== false,
      })),
    };
  }

  return {};
}

function sanitizeBranding(value = {}) {
  return {
    logoUrl: sanitizeUrl(value.logoUrl),
    coverImageUrl: sanitizeUrl(value.coverImageUrl),
    primaryColor: sanitizeColor(value.primaryColor, '#f7b500'),
    secondaryColor: sanitizeColor(value.secondaryColor, '#114b5f'),
    accentColor: sanitizeColor(value.accentColor, '#22a06b'),
  };
}

function sanitizePublicLinks(value = {}) {
  return {
    landingPath: clampShortText(value.landingPath),
    registrationPath: clampShortText(value.registrationPath),
    checkinPath: clampShortText(value.checkinPath),
    reportPath: clampShortText(value.reportPath),
  };
}

function isPublicEventStatus(status) {
  return PUBLIC_EVENT_STATUSES.has(status);
}

function isRegistrationOpenStatus(status) {
  return REGISTRATION_OPEN_STATUSES.has(status);
}

module.exports = {
  EVENT_STATUSES,
  LAYOUT_KEYS,
  clampShortText,
  clampText,
  isPublicEventStatus,
  isRegistrationOpenStatus,
  sanitizeBranding,
  sanitizeLayoutConfig,
  sanitizePublicLinks,
  sanitizeUrl,
};
