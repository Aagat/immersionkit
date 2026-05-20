import React from "react";
import ReactDOM from "react-dom/client";
import "@immersionkit/ui/styles.css";
import "./styles.css";
import { DebugPanelApp } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DebugPanelApp />
  </React.StrictMode>
);
