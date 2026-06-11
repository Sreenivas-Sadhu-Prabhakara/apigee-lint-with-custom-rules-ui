# Downloading & installing the CLI

This is the end-user side: how anyone gets the linter — **with your org's custom rules already
inside it**. Two channels: **npm** and **Docker**.

The custom rules load automatically. Users do **not** pass `-x` or install plugins separately.

---

## Option A — npm (recommended)

### From a packed tarball

Whoever maintains the rules builds a tarball (UI **Download CLI → Build new download**, or
`npm run pack:cli`). It lands in `dist/` as `apigeelint-custom-<version>.tgz`. Share it (artifact
store, internal release, etc.), then:

```bash
npm install -g ./apigeelint-custom-2.85.1.tgz
```

This installs the `apigeelint-custom` command globally. Use it:

```bash
# lint a proxy or sharedflow directory
apigeelint-custom -s path/to/apiproxy -f table.js

# lint a zipped bundle
apigeelint-custom -s path/to/bundle.zip -f stylish.js

# see every rule that's bundled (built-in + your custom EX-* rules)
apigeelint-custom --list

# turn the bundled custom rules off for one run
apigeelint-custom -s path/to/apiproxy --no-bundled-rules
```

### From a private npm registry

If you publish the fork to a private registry (Artifactory, GitHub Packages, npm org):

```bash
# one-time: point the package's scope at your registry, then
npm install -g apigeelint-custom
```

To publish, set a scoped name (e.g. `@your-org/apigeelint-custom`) in `cli/package.json`, then from
`cli/`:

```bash
npm publish            # or: npm publish --registry https://your-registry
```

### Run without installing

```bash
npx ./apigeelint-custom-2.85.1.tgz -s path/to/apiproxy -f table.js
```

---

## Option B — Docker

A self-contained image — no Node needed on the host. Good for CI.

```bash
# build (from the repo root) — also available as the UI "Build Docker image" button
docker build -t apigeelint-custom .

# lint a proxy in the current directory: mount it into /work
docker run --rm -v "$PWD:/work" apigeelint-custom -s /work/apiproxy -f table.js

# list bundled rules
docker run --rm apigeelint-custom --list
```

### In CI (example)

```yaml
# GitHub Actions
- name: Lint Apigee proxy
  run: |
    docker run --rm -v "$PWD:/work" \
      ghcr.io/your-org/apigeelint-custom:latest \
      -s /work/apiproxy -f table.js --maxWarnings 0
```

Push the image to your registry so CI can pull it:

```bash
docker tag apigeelint-custom ghcr.io/your-org/apigeelint-custom:2.85.1
docker push ghcr.io/your-org/apigeelint-custom:2.85.1
```

---

## Useful flags

| Flag | Purpose |
| ---- | ------- |
| `-s, --path <path>` | Proxy/sharedflow directory or `.zip` to lint |
| `-f, --formatter <name>` | `table.js`, `stylish.js`, `json.js`, `compact.js`, `html.js`, `junit.js`, … |
| `--list` | List bundled rules (built-in + custom) and formatters |
| `--no-bundled-rules` | Skip the custom rules bundled in this distribution |
| `-x, --externalPluginsDirectory <dir>` | Load additional rules from another directory too |
| `--maxWarnings <n>` | Exit non-zero past this many warnings (CI gating) |
| `-e, --excluded <ids>` | Comma-separated rule IDs to skip |

## Exit codes

`0` = clean (within `--maxWarnings`); `1` = errors found or warning threshold exceeded. Wire that
into CI to fail a build on lint violations.

## Verifying the custom rules are present

```bash
apigeelint-custom --list | grep "external plugins"
# available external plugins: EX-PO050, EX-PO051, ...
```

If you see your `EX-*` IDs there, the download includes your rules.
