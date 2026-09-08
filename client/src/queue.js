const ADD_MS = 10_000;
const SYNC_MS = 1_000;

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const adds = new Map();
const selects = new Map();
const unselects = new Map();
const reorders = new Map();
const fetches = new Map();

let addTimer = null;
let syncTimer = null;
let flushingAdds = false;
let flushingSync = false;
const listeners = new Set();

function emit() {
  const snapshot = getStatus();
  for (const fn of listeners) fn(snapshot);
}

export function getStatus() {
  return {
    adds: adds.size,
    changes: selects.size + unselects.size + reorders.size,
    fetches: fetches.size,
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(getStatus());
  return () => listeners.delete(fn);
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("request failed");
  return res.json();
}

export function enqueueAdd(id) {
  if (adds.has(id)) return adds.get(id).promise;
  const d = deferred();
  adds.set(id, d);
  emit();
  return d.promise;
}

export function enqueueSelect(id) {
  unselects.delete(id);
  selects.set(id, true);
  emit();
}

export function enqueueUnselect(id) {
  selects.delete(id);
  unselects.set(id, true);
  emit();
}

export function enqueueReorder(op) {
  reorders.set(op.id, op);
  emit();
}

export function enqueueFetch(side, q, offset) {
  if (offset === 0) {
    for (const [key, item] of [...fetches]) {
      if (item.side === side) {
        fetches.delete(key);
        item.resolve({ cancelled: true, items: [], hasMore: false });
      }
    }
  }

  const key = `${side}:${q}:${offset}`;
  if (fetches.has(key)) return fetches.get(key).promise;

  const d = deferred();
  fetches.set(key, { side, q, offset, promise: d.promise, resolve: d.resolve });
  emit();
  return d.promise;
}

async function flushAdds() {
  if (flushingAdds || adds.size === 0) return;
  flushingAdds = true;
  const batch = [...adds.entries()];
  adds.clear();
  emit();
  try {
    const data = await post("/api/add", { ids: batch.map(([id]) => id) });
    const dup = new Set(data.duplicates || []);
    const invalid = new Set(data.invalid || []);
    for (const [id, d] of batch) {
      d.resolve({
        ok: !dup.has(id) && !invalid.has(id),
        duplicate: dup.has(id),
        invalid: invalid.has(id),
      });
    }
  } catch {
    for (const [, d] of batch) d.resolve({ ok: false });
  } finally {
    flushingAdds = false;
    emit();
  }
}

async function flushSync() {
  if (flushingSync) return;
  if (selects.size === 0 && unselects.size === 0 && reorders.size === 0 && fetches.size === 0) {
    return;
  }

  flushingSync = true;
  const select = [...selects.keys()];
  const unselect = [...unselects.keys()];
  const reorder = [...reorders.values()];
  const fetchBatch = [...fetches.entries()];

  selects.clear();
  unselects.clear();
  reorders.clear();
  fetches.clear();
  emit();

  try {
    const data = await post("/api/sync", {
      select,
      unselect,
      reorder,
      fetch: fetchBatch.map(([, item]) => ({
        side: item.side,
        q: item.q,
        offset: item.offset,
      })),
    });
    const results = Array.isArray(data.results) ? data.results : [];
    fetchBatch.forEach(([, item], i) => {
      const row = results[i];
      item.resolve(
        row
          ? { cancelled: false, items: row.items, hasMore: row.hasMore }
          : { cancelled: false, items: [], hasMore: false }
      );
    });
  } catch {
    for (const [, item] of fetchBatch) {
      item.resolve({ cancelled: false, items: [], hasMore: false, error: true });
    }
  } finally {
    flushingSync = false;
    emit();
  }
}

export function startQueue() {
  if (!addTimer) addTimer = setInterval(flushAdds, ADD_MS);
  if (!syncTimer) syncTimer = setInterval(flushSync, SYNC_MS);
}
