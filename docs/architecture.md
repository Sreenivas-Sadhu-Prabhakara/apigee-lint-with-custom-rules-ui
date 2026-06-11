# Architecture

How Rule Studio turns "a rule in a form" into "a rule inside a CLI anyone can download."

## Components

```
apigee-lint/
├── cli/                     fork of apigee/apigeelint (the publishable artifact)
│   ├── cli.js               patched to auto-load bundled externalPlugins/
│   ├── lib/package/plugins/ 90+ built-in rules
│   └── externalPlugins/     ← custom rules land here (shipped in the package)
├── server/                  Express backend (Rule Studio API)
│   ├── index.js             REST API + serves built UI + serves dist/*.tgz
│   ├── lib/templates.js     guided rule templates → listener source
│   ├── lib/generator.js     spec → full plugin module (+ embedded spec banner)
│   ├── lib/rules.js         read/write/list plugin files; assign EX-ids
│   ├── lib/validator.js     run candidate rule through the real CLI
│   ├── lib/publisher.js     version bump + npm pack + docker build
│   └── fixtures/sample-proxy a tiny proxy used to validate rules
├── ui/                      React (Vite) front end
├── dist/                    packed CLI tarballs
└── Dockerfile               self-contained CLI image
```

## The one important patch

The official CLI loads external rules only from a `-x <dir>` path resolved against the **current
working directory**. That's useless for a globally-installed binary. The fork changes `cli.js` to
default the external-plugins directory to its **own** bundled folder, resolved from `__dirname`:

```js
const BUNDLED_EXTERNAL_PLUGINS_DIR = path.join(__dirname, "externalPlugins");
if (!options.externalPluginsDirectory &&
    options.bundledRules !== false &&
    fs.existsSync(BUNDLED_EXTERNAL_PLUGINS_DIR)) {
  options.externalPluginsDirectory = BUNDLED_EXTERNAL_PLUGINS_DIR;
}
```

Consequences:

- A downloaded CLI loads its bundled custom rules **with no flags**.
- `--no-bundled-rules` opts out for a single run.
- An explicit `-x` still works and takes precedence (load *other* rules too).
- `package.json` has a `files` whitelist that includes `externalPlugins/`, so `npm pack`/`npm
  publish` ship the rules.

## The apigeelint plugin contract

Each rule is a Node module exporting a `plugin` descriptor and one or more `on<Entity>` listeners.

```js
const plugin = {
  ruleId: "EX-PO050",          // unique across all rules
  name: "…",
  message: "…",                 // default message
  fatal: false,
  severity: 1,                  // 0 off · 1 warning · 2 error
  nodeType: "Policy",
  enabled: true,
};

const onPolicy = function (policy, cb) {
  let flagged = false;
  // …inspect the entity; on a finding:
  //   policy.addMessage({ plugin, message: "…" }); flagged = true;
  if (typeof cb === "function") cb(null, flagged);
};

module.exports = { plugin, onPolicy };
```

The linter dispatches by entity type — export `onBundle`, `onStep`, `onCondition`,
`onProxyEndpoint`, `onTargetEndpoint`, `onResource`, `onPolicy`, `onFaultRule`,
`onDefaultFaultRule`. The generator (`server/lib/generator.js`) picks the listener from the rule's
`nodeType`.

### Round-trip editing

Generated files carry a machine-readable banner:

```js
/* @rule-studio:spec
{ "ruleId": "EX-PO050", "templateId": "disallow-policy-type", "params": { … }, … }
*/
```

`rules.js` parses it back out so the UI can reopen a rule in the form. Files without the banner
(hand-written or the upstream examples `EX-PO001`, `EX-PO007`) are listed as **view only**.

## Request flow

### Authoring & validating

```
UI ──POST /api/rules/validate──▶ generator.generatePlugin(spec)
                                 ▼
                       write to a temp dir
                                 ▼
        execFile: node cli/cli.js -s fixtures/sample-proxy -x <tmp> -f json.js --no-bundled-rules
                                 ▼
        parse JSON report → { ok, firedCount, findings, code }
```

Validation runs the **real CLI in an isolated temp dir** (only the candidate rule via `-x`, with
`--no-bundled-rules` so the already-saved rules don't add noise). Syntax errors and runtime throws
surface as a failed load.

### Saving

`POST /api/rules` re-validates, then `rules.saveRule()` assigns an ID (if new), writes
`cli/externalPlugins/EX-…js`, and deletes any stale file from a rename. **A rule that fails
validation is never written.**

### Publishing for download

```
UI ──POST /api/cli/pack {bump}──▶ publisher.bumpVersion()  (edit cli/package.json)
                                  ▼
                          npm pack --pack-destination dist/
                                  ▼
                    dist/apigeelint-custom-<version>.tgz   (contains externalPlugins/)
```

Docker: `POST /api/cli/docker` runs `docker build` with the root `Dockerfile`, whose build context
copies `cli/` (including `externalPlugins/`) into the image.

## API reference

| Method & path | Purpose |
| ------------- | ------- |
| `GET /api/health` | Liveness |
| `GET /api/templates` | Guided template catalog + param schemas |
| `GET /api/rules` | `{ custom: […], builtin: […] }` |
| `GET /api/rules/:ruleId` | One custom rule incl. source + spec |
| `POST /api/rules/validate` | Validate a spec without saving |
| `POST /api/rules` | Validate + save (422 if invalid) |
| `DELETE /api/rules/:ruleId` | Remove a custom rule |
| `GET /api/cli` | CLI name/version, custom-rule count, artifacts |
| `POST /api/cli/pack` | Bump + `npm pack` → tarball in `dist/` |
| `POST /api/cli/docker` | Build the Docker image |
| `GET /download/:file` | Download a packed tarball |

## Design choices

- **Rules live as files in `cli/externalPlugins/`, not in a database.** The folder *is* the source
  of truth; packing it is the whole "publish" step. Simple, diffable, git-friendly.
- **Validation uses the real CLI, not a reimplementation.** What you validate is exactly what runs
  after download.
- **The fork stays a thin patch over upstream.** Only `cli.js` and `package.json` change, so pulling
  upstream updates is straightforward.

## Keeping up with upstream

```bash
cd cli
git remote add upstream https://github.com/apigee/apigeelint   # once
git fetch upstream && git merge upstream/master
# re-apply the two edits (cli.js auto-load + package.json branding) if they conflict
```
