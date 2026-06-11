/*
 * Demo mode — lets the UI be browsed as a static site (e.g. GitHub Pages) with
 * no backend. GET data is canned; the Validate preview is generated client-side
 * so it reflects your inputs; mutating actions are disabled with a message.
 *
 * Active when built with VITE_DEMO=1 or when served from *.github.io.
 */
export const DEMO_MODE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_DEMO === "1") ||
  (typeof location !== "undefined" && /github\.io$/.test(location.hostname));

export const MUTATION_MSG =
  "Demo mode — this is a static preview with no backend, so authoring/building is disabled. Clone the repo and run it locally (npm start) to author rules and build the CLI.";

const TEMPLATES = [
  {
    id: "policy-name-regex",
    label: "Policy name must match a pattern",
    description:
      "Flags any policy whose name does not match a regular expression. Optionally restrict the check to one policy type.",
    nodeType: "Policy",
    advanced: false,
    params: [
      { name: "pattern", label: "Regex the name must match", type: "string", required: true, placeholder: "^[A-Z]{2}-[A-Za-z0-9]+$" },
      { name: "flags", label: "Regex flags", type: "string", required: false, placeholder: "" },
      { name: "policyType", label: "Only this policy type (optional)", type: "string", required: false, placeholder: "AssignMessage" },
    ],
  },
  { id: "policy-display-name-required", label: "Policy must have a DisplayName", description: "Flags any policy that is missing a non-empty DisplayName element.", nodeType: "Policy", advanced: false, params: [] },
  {
    id: "disallow-policy-type",
    label: "Disallow a policy type",
    description: "Flags any policy of a given type (for example, forbid JavaScript callouts in production proxies).",
    nodeType: "Policy",
    advanced: false,
    params: [{ name: "policyType", label: "Disallowed policy type", type: "string", required: true, placeholder: "Javascript" }],
  },
  {
    id: "proxy-basepath-regex",
    label: "Proxy BasePath must match a pattern",
    description: "Flags a ProxyEndpoint whose HTTPProxyConnection BasePath does not match a regular expression (e.g. enforce /v{n} versioning).",
    nodeType: "ProxyEndpoint",
    advanced: false,
    params: [
      { name: "pattern", label: "Regex the BasePath must match", type: "string", required: true, placeholder: "^/v[0-9]+(/|$)" },
      { name: "flags", label: "Regex flags", type: "string", required: false, placeholder: "" },
    ],
  },
  { id: "target-https-only", label: "Target endpoints must use HTTPS", description: "Flags a TargetEndpoint whose HTTPTargetConnection URL does not use the https scheme.", nodeType: "TargetEndpoint", advanced: false, params: [] },
  {
    id: "advanced",
    label: "Advanced — write the listener body yourself",
    description:
      "Full control. Choose the entity type, then write the body of the listener. The entity is available as `policy`/`endpoint`/`bundle`/`step`; set `flagged = true` and call `<entity>.addMessage({ plugin, message })` on a finding.",
    nodeType: "Policy",
    advanced: true,
    params: [
      { name: "body", label: "Listener body (JavaScript)", type: "code", required: true, placeholder: 'if (policy.getType() === "Quota") {\n  policy.addMessage({ plugin, message: "Found a Quota policy: " + policy.getName() });\n  flagged = true;\n}' },
    ],
  },
];

const CUSTOM = [
  { ruleId: "EX-PO001", name: "Check for policies while streaming", severity: 1, nodeType: "Bundle", enabled: true, editable: false, file: "EX-PO001-CheckForPoliciesWhileStreaming.js" },
  { ruleId: "EX-PO007", name: "Policy Naming Conventions — type indication", severity: 1, nodeType: "Policy", enabled: true, editable: false, file: "EX-PO007-NamingConventions.js" },
  {
    ruleId: "EX-PO050", name: "Disallow JavaScript policies", message: "JavaScript callouts are not permitted", severity: 2, nodeType: "Policy", enabled: true, editable: true,
    templateId: "disallow-policy-type", params: { policyType: "Javascript" }, file: "EX-PO050-DisallowJavaScriptPolicies.js",
  },
];

const BUILTIN = [
  ["BN001", "Bundle Structure", "Bundle"], ["BN003", "CompositeLimit", "Bundle"], ["BN005", "Unattached resources", "Bundle"],
  ["CC001", "Condition Structure", "Condition"], ["FL001", "Flow names should be unique", "Flow"], ["PD001", "Reserved words as ProxyEndpoint names", "ProxyEndpoint"],
  ["PO007", "Policy Naming Conventions", "Policy"], ["PO020", "Use of WSDL", "Policy"], ["PO025", "Quota policy variables", "Policy"],
  ["ST001", "Empty Step", "Step"], ["TD001", "Encrypted target server credentials", "TargetEndpoint"], ["TD002", "TargetEndpoint health monitor", "TargetEndpoint"],
].map(([ruleId, name, nodeType]) => ({ ruleId, name, nodeType, severity: 1, builtin: true }));

// --- a tiny client-side generator, mirroring server/lib/generator.js, just for
// the live preview in demo mode -------------------------------------------------
function pascal(s) {
  return (String(s || "Rule").replace(/[^a-zA-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join("") || "Rule").slice(0, 48);
}
const NODE = {
  Policy: { listener: "onPolicy", arg: "policy" },
  ProxyEndpoint: { listener: "onProxyEndpoint", arg: "endpoint" },
  TargetEndpoint: { listener: "onTargetEndpoint", arg: "endpoint" },
  Bundle: { listener: "onBundle", arg: "bundle" },
  Step: { listener: "onStep", arg: "step" },
};
function body(spec) {
  const p = spec.params || {};
  switch (spec.templateId) {
    case "policy-name-regex":
      return `const re = new RegExp(${JSON.stringify(p.pattern || "")}, ${JSON.stringify(p.flags || "")});\n  const onlyType = ${p.policyType ? JSON.stringify(p.policyType) : "null"};\n  const policyName = policy.getName();\n  if ((!onlyType || policy.getType() === onlyType) && !re.test(policyName)) {\n    policy.addMessage({ plugin, message: 'Policy "' + policyName + '" does not match the required pattern.' });\n    flagged = true;\n  }`;
    case "policy-display-name-required":
      return `const dn = policy.getDisplayName();\n  if (!dn || String(dn).trim() === "") {\n    policy.addMessage({ plugin, message: 'Policy "' + policy.getName() + '" is missing a DisplayName.' });\n    flagged = true;\n  }`;
    case "disallow-policy-type":
      return `if (policy.getType() === ${JSON.stringify(p.policyType || "")}) {\n    policy.addMessage({ plugin, message: 'Policy type ${JSON.stringify(p.policyType || "")} is not allowed (' + policy.getName() + ').' });\n    flagged = true;\n  }`;
    case "proxy-basepath-regex":
      return `const re = new RegExp(${JSON.stringify(p.pattern || "")}, ${JSON.stringify(p.flags || "")});\n  const conn = endpoint.getHTTPProxyConnection && endpoint.getHTTPProxyConnection();\n  if (conn && conn.getBasePath() && !re.test(conn.getBasePath())) {\n    endpoint.addMessage({ plugin, message: 'BasePath does not match the required pattern.' });\n    flagged = true;\n  }`;
    case "target-https-only":
      return `const conn = endpoint.getHTTPTargetConnection && endpoint.getHTTPTargetConnection();\n  if (conn && conn.getURL() && !/^https:/i.test(conn.getURL())) {\n    endpoint.addMessage({ plugin, message: 'Target URL must use HTTPS.' });\n    flagged = true;\n  }`;
    default:
      return `  ${(p.body || "// your logic").trim()}`;
  }
}
function generate(spec) {
  const tmpl = TEMPLATES.find((t) => t.id === spec.templateId) || TEMPLATES[0];
  const nodeType = tmpl.advanced ? spec.nodeType || "Policy" : tmpl.nodeType;
  const meta = NODE[nodeType] || NODE.Policy;
  const ruleId = spec.ruleId || "EX-PO0NN";
  return `/* Generated by apigeelint Rule Studio (preview). Apache-2.0. */
const plugin = {
  ruleId: ${JSON.stringify(ruleId)},
  name: ${JSON.stringify(spec.name || "")},
  message: ${JSON.stringify(spec.message || spec.name || "")},
  fatal: false,
  severity: ${[0, 1, 2].includes(Number(spec.severity)) ? Number(spec.severity) : 1},
  nodeType: ${JSON.stringify(nodeType)},
  enabled: true,
};

const ${meta.listener} = function (${meta.arg}, cb) {
  let flagged = false;
  ${body(spec)}
  if (typeof cb === "function") cb(null, flagged);
};

module.exports = { plugin, ${meta.listener} };
`;
}

export const demo = {
  templates: () => TEMPLATES,
  rules: () => ({ custom: CUSTOM.map((r) => ({ ...r })), builtin: BUILTIN }),
  rule: (id) => {
    const r = CUSTOM.find((x) => x.ruleId === id) || CUSTOM[2];
    return { ...r, source: generate({ ...r }) };
  },
  validate: (spec) => ({
    ok: true,
    stage: "execute",
    ruleId: spec.ruleId || "EX-PO0NN",
    firedCount: 1,
    findings: [{ source: "badName.xml", message: "(demo) example finding for this rule on the sample proxy" }],
    code: generate(spec),
  }),
  cli: () => ({ name: "apigeelint-custom", version: "2.85.1", bin: "apigeelint-custom", customRuleCount: CUSTOM.length, artifacts: [] }),
};
