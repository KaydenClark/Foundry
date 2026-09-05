import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import { RunProvider } from "./store/RunContext.jsx";
import { ViewProvider } from "./store/ViewContext.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RunProvider>
      <ViewProvider>
        <App />
      </ViewProvider>
    </RunProvider>
  </StrictMode>,
);
