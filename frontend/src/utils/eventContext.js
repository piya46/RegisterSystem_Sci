export function eventContextFromSearch(search = "") {
  const params = new URLSearchParams(search);
  const eventId = params.get("eventId") || "";
  const eventYear = params.get("eventYear") || "";
  const eventSlug = params.get("eventSlug") || "";
  return { eventId, eventYear, eventSlug };
}

export function cleanEventContext(context = {}) {
  return Object.entries({
    eventId: context.eventId,
    eventYear: context.eventYear,
    eventSlug: context.eventSlug,
  }).reduce((acc, [key, value]) => {
    if (value) acc[key] = value;
    return acc;
  }, {});
}

export function eventContextToParams(context = {}, extra = {}) {
  return {
    ...cleanEventContext(context),
    ...Object.entries(extra).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== "") acc[key] = value;
      return acc;
    }, {}),
  };
}

export function appendQuery(path, params = {}) {
  const cleanParams = Object.entries(params).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== "") acc[key] = value;
    return acc;
  }, {});
  const query = new URLSearchParams(cleanParams).toString();
  if (!query) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${query}`;
}
