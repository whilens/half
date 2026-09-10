async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("request failed");
  return res.json();
}

export function addId(id) {
  return post("/api/add", { id });
}

export function selectId(id) {
  return post("/api/select", { id });
}

export function unselectId(id) {
  return post("/api/unselect", { id });
}

export function reorderItem(op) {
  return post("/api/reorder", op);
}

export async function fetchList(side, q, offset) {
  const params = new URLSearchParams({ side, q, offset: String(offset) });
  const res = await fetch(`/api/list?${params}`);
  if (!res.ok) throw new Error("request failed");
  return res.json();
}
