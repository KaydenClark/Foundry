import { ShieldWarning } from "@phosphor-icons/react";

import { routes } from "../router.js";
import { useRun } from "../store/RunContext.jsx";
import { TransportControls } from "./TransportControls.jsx";

export function AppShell({ path, navigate, children }) {
  const { run } = useRun();

  return (
    <div className={`app-shell status-${run.status}`}>
      <header className="app-header">
        <button className="brand-lockup" type="button" onClick={() => navigate("/")}>
          <span>FND–CANON</span>
          <i aria-hidden="true" />
          <strong>FOUNDRY SCHEMATIC</strong>
        </button>

        <nav className="primary-nav" aria-label="Primary navigation">
          {routes.map((route) => (
            <button
              key={route.path}
              type="button"
              className={path === route.path ? "is-active" : ""}
              aria-current={path === route.path ? "page" : undefined}
              onClick={() => navigate(route.path)}
            >
              {route.label}
            </button>
          ))}
        </nav>

        <div className="safety-lockup">
          <ShieldWarning size={18} weight="duotone" aria-hidden="true" />
          <span>SIMULATION ONLY</span>
          <b>NO ACTUALITY CHANGES</b>
        </div>
      </header>

      <main className="app-main">{children}</main>
      {path !== "/workflow" && <TransportControls />}
    </div>
  );
}
