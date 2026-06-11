/*
 * Rule Studio — guided rule templates.
 *
 * Each template knows which apigeelint entity it targets (nodeType / listener)
 * and how to emit the body of the listener function from a small set of
 * user-supplied parameters. The emitted source follows the apigeelint plugin
 * contract: a listener `function (<entity>, cb)` that calls
 * `<entity>.addMessage({ plugin, message })` on a finding and finishes with
 * `cb(null, flagged)`.
 */

// nodeType -> { listener export name, argument variable name }
const NODE_TYPES = {
  Policy: { listener: "onPolicy", arg: "policy" },
  ProxyEndpoint: { listener: "onProxyEndpoint", arg: "endpoint" },
  TargetEndpoint: { listener: "onTargetEndpoint", arg: "endpoint" },
  Bundle: { listener: "onBundle", arg: "bundle" },
  Step: { listener: "onStep", arg: "step" },
};

// Map a primary nodeType to the conventional apigeelint ruleId prefix.
const NODE_PREFIX = {
  Policy: "PO",
  ProxyEndpoint: "PD",
  TargetEndpoint: "TD",
  Bundle: "BN",
  Step: "ST",
};

const lit = (v) => JSON.stringify(v); // safe JS string/number literal

const TEMPLATES = [
  {
    id: "policy-name-regex",
    label: "Policy name must match a pattern",
    description:
      "Flags any policy whose name does not match a regular expression. Optionally restrict the check to one policy type.",
    nodeType: "Policy",
    params: [
      {
        name: "pattern",
        label: "Regex the name must match",
        type: "string",
        required: true,
        placeholder: "^[A-Z]{2}-[A-Za-z0-9]+$",
      },
      { name: "flags", label: "Regex flags", type: "string", required: false, placeholder: "" },
      {
        name: "policyType",
        label: "Only this policy type (optional)",
        type: "string",
        required: false,
        placeholder: "AssignMessage",
      },
    ],
    build(p) {
      const onlyType = p.policyType ? lit(p.policyType) : "null";
      return `const re = new RegExp(${lit(p.pattern)}, ${lit(p.flags || "")});
  const onlyType = ${onlyType};
  const policyName = policy.getName();
  const policyType = policy.getType();
  if (!onlyType || policyType === onlyType) {
    if (!re.test(policyName)) {
      policy.addMessage({
        plugin,
        message:
          'Policy "' + policyName + '" (type ' + policyType +
          ') does not match the required name pattern ${p.pattern.replace(/'/g, "\\'")}.'
      });
      flagged = true;
    }
  }`;
    },
  },

  {
    id: "policy-display-name-required",
    label: "Policy must have a DisplayName",
    description: "Flags any policy that is missing a non-empty DisplayName element.",
    nodeType: "Policy",
    params: [],
    build() {
      return `const dn = policy.getDisplayName();
  if (!dn || String(dn).trim() === "") {
    policy.addMessage({
      plugin,
      message: 'Policy "' + policy.getName() + '" is missing a DisplayName.'
    });
    flagged = true;
  }`;
    },
  },

  {
    id: "disallow-policy-type",
    label: "Disallow a policy type",
    description:
      "Flags any policy of a given type (for example, forbid JavaScript callouts in production proxies).",
    nodeType: "Policy",
    params: [
      {
        name: "policyType",
        label: "Disallowed policy type",
        type: "string",
        required: true,
        placeholder: "Javascript",
      },
    ],
    build(p) {
      return `const disallowed = ${lit(p.policyType)};
  if (policy.getType() === disallowed) {
    policy.addMessage({
      plugin,
      message: 'Policy type "' + disallowed + '" is not allowed (policy "' + policy.getName() + '").'
    });
    flagged = true;
  }`;
    },
  },

  {
    id: "proxy-basepath-regex",
    label: "Proxy BasePath must match a pattern",
    description:
      "Flags a ProxyEndpoint whose HTTPProxyConnection BasePath does not match a regular expression (e.g. enforce /v{n} versioning).",
    nodeType: "ProxyEndpoint",
    params: [
      {
        name: "pattern",
        label: "Regex the BasePath must match",
        type: "string",
        required: true,
        placeholder: "^/v[0-9]+(/|$)",
      },
      { name: "flags", label: "Regex flags", type: "string", required: false, placeholder: "" },
    ],
    build(p) {
      return `const re = new RegExp(${lit(p.pattern)}, ${lit(p.flags || "")});
  const conn = endpoint.getHTTPProxyConnection && endpoint.getHTTPProxyConnection();
  if (conn) {
    const basePath = conn.getBasePath();
    if (basePath && !re.test(basePath)) {
      endpoint.addMessage({
        plugin,
        message: 'BasePath "' + basePath + '" does not match the required pattern ${p.pattern.replace(/'/g, "\\'")}.'
      });
      flagged = true;
    }
  }`;
    },
  },

  {
    id: "target-https-only",
    label: "Target endpoints must use HTTPS",
    description:
      "Flags a TargetEndpoint whose HTTPTargetConnection URL does not use the https scheme.",
    nodeType: "TargetEndpoint",
    params: [],
    build() {
      return `const conn = endpoint.getHTTPTargetConnection && endpoint.getHTTPTargetConnection();
  if (conn) {
    const url = conn.getURL();
    if (url && !/^https:/i.test(url)) {
      endpoint.addMessage({
        plugin,
        message: 'Target URL "' + url + '" must use HTTPS.'
      });
      flagged = true;
    }
  }`;
    },
  },

  {
    id: "advanced",
    label: "Advanced — write the listener body yourself",
    description:
      "Full control. Choose the entity type, then write the body of the listener. The entity is available as `policy`/`endpoint`/`bundle`/`step`; set `flagged = true` and call `<entity>.addMessage({ plugin, message })` on a finding. `cb(null, flagged)` is called for you.",
    nodeType: "Policy",
    advanced: true,
    params: [
      {
        name: "body",
        label: "Listener body (JavaScript)",
        type: "code",
        required: true,
        placeholder:
          'if (policy.getType() === "Quota") {\n  policy.addMessage({ plugin, message: "Found a Quota policy: " + policy.getName() });\n  flagged = true;\n}',
      },
    ],
    build(p) {
      return `  ${(p.body || "").trim()}`;
    },
  },
];

const byId = (id) => TEMPLATES.find((t) => t.id === id);

module.exports = { TEMPLATES, byId, NODE_TYPES, NODE_PREFIX };
