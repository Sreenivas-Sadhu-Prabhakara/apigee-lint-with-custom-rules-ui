/*
 * Build & distribute the CLI.
 *
 * "Publish" here means: bump the CLI version, then `npm pack` it into ../dist so
 * the tarball (which now contains every authored custom rule) can be downloaded
 * and installed by anyone. Optionally also build a Docker image.
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { CLI_DIR, listCustomRules } = require("./rules");

const REPO_ROOT = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const PKG_PATH = path.join(CLI_DIR, "package.json");

function ensureDist() {
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
}

function exec(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: 180000, maxBuffer: 32 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        resolve({
          code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
          ok: !err,
          stdout: stdout || "",
          stderr: stderr || (err && err.message) || "",
        });
      },
    );
  });
}

function bumpVersion(type = "patch") {
  const pkg = readPkg();
  const parts = String(pkg.version).split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (type === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  pkg.version = parts.join(".");
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  return pkg.version;
}

function listArtifacts() {
  ensureDist();
  return fs
    .readdirSync(DIST_DIR)
    .filter((f) => f.endsWith(".tgz"))
    .map((f) => {
      const st = fs.statSync(path.join(DIST_DIR, f));
      return { file: f, bytes: st.size, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function cliInfo() {
  const pkg = readPkg();
  return {
    name: pkg.name,
    version: pkg.version,
    bin: Object.keys(pkg.bin || {})[0],
    customRuleCount: listCustomRules().length,
    artifacts: listArtifacts(),
  };
}

/*
 * Pack the CLI into ../dist as a versioned tarball. Optionally bump first so the
 * download is a fresh version that includes newly authored rules.
 */
async function packCli({ bump } = {}) {
  ensureDist();
  let version;
  if (bump && ["patch", "minor", "major"].includes(bump)) {
    version = bumpVersion(bump);
  } else {
    version = readPkg().version;
  }

  const res = await exec("npm", ["pack", "--pack-destination", DIST_DIR], { cwd: CLI_DIR });
  if (!res.ok) {
    return { ok: false, error: "npm pack failed", detail: res.stderr || res.stdout, version };
  }

  // npm prints the produced filename on the last non-empty stdout line.
  const printed = res.stdout.trim().split("\n").filter(Boolean).pop();
  const pkg = readPkg();
  const expected = `${pkg.name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
  const file =
    printed && printed.endsWith(".tgz") && fs.existsSync(path.join(DIST_DIR, printed))
      ? printed
      : expected;

  const full = path.join(DIST_DIR, file);
  const bytes = fs.existsSync(full) ? fs.statSync(full).size : 0;

  return {
    ok: true,
    version,
    file,
    bytes,
    installCommand: `npm install -g ./${file}`,
    customRuleCount: listCustomRules().length,
  };
}

async function buildDocker({ tag } = {}) {
  const pkg = readPkg();
  const imageTag = tag || `${pkg.name.replace(/^@/, "").replace("/", "-")}:${pkg.version}`;
  // Is docker available?
  const probe = await exec("docker", ["--version"]);
  if (!probe.ok) {
    return { ok: false, error: "Docker is not available on this host.", detail: probe.stderr };
  }
  const res = await exec("docker", ["build", "-f", "Dockerfile", "-t", imageTag, "."], {
    cwd: REPO_ROOT,
  });
  return {
    ok: res.ok,
    tag: imageTag,
    error: res.ok ? null : "docker build failed",
    detail: (res.stdout + "\n" + res.stderr).split("\n").slice(-25).join("\n"),
    runCommand: `docker run --rm -v "$PWD:/work" ${imageTag} -s /work/apiproxy -f table.js`,
  };
}

module.exports = { cliInfo, packCli, buildDocker, bumpVersion, listArtifacts, DIST_DIR, REPO_ROOT };
