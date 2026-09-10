const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const store = require("./store");

const app = express();
const PORT = process.env.PORT || 3001;
const ADD_MS = 10_000;
const CHANGE_MS = 1_000;

app.use(cors());
app.use(express.json({ limit: "100kb" }));

const adds = [];
const changes = [];
let addTimer = null;
let changeTimer = null;

function flushAdds() {
  addTimer = null;
  const batch = adds.splice(0);
  for (const item of batch) {
    const result = store.addIds([item.id]);
    item.res.json({
      ok: result.added.length > 0,
      duplicate: result.duplicates.length > 0,
      invalid: result.invalid.length > 0,
    });
  }
}

function flushChanges() {
  changeTimer = null;
  const batch = changes.splice(0);
  for (const item of batch) {
    if (item.type === "select") store.selectIds([item.id]);
    else if (item.type === "unselect") store.unselectIds([item.id]);
    else store.reorderMany([item.op]);
    item.res.json({ ok: true });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/list", (req, res) => {
  const side = req.query.side === "right" ? "right" : "left";
  const q = req.query.q == null ? "" : String(req.query.q);
  res.json(store.query(side, q, req.query.offset));
});

app.post("/api/add", (req, res) => {
  adds.push({ id: req.body?.id, res });
  if (!addTimer) addTimer = setTimeout(flushAdds, ADD_MS);
});

app.post("/api/select", (req, res) => {
  changes.push({ type: "select", id: req.body?.id, res });
  if (!changeTimer) changeTimer = setTimeout(flushChanges, CHANGE_MS);
});

app.post("/api/unselect", (req, res) => {
  changes.push({ type: "unselect", id: req.body?.id, res });
  if (!changeTimer) changeTimer = setTimeout(flushChanges, CHANGE_MS);
});

app.post("/api/reorder", (req, res) => {
  changes.push({ type: "reorder", op: req.body || {}, res });
  if (!changeTimer) changeTimer = setTimeout(flushChanges, CHANGE_MS);
});

const distPath = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT}`);
});
