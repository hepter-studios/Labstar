import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessControl } from "./components/AccessControl";
import { InstallApp } from "./components/InstallApp";
import { initializeNativeBridge } from "./lib/native";
import "./styles.css";
import "./access-control.css";

async function bootstrap() {
  try {
    await initializeNativeBridge();
  } catch {
    // A tela de acesso exibirá o estado correto caso o callback nativo falhe.
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
      <AccessControl />
      <InstallApp />
    </StrictMode>,
  );
}

void bootstrap();
