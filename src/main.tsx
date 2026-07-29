import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { InstallApp } from "./components/InstallApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <InstallApp />
  </StrictMode>,
);
