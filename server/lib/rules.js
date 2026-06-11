/*
 * The rule repository: the bridge between the UI and cli/externalPlugins/.
 *
 * Custom rules authored in the UI are written here as apigeelint plugin files.
 * Because the forked CLI auto-loads this directory, anything written here ships
 * inside the next packed/published CLI build.
 */
const fs = require("fs");
const path = require("path");
const { generatePlugin, parseEmbeddedSpec, fileBaseName } = require("./generator");
const { NODE_PREFIX, byId } = require("./templates");

const CLI_DIR = path.resolve(__dirname, "../../cli");
const EXTERNAL_DIR = path.join(CLI_DIR, "externalPlugins");
const BUILTIN_DIR = path.join(CLI_DIR, "lib", "package", "plugins");

function ensureDir() {
  if (!fs.existsSync(EXTERNAL_DIR)) fs.mkdirSync(EXTERNAL_DIR, { recursive: true });
}

// Lightweight field extraction from a plugin descriptor without executing code.
function extractField(source, field) {
  const re = new RegExp(`${field}\\s*:\\s*("([^"]*)"|'([^']*)'|([0-9]+)|true|false)`);
  const m = source.match(re);
  if (!m) return undefined;
  if (m[2] !== undefined) return m[2];
  if (m[3] !== undefined) return m[3];
  if (m[4] !== undefined) return Number(m[4]);
  return m[1] === "true";
}

function readCustomFile(file) {
  const full = path.join(EXTERNAL_DIR, file);
  const source = fs.readFileSync(full, "utf8");
  const spec = parseEmbeddedSpec(source);
  return {
    file,
    ruleId: (spec && spec.ruleId) || extractField(source, "ruleId"),
    name: (spec && spec.name) || extractField(source, "name"),
    message: (spec && spec.message) || extractField(source, "message"),
    severity: spec ? spec.severity : extractField(source, "severity"),
    nodeType: (spec && spec.nodeType) || extractField(source, "nodeType"),
    enabled: spec ? spec.enabled : extractField(source, "enabled") !== false,
    editable: !!spec, // only Rule-Studio-authored rules round-trip into the editor
    templateId: spec ? spec.templateId : null,
    params: spec ? spec.params : null,
    source,
  };
}

function listCustomRules() {
  ensureDir();
  return fs
    .readdirSync(EXTERNAL_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
    .map((f) => {
      const r = readCustomFile(f);
      delete r.source;
      return r;
    })
    .sort((a, b) => String(a.ruleId).localeCompare(String(b.ruleId)));
}

function getCustomRule(ruleId) {
  ensureDir();
  const file = fs.readdirSync(EXTERNAL_DIR).find((f) => {
    if (!f.endsWith(".js")) return false;
    return readCustomFile(f).ruleId === ruleId;
  });
  if (!file) return null;
  return readCustomFile(file);
}

function listBuiltinRules() {
  if (!fs.existsSync(BUILTIN_DIR)) return [];
  return fs
    .readdirSync(BUILTIN_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_") && f !== "README.md")
    .map((f) => {
      const source = fs.readFileSync(path.join(BUILTIN_DIR, f), "utf8");
      return {
        file: f,
        ruleId: extractField(source, "ruleId") || f.split("-")[0],
        name: extractField(source, "name"),
        severity: extractField(source, "severity"),
        nodeType: extractField(source, "nodeType"),
        builtin: true,
      };
    })
    .sort((a, b) => String(a.ruleId).localeCompare(String(b.ruleId)));
}

// Assign the next free EX-<PREFIX><NNN> id, floored at 50 so authored rules
// never collide with bundled example rules (EX-PO001, EX-PO007).
function assignRuleId(nodeType) {
  const prefix = NODE_PREFIX[nodeType] || "PO";
  const re = new RegExp(`^EX-${prefix}(\\d{3})$`);
  let max = 49;
  for (const r of listCustomRules()) {
    const m = re.exec(r.ruleId || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  const n = String(max + 1).padStart(3, "0");
  return `EX-${prefix}${n}`;
}

function allRuleIds() {
  return new Set([
    ...listBuiltinRules().map((r) => r.ruleId),
    ...listCustomRules().map((r) => r.ruleId),
  ]);
}

/*
 * Persist a rule. `spec` is the UI payload. If spec.ruleId is absent a new id is
 * assigned. On rename (the file base name changed) the old file is removed so we
 * don't leave a stale duplicate behind. Returns the saved rule descriptor.
 */
function saveRule(spec) {
  ensureDir();
  const tmpl = byId(spec.templateId);
  if (!tmpl) throw new Error(`unknown template: ${spec.templateId}`);
  if (!spec.name || !String(spec.name).trim()) throw new Error("name is required");

  const isNew = !spec.ruleId;
  const nodeType = tmpl.advanced ? spec.nodeType || tmpl.nodeType : tmpl.nodeType;

  if (isNew) {
    spec.ruleId = assignRuleId(nodeType);
  } else {
    // editing: make sure it actually refers to an existing custom rule
    const existing = getCustomRule(spec.ruleId);
    if (!existing) throw new Error(`rule ${spec.ruleId} not found`);
  }

  const { code } = generatePlugin(spec);
  const newFile = `${fileBaseName(spec)}.js`;

  // Remove any prior file for this ruleId whose name (and therefore filename)
  // changed, to avoid duplicates.
  for (const f of fs.readdirSync(EXTERNAL_DIR)) {
    if (!f.endsWith(".js")) continue;
    const r = readCustomFile(f);
    if (r.ruleId === spec.ruleId && f !== newFile) {
      fs.unlinkSync(path.join(EXTERNAL_DIR, f));
    }
  }

  fs.writeFileSync(path.join(EXTERNAL_DIR, newFile), code, "utf8");
  return { ...readCustomFile(newFile), created: isNew };
}

function deleteRule(ruleId) {
  ensureDir();
  const file = fs.readdirSync(EXTERNAL_DIR).find((f) => {
    if (!f.endsWith(".js")) return false;
    return readCustomFile(f).ruleId === ruleId;
  });
  if (!file) return false;
  fs.unlinkSync(path.join(EXTERNAL_DIR, file));
  return true;
}

module.exports = {
  CLI_DIR,
  EXTERNAL_DIR,
  listCustomRules,
  getCustomRule,
  listBuiltinRules,
  saveRule,
  deleteRule,
  assignRuleId,
  allRuleIds,
};
