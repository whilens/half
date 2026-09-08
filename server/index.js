const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const store = require("./store");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/add", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  res.json(store.addIds(ids));
});

app.post("/api/sync", (req, res) => {
  const body = req.body || {};

  if (Array.isArray(body.select) && body.select.length) {
    store.selectIds(body.select);
  }
  if (Array.isArray(body.unselect) && body.unselect.length) {
    store.unselectIds(body.unselect);
  }
  if (Array.isArray(body.reorder) && body.reorder.length) {
    store.reorderMany(body.reorder);
  }

  const fetches = Array.isArray(body.fetch) ? body.fetch : [];
  const results = fetches.map((item) => {
    const side = item?.side === "right" ? "right" : "left";
    const q = item?.q == null ? "" : String(item.q);
    const offset = item?.offset;
    const data = store.query(side, q, offset);
    return { side, q, offset: Math.max(0, Number(offset) || 0), ...data };
  });

  res.json({ results });
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
