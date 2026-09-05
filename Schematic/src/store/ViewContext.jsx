import { createContext, useContext, useMemo, useState } from "react";

import {
  applyAtlasPreset,
  createAtlasView,
  resetAtlasView,
  rotateAtlas,
  selectAtlas,
  updateAtlasView,
} from "../view/atlasView.js";

const ViewContext = createContext(null);

export function ViewProvider({ children }) {
  const [view, setView] = useState(createAtlasView);
  const value = useMemo(() => ({
    view,
    updateView: (patch) => setView((current) => updateAtlasView(current, patch)),
    rotateView: (rotation) => setView((current) => rotateAtlas(current, rotation)),
    selectView: (selection) => setView((current) => selectAtlas(current, selection)),
    applyPreset: (preset) => setView((current) => applyAtlasPreset(current, preset)),
    resetView: () => setView(resetAtlasView()),
  }), [view]);

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useView() {
  const context = useContext(ViewContext);
  if (!context) throw new Error("useView must be used inside ViewProvider.");
  return context;
}
