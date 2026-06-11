import React, { useMemo, useState } from "react";
import { api } from "../api.js";

const NODE_TYPES = ["Policy", "ProxyEndpoint", "TargetEndpoint", "Bundle", "Step"];

function defaultsFor(tmpl) {
  const p = {};
  (tmpl?.params || []).forEach((f) => (p[f.name] = ""));
  return p;
}

export default function RuleEditor({ templates, editing, onSaved, onCancel }) {
  const readOnly = editing && editing.editable === false;

  const initialTemplate =
    (editing && editing.templateId) || (templates[0] && templates[0].id) || "";

  const [templateId, setTemplateId] = useState(initialTemplate);
  const tmpl = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  const [name, setName] = useState(editing?.name || "");
  const [message, setMessage] = useState(editing?.message || "");
  const [severity, setSeverity] = useState(editing ? Number(editing.severity) : 1);
  const [nodeType, setNodeType] = useState(editing?.nodeType || "Policy");
  const [params, setParams] = useState(editing?.params || defaultsFor(tmpl));

  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const onTemplateChange = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setParams(defaultsFor(t));
    setValidation(null);
    if (t && !t.advanced) setNodeType(t.nodeType);
  };

  const setParam = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  const buildSpec = () => ({
    ruleId: editing && editing.editable ? editing.ruleId : undefined,
    name,
    message,
    severity: Number(severity),
    templateId,
    params,
    nodeType: tmpl?.advanced ? nodeType : undefined,
  });

  const doValidate = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      setValidation(await api.validate(buildSpec()));
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const { status, body } = await api.save(buildSpec());
      if (status >= 200 && status < 300) {
        onSaved();
      } else {
        setSaveError(body.error || "Save failed");
        if (body.validation) setValidation(body.validation);
      }
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) {
    return (
      <div className="stack">
        <div className="section-head">
          <h2>{editing.ruleId} — view only</h2>
          <button className="btn ghost" onClick={onCancel}>
            ← Back
          </button>
        </div>
        <p className="hint">
          This rule was not authored in Rule Studio, so it cannot be edited through the form. You
          can still read its source. Edit the file directly in{" "}
          <code>cli/externalPlugins/</code> if needed.
        </p>
        <pre className="code">{editing.source}</pre>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-form">
        <div className="section-head">
          <h2>{editing ? `Edit ${editing.ruleId}` : "New rule"}</h2>
          <button className="btn ghost" onClick={onCancel}>
            ← Back
          </button>
        </div>

        <label className="field">
          <span>Rule template</span>
          <select value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {tmpl && <small className="desc">{tmpl.description}</small>}
        </label>

        <label className="field">
          <span>Name</span>
          <input
            value={name}
            placeholder="e.g. AssignMessage policies must be named AM-*"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Message (shown when the rule fires)</span>
          <input
            value={message}
            placeholder="Optional — defaults to the rule name"
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>

        <div className="row">
          <label className="field">
            <span>Severity</span>
            <select value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              <option value={2}>error</option>
              <option value={1}>warning</option>
              <option value={0}>off</option>
            </select>
          </label>

          {tmpl?.advanced && (
            <label className="field">
              <span>Entity (nodeType)</span>
              <select value={nodeType} onChange={(e) => setNodeType(e.target.value)}>
                {NODE_TYPES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {(tmpl?.params || []).map((f) => (
          <label className="field" key={f.name}>
            <span>
              {f.label} {f.required ? <em className="req">*</em> : null}
            </span>
            {f.type === "code" ? (
              <textarea
                rows={8}
                className="mono"
                value={params[f.name] || ""}
                placeholder={f.placeholder}
                onChange={(e) => setParam(f.name, e.target.value)}
              />
            ) : (
              <input
                value={params[f.name] || ""}
                placeholder={f.placeholder}
                onChange={(e) => setParam(f.name, e.target.value)}
              />
            )}
          </label>
        ))}

        <div className="actions">
          <button className="btn" onClick={doValidate} disabled={busy || !name}>
            {busy ? "Running…" : "Validate"}
          </button>
          <button className="btn primary" onClick={doSave} disabled={busy || !name}>
            {editing ? "Save changes" : "Create rule"}
          </button>
        </div>
        {saveError && <div className="alert error">{saveError}</div>}
      </div>

      <div className="editor-preview">
        <h3>Validation</h3>
        {!validation ? (
          <div className="empty sm">
            Click <b>Validate</b> to run this rule against the sample proxy.
          </div>
        ) : validation.ok ? (
          <div className={`alert ${validation.firedCount ? "ok" : "warn"}`}>
            ✓ Rule loaded and ran cleanly.{" "}
            {validation.firedCount
              ? `Fired ${validation.firedCount} time(s) on the sample proxy.`
              : "It did not fire on the sample proxy (that may be expected)."}
          </div>
        ) : (
          <div className="alert error">
            ✗ {validation.error}
            {validation.detail && <pre className="code small">{validation.detail}</pre>}
          </div>
        )}

        {validation?.findings?.length > 0 && (
          <ul className="findings">
            {validation.findings.map((f, i) => (
              <li key={i}>
                <code>{f.source}</code>
                {f.line ? `:${f.line}` : ""} — {f.message}
              </li>
            ))}
          </ul>
        )}

        {validation?.code && (
          <>
            <h3>Generated plugin</h3>
            <pre className="code">{validation.code}</pre>
          </>
        )}
      </div>
    </div>
  );
}
