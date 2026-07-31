import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessControl } from "./components/AccessControl";
import { InstallApp } from "./components/InstallApp";
import { initializeNativeBridge } from "./lib/native";
import "./styles.css";
import "./access-control.css";
import "./workspace-polish.css";

const BRAND_INTRO_DURATION_MS = 2350;

function RootSurfaces() {
  const [introFinished, setIntroFinished] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroFinished(true), BRAND_INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <App />
      {introFinished && <AccessControl />}
      {introFinished && <InstallApp />}
    </>
  );
}

async function bootstrap() {
  try {
    await initializeNativeBridge();
  } catch {
    // A tela de acesso exibirá o estado correto caso o callback nativo falhe.
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RootSurfaces />
    </StrictMode>,
  );
}

void bootstrap();
