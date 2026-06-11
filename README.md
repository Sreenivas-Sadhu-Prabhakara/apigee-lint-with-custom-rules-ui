# apigeelint Rule Studio

Author **custom [apigeelint](https://github.com/apigee/apigeelint) lint rules in a web UI**,
validate them against a sample proxy, and **bundle them into a downloadable CLI** that anyone on
your team can install via **npm** or **Docker** — with your rules baked in, no extra plugin-install
step.

> **▶ Live UI demo:** https://sreenivas-sadhu-prabhakara.github.io/apigee-lint-with-custom-rules-ui/
> — a static, backend-free preview (browse rules, open the editor, see the publish flow). Authoring
> and building need the backend, so clone the repo and run `npm start` for the real thing.

```
┌─────────────┐   writes plugin   ┌──────────────────────┐   npm pack /   ┌──────────────┐
│  Rule Studio │ ───── .js ──────▶ │  apigeelint fork      │ ── docker ──▶ │  Download    │
│  UI + API    │   externalPlugins │  (auto-loads bundled  │    build      │  npm / Docker│
│              │ ◀── validates ─── │   custom rules)       │               │  anyone      │
└─────────────┘    via real CLI    └──────────────────────┘               └──────────────┘
```

## What's here

| Path | What it is |
| ---- | ---------- |
| `cli/` | A fork of the official `apigeelint` CLI. Patched to **auto-load its bundled `externalPlugins/`** so downloads ship with your rules. This is the thing that gets published/downloaded. |
| `server/` | Node/Express backend. Lists rules, generates + validates plugin files, writes them into `cli/externalPlugins/`, and packs/builds the CLI. |
| `ui/` | React (Vite) front end — **Rule Studio**. Browse rules, author new ones, build the download. |
| `dist/` | Output: packed CLI tarballs (`*.tgz`) ready to install. |
| `Dockerfile` | Builds a self-contained CLI image. |
| `docs/` | [Architecture](docs/architecture.md) · [Adding rules](docs/adding-rules.md) · [Downloading the CLI](docs/downloading-the-cli.md) |

## Quick start

```bash
# 1. install everything (cli + server + ui)
npm run setup

# 2a. dev mode — two terminals, hot reload
npm run dev:server      # backend on http://localhost:4600
npm run dev:ui          # UI on http://localhost:5600  (proxies API to 4600)

# 2b. or single-server mode — backend serves the built UI
npm start               # builds the UI, serves everything on http://localhost:4600
```

Open the UI, create a rule, then go to **Download CLI → Build new download**. The resulting
tarball in `dist/` contains your rule.

## The core idea

apigeelint already supports external rules ("plugins") via the `-x <dir>` flag. The problem: when
you install a CLI globally, a relative `-x` path doesn't point at anything useful. This fork fixes
that — it **auto-loads the `externalPlugins/` directory that ships inside the package** (`__dirname`
relative), so a downloaded CLI just *has* your rules. Opt out per-run with `--no-bundled-rules`.

That one change is what turns "a folder of plugins on my laptop" into "a CLI my whole org can
download with the rules already inside."

## Documentation

- **[Adding rules](docs/adding-rules.md)** — how to author a rule in the UI and how it reaches the CLI.
- **[Downloading the CLI](docs/downloading-the-cli.md)** — npm and Docker install for end users.
- **[Architecture](docs/architecture.md)** — how the pieces fit, the plugin contract, and the publish flow.

## Attribution

`cli/` is a fork of [apigee/apigeelint](https://github.com/apigee/apigeelint) (Apache-2.0). This
project keeps that license. See `cli/LICENSE` and `cli/NOTICE`.
