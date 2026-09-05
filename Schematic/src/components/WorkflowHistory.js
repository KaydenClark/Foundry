import { Repeat, Trash } from "@phosphor-icons/react";
import { createElement as h } from "react";

import { deriveWorkflowHistoryPresentation } from "../domain/workflowPresentation.js";

export function WorkflowHistory({ history, replay, clearHistory }) {
  const presentation = deriveWorkflowHistoryPresentation(history, { replay, clearHistory });

  return h(
    "section",
    { className: "workflow-history", "aria-label": "Local Workflow history" },
    h(
      "header",
      null,
      h(
        "div",
        null,
        h("span", null, "RUN HISTORY / LOCAL PROJECTION"),
        h("strong", null, "Replay a frozen trace without changing workflow semantics."),
      ),
      h(
        "button",
        { type: "button", onClick: presentation.clear, disabled: !presentation.canClear },
        h(Trash, { "aria-hidden": "true" }),
        " CLEAR HISTORY",
      ),
    ),
    presentation.entries.length === 0
      ? h("p", null, "NO ARCHIVED RUNS · Complete or reset the active run to preserve its local trace here.")
      : h(
        "div",
        { className: "workflow-history-list" },
        ...presentation.entries.map((item) => h(
          "article",
          { key: item.id },
          h("span", null, item.statusLabel),
          h("strong", null, item.id),
          h("small", null, `${item.eventCount} EVENTS · ${item.tripCount} TRIPS`),
          h(
            "button",
            { type: "button", onClick: item.replay },
            h(Repeat, { "aria-hidden": "true" }),
            " REPLAY",
          ),
        )),
      ),
  );
}
