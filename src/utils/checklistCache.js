const crypto = require("crypto");
const { LRUCache } = require("lru-cache");
const logger = require("./logger");

const log = logger.child({ component: "checklistCache" });

/**
 * Memoises the output of the rules engine.
 *
 * For a given (service, action, state, answers) the result is identical until
 * an editor changes something — but producing it costs a service lookup, a
 * rule resolution, condition evaluation and a document hydration query every
 * time. The wizard's final step is the busiest endpoint in the product and it
 * was redoing all of that for every visitor asking the same question.
 *
 * Bounded rather than a plain Map: the key space is services × actions × 36
 * states × every combination of answers, which is effectively unbounded, and
 * an unbounded cache on a long-lived process is a memory leak with extra steps.
 */
const cache = new LRUCache({
  max: 2000,
  /**
   * A backstop, not the invalidation strategy — every editor action that could
   * change a result clears the affected entries explicitly (see the exports
   * below). This exists for the case nobody thought of: an hour is short
   * enough that a missed invalidation self-heals before anyone acts on it, and
   * long enough that the cache is still doing its job.
   */
  ttl: 60 * 60 * 1000,
  ttlAutopurge: false,
});

let hits = 0;
let misses = 0;

/**
 * Object key order is not guaranteed across requests — `{a:1,b:2}` and
 * `{b:2,a:1}` are the same question and must produce the same key, or the
 * cache silently never hits. Sorting recursively is what makes the hash a
 * function of the content rather than of the JSON the client happened to send.
 */
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonical(value[key]);
        return acc;
      }, {});
  }
  return value;
};

/**
 * Keys are prefixed with the service slug so a rule edit can drop exactly the
 * entries for that service without tracking them separately.
 */
const buildKey = ({ serviceSlug, action, state, answers }) => {
  const digest = crypto
    .createHash("sha1")
    .update(JSON.stringify(canonical({ action, state, answers: answers || {} })))
    .digest("hex");

  return `${serviceSlug}::${digest}`;
};

const get = (key) => {
  const value = cache.get(key);
  value ? hits++ : misses++;
  return value;
};

const set = (key, value) => cache.set(key, value);

/**
 * Everything for one service. Called when a rule or the service itself
 * changes — both alter what the engine would now produce.
 */
const invalidateService = (serviceSlug) => {
  if (!serviceSlug) return invalidateAll("unknown service slug");

  const prefix = `${serviceSlug}::`;
  let dropped = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      dropped++;
    }
  }

  if (dropped) log.info({ serviceSlug, dropped }, "Checklist cache invalidated");
  return dropped;
};

/**
 * Used when a document changes.
 *
 * A document is shared across every rule that references it, and the cached
 * result carries its name, issuing body and official URL. Working out which
 * services reference it would mean scanning every rule; clearing everything
 * costs a few seconds of recomputation and cannot be wrong. Editor actions are
 * rare — this is the right trade.
 */
const invalidateAll = (reason = "document changed") => {
  const dropped = cache.size;
  cache.clear();
  if (dropped) log.info({ dropped, reason }, "Checklist cache cleared");
  return dropped;
};

/** For the admin dashboard and for asserting behaviour in tests. */
const stats = () => ({
  size: cache.size,
  max: cache.max,
  hits,
  misses,
  hitRate: hits + misses ? Number((hits / (hits + misses)).toFixed(3)) : 0,
});

const resetStats = () => {
  hits = 0;
  misses = 0;
};

module.exports = {
  buildKey,
  get,
  set,
  invalidateService,
  invalidateAll,
  stats,
  resetStats,
};
