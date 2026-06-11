import React, { useState } from "react";
import { api } from "../api.js";

const sevLabel = (s) => (s === 2 ? "error" : s === 1 ? "warning" : "off");

export default function RulesList({ rules, onNew, onEdit, onChanged }) {
  const [showBuiltin, setShowBuiltin] = useState(false);
  const [busy, setBusy] = useState(null);

  const del = async (ruleId) => {
    if (!confirm(`Delete custom rule ${ruleId}? It will be removed from the CLI bundle.`)) return;
    setBusy(ruleId);
    const res = await api.remove(ruleId);
    setBusy(null);
    if (res && res.error) {
      alert(res.error);
      return;
    }
    onChanged();
  };

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Custom rules</h2>
        <button className="btn primary" onClick={onNew}>
          + New rule
        </button>
      </div>
      <p className="hint">
        These rules live in <code>cli/externalPlugins/</code> and are baked into every CLI
        download. Author one here, then rebuild the CLI on the <b>Download CLI</b> tab.
      </p>

      {rules.custom.length === 0 ? (
        <div className="empty">No custom rules yet. Create your first one.</div>
      ) : (
        <div className="cards">
          {rules.custom.map((r) => (
            <div className="card" key={r.ruleId}>
              <div className="card-top">
                <span className="ruleid">{r.ruleId}</span>
                <span className={`sev sev-${r.severity}`}>{sevLabel(r.severity)}</span>
              </div>
              <div className="card-name">{r.name}</div>
              <div className="card-meta">
                <span className="chip">{r.nodeType}</span>
                {r.editable ? (
                  <span className="chip chip-ok">editable</span>
                ) : (
                  <span className="chip chip-muted">view only</span>
                )}
              </div>
              <div className="card-actions">
                <button className="btn small" onClick={() => onEdit(r.ruleId)}>
                  {r.editable ? "Edit" : "View"}
                </button>
                <button
                  className="btn small danger"
                  disabled={busy === r.ruleId}
                  onClick={() => del(r.ruleId)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-head" style={{ marginTop: 28 }}>
        <h2>Built-in rules ({rules.builtin.length})</h2>
        <button className="btn ghost" onClick={() => setShowBuiltin((v) => !v)}>
          {showBuiltin ? "Hide" : "Show"}
        </button>
      </div>
      {showBuiltin && (
        <div className="builtins">
          {rules.builtin.map((r) => (
            <div className="builtin-row" key={r.ruleId}>
              <span className="ruleid sm">{r.ruleId}</span>
              <span className="builtin-name">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
