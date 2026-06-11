/*
 * Validate a candidate rule by actually running it through the real CLI.
 *
 * The generated plugin is written to an isolated temp directory and the CLI is
 * invoked with `-x <tempdir>` against the sample proxy. This catches syntax
 * errors and runtime throws, and reports whether the rule produced any findings
 * on the sample bundle.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { generatePlugin, fileBaseName } = require("./generator");
const { CLI_DIR } = require("./rules");

const FIXTURE = path.resolve(__dirname, "../fixtures/sample-proxy");
const CLI = path.join(CLI_DIR, "cli.js");

function run(args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd: CLI_DIR, timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
          stdout: stdout || "",
          stderr: stderr || (err && err.message) || "",
        });
      },
    );
  });
}

// Pull the first JSON array out of CLI stdout (the json.js formatter output).
function parseReport(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function validateSpec(spec) {
  // For unsaved (new) rules there's no ruleId yet. Generate with a temporary id
  // so the plugin descriptor — and therefore the findings it emits — carry an id
  // we can match on. Otherwise the preview would always report "did not fire".
  // The id MUST satisfy the loader's pattern ^EX-[A-Z]{2}[0-9]{3}$ or the file is
  // silently rejected from the external plugins directory.
  const targetId = spec.ruleId || "EX-TM000";
  const genSpec = { ...spec, ruleId: targetId };

  let gen;
  try {
    gen = generatePlugin(genSpec);
  } catch (e) {
    return { ok: false, stage: "generate", error: e.message, code: gen ? gen.code : null };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-studio-"));
  const fileName = `${fileBaseName(genSpec)}.js`;
  fs.writeFileSync(path.join(tmpDir, fileName), gen.code, "utf8");

  try {
    const res = await run([
      "-s",
      FIXTURE,
      "-x",
      tmpDir,
      "-f",
      "json.js",
      "--no-bundled-rules",
    ]);
    const report = parseReport(res.stdout);

    if (!report) {
      // No parseable report => the plugin almost certainly failed to load/ran.
      return {
        ok: false,
        stage: "execute",
        error:
          "The rule did not run cleanly. Likely a syntax error or runtime exception in the rule code.",
        detail: (res.stderr || res.stdout || "").split("\n").slice(0, 25).join("\n"),
        code: gen.code,
      };
    }

    const findings = [];
    for (const fileReport of report) {
      for (const msg of fileReport.messages || []) {
        if (msg.ruleId === targetId) {
          findings.push({
            source: fileReport.filePath ? path.basename(fileReport.filePath) : undefined,
            line: msg.line,
            column: msg.column,
            severity: msg.severity,
            message: msg.message,
          });
        }
      }
    }

    return {
      ok: true,
      stage: "execute",
      ruleId: targetId,
      firedCount: findings.length,
      findings,
      code: gen.code,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

module.exports = { validateSpec, FIXTURE };
