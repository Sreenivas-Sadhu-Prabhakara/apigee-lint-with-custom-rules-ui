import React, { useEffect, useState, useCallback } from "react";
import { api, DEMO_MODE } from "./api.js";
import RulesList from "./components/RulesList.jsx";
import RuleEditor from "./components/RuleEditor.jsx";
import Publish from "./components/Publish.jsx";

export default function App() {
  const [view, setView] = useState("rules"); // rules | editor | publish
  const [templates, setTemplates] = useState([]);
  const [rules, setRules] = useState({ custom: [], builtin: [] });
  const [editing, setEditing] = useState(null); // rule spec being edited, or null for new
  const [cli, setCli] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [t, r, c] = await Promise.all([api.templates(), api.rules(), api.cli()]);
    setTemplates(t);
    setRules(r);
    setCli(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openNew = () => {
    setEditing(null);
    setView("editor");
  };
  const openEdit = async (ruleId) => {
    const full = await api.rule(ruleId);
    setEditing(full);
    setView("editor");
  };
  const onSaved = async () => {
    await refresh();
    setView("rules");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          <div>
            <div className="title">apigeelint Rule Studio</div>
            <div className="subtitle">
              author custom lint rules → bundle them into the downloadable CLI
            </div>
          </div>
        </div>
        <nav className="tabs">
          <button className={view === "rules" ? "tab on" : "tab"} onClick={() => setView("rules")}>
            Rules{" "}
            <span className="count">{rules.custom.length}</span>
          </button>
          <button
            className={view === "editor" ? "tab on" : "tab"}
            onClick={openNew}
          >
            + New rule
          </button>
          <button
            className={view === "publish" ? "tab on" : "tab"}
            onClick={() => setView("publish")}
          >
            Download CLI
          </button>
        </nav>
      </header>

      {DEMO_MODE && (
        <div className="demo-banner">
          <b>Demo preview.</b> This static site has no backend, so authoring and building are
          disabled. Browse the UI freely — then{" "}
          <a
            href="https://github.com/Sreenivas-Sadhu-Prabhakara/apigee-lint-with-custom-rules-ui"
            target="_blank"
            rel="noreferrer"
          >
            clone the repo
          </a>{" "}
          and run <code>npm start</code> to author rules and build the CLI for real.
        </div>
      )}

      <main className="content">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : view === "rules" ? (
          <RulesList rules={rules} onNew={openNew} onEdit={openEdit} onChanged={refresh} />
        ) : view === "editor" ? (
          <RuleEditor
            templates={templates}
            editing={editing}
            existingIds={rules.custom.map((r) => r.ruleId)}
            onSaved={onSaved}
            onCancel={() => setView("rules")}
          />
        ) : (
          <Publish cli={cli} onChanged={refresh} />
        )}
      </main>

      <footer className="footer">
        {cli ? (
          <span>
            CLI <code>{cli.name}</code> v{cli.version} · {cli.customRuleCount} custom rule
            {cli.customRuleCount === 1 ? "" : "s"} bundled
          </span>
        ) : null}
      </footer>
    </div>
  );
}
