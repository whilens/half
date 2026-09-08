const BASE_MAX = 1_000_000;
const PAGE = 20;

const extraIds = new Set();
const selectedSet = new Set();
let selected = [];

function isSafeInt(id) {
  return typeof id === "number" && Number.isSafeInteger(id);
}

function exists(id) {
  return (id >= 1 && id <= BASE_MAX) || extraIds.has(id);
}

function matchesPrefix(id, prefix) {
  if (!prefix) return true;
  return String(id).startsWith(prefix);
}

function* iterateAvailable() {
  const extras = [...extraIds].sort((a, b) => a - b);
  let i = 0;
  while (i < extras.length && extras[i] < 1) {
    yield extras[i++];
  }
  for (let id = 1; id <= BASE_MAX; id++) {
    yield id;
  }
  while (i < extras.length) {
    yield extras[i++];
  }
}

function getLeft(prefix, offset) {
  const items = [];
  let skipped = 0;
  let hasMore = false;

  for (const id of iterateAvailable()) {
    if (selectedSet.has(id)) continue;
    if (!matchesPrefix(id, prefix)) continue;
    if (skipped < offset) {
      skipped++;
      continue;
    }
    if (items.length < PAGE) {
      items.push(id);
    } else {
      hasMore = true;
      break;
    }
  }

  return { items, hasMore };
}

function getRight(prefix, offset) {
  const filtered = prefix
    ? selected.filter((id) => matchesPrefix(id, prefix))
    : selected;
  return {
    items: filtered.slice(offset, offset + PAGE),
    hasMore: offset + PAGE < filtered.length,
  };
}

function addIds(ids) {
  const added = [];
  const duplicates = [];
  const invalid = [];

  const seen = new Set();
  for (const raw of ids) {
    const id = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (!isSafeInt(id)) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(id) || exists(id)) {
      duplicates.push(id);
      continue;
    }
    seen.add(id);
    extraIds.add(id);
    added.push(id);
  }

  return { added, duplicates, invalid };
}

function selectIds(ids) {
  const selectedNow = [];
  for (const id of ids) {
    if (!isSafeInt(id) || !exists(id) || selectedSet.has(id)) continue;
    selectedSet.add(id);
    selected.push(id);
    selectedNow.push(id);
  }
  return selectedNow;
}

function unselectIds(ids) {
  const want = new Set(ids.filter(isSafeInt));
  if (want.size === 0) return [];
  const removed = [];
  selected = selected.filter((id) => {
    if (!want.has(id)) return true;
    selectedSet.delete(id);
    removed.push(id);
    return false;
  });
  return removed;
}

function reorderOne({ id, beforeId, afterId }) {
  if (!isSafeInt(id) || !selectedSet.has(id)) return;
  const next = selected.filter((x) => x !== id);

  if (isSafeInt(beforeId) && beforeId !== id) {
    const idx = next.indexOf(beforeId);
    if (idx === -1) next.push(id);
    else next.splice(idx, 0, id);
  } else if (isSafeInt(afterId) && afterId !== id) {
    const idx = next.indexOf(afterId);
    if (idx === -1) next.push(id);
    else next.splice(idx + 1, 0, id);
  } else {
    next.push(id);
  }

  selected = next;
}

function reorderMany(ops) {
  if (!Array.isArray(ops)) return;
  for (const op of ops) {
    if (op && typeof op === "object") reorderOne(op);
  }
}

function query(side, q, offset) {
  const prefix = String(q || "");
  const off = Math.max(0, Number(offset) || 0);
  if (side === "right") return getRight(prefix, off);
  return getLeft(prefix, off);
}

module.exports = {
  addIds,
  selectIds,
  unselectIds,
  reorderMany,
  query,
};
