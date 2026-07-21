const {
  enqueueSqlMirror,
  integerEnv,
  reportOutboxHookError,
  sqlMirrorOutboxEnabled,
} = require('./sqlMirrorOutbox');

const SOURCE_REFERENCES = Symbol('sqlMirrorSourceReferences');

function eventIdFor(document, eventPath) {
  if (!eventPath || !document) return null;
  if (typeof document.get === 'function') return document.get(eventPath) || null;
  return document[eventPath] || null;
}

async function enqueueReference(domain, reference, session) {
  try {
    await enqueueSqlMirror({ domain, sourceId: reference._id, eventId: reference.eventId, session });
  } catch (error) {
    reportOutboxHookError(error, domain);
  }
}

function sqlMirrorOutboxPlugin(schema, { domain, eventPath = 'eventId' } = {}) {
  if (!domain) throw new Error('SQL mirror outbox plugin requires a domain');

  schema.post('save', async function enqueueSavedDocument(document) {
    if (!sqlMirrorOutboxEnabled()) return;
    await enqueueReference(domain, {
      _id: document._id,
      eventId: eventIdFor(document, eventPath),
    }, document.$session?.() || null);
  });

  for (const operation of ['findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'updateOne', 'updateMany']) {
    schema.pre(operation, async function rememberAffectedSources() {
      if (!sqlMirrorOutboxEnabled()) return;
      try {
        const maximum = integerEnv('SQL_OUTBOX_MAX_ENQUEUE_PER_WRITE', 1000, { min: 1, max: 10000 });
        let query = this.model.find(this.getFilter()).select(`_id${eventPath ? ` ${eventPath}` : ''}`).limit(maximum + 1);
        const session = this.getOptions().session;
        if (session) query = query.session(session);
        const references = await query.lean();
        if (references.length > maximum) {
          const error = new Error('SQL mirror bulk update exceeds the outbox enqueue limit');
          error.code = 'SQL_OUTBOX_BULK_LIMIT_EXCEEDED';
          reportOutboxHookError(error, domain);
          this[SOURCE_REFERENCES] = [];
          return;
        }
        this[SOURCE_REFERENCES] = references.map((document) => ({
          _id: document._id,
          eventId: eventPath ? document[eventPath] || null : null,
        }));
      } catch (error) {
        this[SOURCE_REFERENCES] = [];
        reportOutboxHookError(error, domain);
      }
    });

    schema.post(operation, async function enqueueUpdatedSources(result) {
      if (!sqlMirrorOutboxEnabled()) return;
      const session = this.getOptions().session || null;
      const references = [...(this[SOURCE_REFERENCES] || [])];
      const resultDocument = result && result._id ? result : null;
      const upsertedId = result?.upsertedId?._id || result?.upsertedId || null;
      if (resultDocument && !references.some((item) => String(item._id) === String(resultDocument._id))) {
        references.push({ _id: resultDocument._id, eventId: eventIdFor(resultDocument, eventPath) });
      } else if (upsertedId && !references.some((item) => String(item._id) === String(upsertedId))) {
        references.push({ _id: upsertedId, eventId: null });
      }
      for (const reference of references) await enqueueReference(domain, reference, session);
    });
  }

  for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(operation, { document: true, query: true }, function rejectHardDelete() {
      if (!sqlMirrorOutboxEnabled()) return;
      const error = new Error(`Hard delete is disabled for SQL-mirrored domain ${domain}; use a soft-delete field`);
      error.code = 'SQL_MIRROR_HARD_DELETE_UNSUPPORTED';
      throw error;
    });
  }

  for (const operation of ['insertMany', 'bulkWrite']) {
    schema.pre(operation, function rejectUntrackedBulkWrite() {
      if (!sqlMirrorOutboxEnabled()) return;
      const error = new Error(`${operation} is disabled for SQL-mirrored domain ${domain}; use tracked writes or reconcile explicitly`);
      error.code = 'SQL_OUTBOX_UNTRACKED_BULK_WRITE';
      throw error;
    });
  }
}

module.exports = sqlMirrorOutboxPlugin;
