/*
 * Rule Studio backend.
 *
 * REST API the UI uses to browse rules, author/validate/save custom rules into
 * the CLI fork, and pack/publish the CLI for download. Also serves the built UI
 * and the packed CLI tarballs.
 */
const express = require("express");
const path = require("path");
const fs = require("fs");

const { TEMPLATES } = require("./lib/templates");
const rules = require("./lib/rules");
const { validateSpec } = require("./lib/validator");
const publisher = require("./lib/publisher");

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- tiny request logger -------------------------------------------------
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) console.log(`${req.method} ${req.path}`);
  next();
});

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(400).json({ error: e.message || String(e) });
  });

// --- meta ----------------------------------------------------------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/templates", (_req, res) =>
  res.json(
    TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      nodeType: t.nodeType,
      advanced: !!t.advanced,
      params: t.params,
    })),
  ),
);

// --- rules ---------------------------------------------------------------
app.get(
  "/api/rules",
  wrap((_req, res) =>
    res.json({
      custom: rules.listCustomRules(),
      builtin: rules.listBuiltinRules(),
    }),
  ),
);

app.get(
  "/api/rules/:ruleId",
  wrap((req, res) => {
    const r = rules.getCustomRule(req.params.ruleId);
    if (!r) return res.status(404).json({ error: "not found" });
    res.json(r);
  }),
);

// validate without saving
app.post(
  "/api/rules/validate",
  wrap(async (req, res) => res.json(await validateSpec(req.body || {}))),
);

// create / update (validates first; refuses to save a broken rule)
app.post(
  "/api/rules",
  wrap(async (req, res) => {
    const spec = req.body || {};
    const validation = await validateSpec(spec);
    if (!validation.ok) {
      return res.status(422).json({ error: "validation failed", validation });
    }
    const saved = rules.saveRule(spec);
    res.json({ saved, validation });
  }),
);

app.delete(
  "/api/rules/:ruleId",
  wrap((req, res) => {
    const ok = rules.deleteRule(req.params.ruleId);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ deleted: req.params.ruleId });
  }),
);

// --- CLI build / distribution -------------------------------------------
app.get(
  "/api/cli",
  wrap((_req, res) => res.json(publisher.cliInfo())),
);

app.post(
  "/api/cli/pack",
  wrap(async (req, res) => res.json(await publisher.packCli(req.body || {}))),
);

app.post(
  "/api/cli/docker",
  wrap(async (req, res) => res.json(await publisher.buildDocker(req.body || {}))),
);

// download a packed tarball
app.get("/download/:file", (req, res) => {
  const file = path.basename(req.params.file);
  const full = path.join(publisher.DIST_DIR, file);
  if (!file.endsWith(".tgz") || !fs.existsSync(full)) {
    return res.status(404).send("not found");
  }
  res.download(full);
});

// --- static UI (built) ---------------------------------------------------
const UI_DIST = path.resolve(__dirname, "../ui/dist");
if (fs.existsSync(UI_DIST)) {
  app.use(express.static(UI_DIST));
  app.get(/^(?!\/api|\/download).*/, (_req, res) =>
    res.sendFile(path.join(UI_DIST, "index.html")),
  );
}

const PORT = process.env.PORT || 4600;
app.listen(PORT, () => {
  console.log(`Rule Studio API on http://localhost:${PORT}`);
  if (!fs.existsSync(UI_DIST)) {
    console.log("UI not built yet — run the UI dev server (npm run dev in ../ui) or build it.");
  }
});

module.exports = app;
