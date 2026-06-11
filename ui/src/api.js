// Thin wrapper around the Rule Studio backend REST API.
// In demo mode (static preview, no backend) GET calls return canned data and
// mutating calls return a friendly "disabled" message.
import { DEMO_MODE, MUTATION_MSG, demo } from "./demo.js";

export { DEMO_MODE, MUTATION_MSG };

const json = (r) => r.json();
const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });

export const api = {
  templates: () => (DEMO_MODE ? Promise.resolve(demo.templates()) : fetch("/api/templates").then(json)),
  rules: () => (DEMO_MODE ? Promise.resolve(demo.rules()) : fetch("/api/rules").then(json)),
  rule: (id) =>
    DEMO_MODE
      ? Promise.resolve(demo.rule(id))
      : fetch("/api/rules/" + encodeURIComponent(id)).then(json),
  validate: (spec) =>
    DEMO_MODE ? Promise.resolve(demo.validate(spec)) : post("/api/rules/validate", spec).then(json),
  save: async (spec) => {
    if (DEMO_MODE) return { status: 403, body: { error: MUTATION_MSG } };
    const r = await post("/api/rules", spec);
    return { status: r.status, body: await r.json() };
  },
  remove: (id) =>
    DEMO_MODE
      ? Promise.resolve({ error: MUTATION_MSG })
      : fetch("/api/rules/" + encodeURIComponent(id), { method: "DELETE" }).then(json),
  cli: () => (DEMO_MODE ? Promise.resolve(demo.cli()) : fetch("/api/cli").then(json)),
  pack: (opts) =>
    DEMO_MODE ? Promise.resolve({ ok: false, error: MUTATION_MSG }) : post("/api/cli/pack", opts).then(json),
  docker: (opts) =>
    DEMO_MODE ? Promise.resolve({ ok: false, error: MUTATION_MSG }) : post("/api/cli/docker", opts).then(json),
};
