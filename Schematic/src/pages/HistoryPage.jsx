import { Repeat, Trash } from "@phosphor-icons/react";

import { PageHeading } from "../components/PageHeading.jsx";
import { RunInspector } from "../components/RunInspector.jsx";
import { useRun } from "../store/RunContext.jsx";

export function HistoryPage() {
  const { run, history, replay, clearHistory } = useRun();

  return (
    <div className="content-page history-page">
      <PageHeading
        meta="RUN HISTORY / LOCAL PROJECTION"
        title="Every visible move has a trace."
        description="Completed and reset runs are stored locally in this browser. History is optional projection data and never changes workflow semantics."
        action={<button className="secondary-action" type="button" onClick={clearHistory} disabled={!history.length}><Trash size={18} aria-hidden="true" /> CLEAR HISTORY</button>}
      />

      <section className="history-layout">
        <div className="history-ledger">
          <header><span>ARCHIVED RUNS</span><small>{history.length} LOCAL</small></header>
          {history.length === 0 ? (
            <div className="empty-state"><strong>NO ARCHIVED RUNS</strong><p>Advance or complete the active run, then Reset. The previous trace will appear here.</p></div>
          ) : history.map((entry) => (
            <article key={entry.id}>
              <div><small>RUN</small><strong>{entry.id}</strong></div>
              <div><small>STATE</small><strong>{entry.status.toUpperCase()}</strong></div>
              <div><small>EVENTS</small><strong>{entry.trace.length}</strong></div>
              <div><small>TRIPS</small><strong>{entry.tripCount}</strong></div>
              <button type="button" onClick={() => replay(entry)}><Repeat size={16} aria-hidden="true" /> REPLAY</button>
            </article>
          ))}
        </div>
        <div className="active-trace">
          <header><span>ACTIVE TRACE</span><small>{run.id}</small></header>
          <RunInspector traceLimit={14} />
        </div>
      </section>
    </div>
  );
}
