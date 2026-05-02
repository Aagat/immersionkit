import React from "react";
import ReactDOM from "react-dom/client";
import "@immersionkit/ui/styles.css";
import { PopupApp } from "./App";
import "../styles/theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
