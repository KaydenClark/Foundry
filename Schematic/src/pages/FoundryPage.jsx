import { ArrowRight, Play } from "@phosphor-icons/react";

import { CampusAtlas } from "../components/CampusAtlas.jsx";
import { PageHeading } from "../components/PageHeading.jsx";

export function FoundryPage({ navigate }) {
  return (
    <div className="content-page foundry-page">
      <PageHeading
        meta="THE FOUNDRY / CANON + INTENDED END STATE"
        title="A visual blueprint you can walk through."
        description="Use this visual blueprint to explore Foundry Canon and its intended end-state design: native Halls inside each six-floor Factory, replaceable Modules in supporting buildings, typed Sockets between them, and a second Factory showing the same portable system deployed on another host."
        action={(
          <button className="primary-action" type="button" onClick={() => navigate("/workflow")}>
            <Play size={20} weight="fill" aria-hidden="true" /> WATCH A JOB ORDER <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      />
      <CampusAtlas />
    </div>
  );
}
