# Adding linting rules (and getting them into the CLI)

This is the main workflow: author a rule in **Rule Studio**, and have it ship inside the
downloadable CLI. There is no separate "install the plugin" step for end users — the rule travels
*inside* the CLI package.

## The flow at a glance

```
  UI: New rule  ──▶  POST /api/rules  ──▶  validate against sample proxy
                                          │  (real CLI run, isolated temp dir)
                                          ▼
                              write cli/externalPlugins/EX-XXNNN-Name.js
                                          │
  Download CLI tab: Build  ──▶  POST /api/cli/pack  ──▶  bump version + `npm pack`
                                          ▼
                              dist/apigeelint-custom-<version>.tgz
                                          │
                          anyone: npm i -g ./that.tgz  (rule is built in)
```

## 1. Open Rule Studio

```bash
npm start          # http://localhost:4600
# or: npm run dev:server + npm run dev:ui  → http://localhost:5600
```

Go to **+ New rule**.

## 2. Pick a template

The fastest path is a **guided template** — fill in a few fields and the plugin code is generated
for you:

| Template | What it checks | Key params |
| -------- | -------------- | ---------- |
| **Policy name must match a pattern** | Policy names follow a convention | `pattern` (regex), optional `policyType` |
| **Policy must have a DisplayName** | Every policy has a non-empty DisplayName | — |
| **Disallow a policy type** | A policy type is forbidden (e.g. `Javascript`) | `policyType` |
| **Proxy BasePath must match a pattern** | Enforce e.g. `/v{n}` versioning | `pattern` (regex) |
| **Target endpoints must use HTTPS** | Target URLs use `https://` | — |
| **Advanced** | Anything — you write the listener body | `nodeType` + `body` |

### Advanced rules

Choose **Advanced** when no template fits. You pick the **entity** (`nodeType`) and write the body
of the listener. The entity is in scope as `policy` / `endpoint` / `bundle` / `step`. Set
`flagged = true` and call `addMessage` on a finding; `cb(null, flagged)` is called for you.

```js
// nodeType: Policy   (entity is `policy`)
if (policy.getType() === "Quota") {
  policy.addMessage({
    plugin,
    message: 'Quota policy "' + policy.getName() + '" needs review by the API platform team.'
  });
  flagged = true;
}
```

Useful entity methods:

- **Policy** — `getName()`, `getType()`, `getDisplayName()`, `getFileName()`, `getElement()` (DOM node), `getSteps()`
- **ProxyEndpoint** — `getName()`, `getHTTPProxyConnection().getBasePath()`, `getRouteRules()`, `getFlows()`, `getPreFlow()`, `getPostFlow()`
- **TargetEndpoint** — `getName()`, `getHTTPTargetConnection().getURL()`, `getFlows()`
- **Bundle** — `getPolicies()`, `getProxyEndpoints()`, `getTargetEndpoints()`, `getResources()`

## 3. Fill in the metadata

- **Name** — human-readable; also drives the generated filename.
- **Message** — shown when the rule fires (optional; defaults to the name).
- **Severity** — `error` (2), `warning` (1), or `off` (0).

You don't set the rule ID — the backend assigns the next free `EX-<PREFIX><NNN>` (e.g. `EX-PO050`),
where the prefix comes from the entity type (`PO` policy, `PD` proxy, `TD` target, `BN` bundle,
`ST` step). The `EX-` prefix keeps custom rules from colliding with the 90+ built-in rules.

## 4. Validate

Click **Validate**. The backend writes the generated plugin to an isolated temp directory and runs
the **real CLI** against `server/fixtures/sample-proxy`. You get back:

- ✓/✗ whether the rule **loaded and ran** (catches syntax errors and runtime throws),
- how many times it **fired** on the sample proxy,
- the exact **findings**, and
- the **generated plugin source**.

The sample proxy intentionally contains a well-named policy (`AM-SetResponse`) and a badly named
one (`badName`) so naming rules have something to catch.

## 5. Create the rule

**Create rule** re-validates and, only if it passes, writes the plugin to:

```
cli/externalPlugins/EX-<PREFIX><NNN>-<PascalName>.js
```

A broken rule is **never saved**. The file embeds a `@rule-studio:spec` banner so you can reopen
and edit it later from the form (round-trip). Hand-written plugins without that banner show as
**view only**.

At this point the rule is already active for the local CLI:

```bash
node cli/cli.js -s some/apiproxy -f table.js     # your rule runs, no -x needed
node cli/cli.js --list                            # shows it under "external plugins"
```

## 6. Bundle it into a download

A saved rule lives in the working tree. To get it into something installable, go to
**Download CLI → Build new download** (or `POST /api/cli/pack`, or `npm run pack:cli`). That bumps
the version and runs `npm pack`, producing:

```
dist/apigeelint-custom-<version>.tgz
```

This tarball includes `externalPlugins/`, so the rule is **inside the CLI**. See
[Downloading the CLI](docs/downloading-the-cli.md) — or rather
[downloading-the-cli.md](downloading-the-cli.md) — for how others install it.

## Editing & deleting

- **Edit** a Rule-Studio rule from the **Rules** tab → it reloads into the form via the embedded
  spec. Renaming removes the old file so you don't get duplicates.
- **Delete** removes the plugin file. Rebuild the CLI to publish the removal.

## Doing it without the UI (optional)

The UI is a convenience over a plain folder of files. You can also:

1. Drop a hand-written plugin into `cli/externalPlugins/` following the
   [plugin contract](architecture.md#the-apigeelint-plugin-contract).
2. `npm run pack:cli`.

The CLI auto-loads whatever is in that folder.
