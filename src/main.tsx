import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessControl } from "./components/AccessControl";
import { InstallApp } from "./components/InstallApp";
import "./styles.css";
import "./access-control.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <AccessControl />
    <InstallApp />
  </StrictMode>,
);
