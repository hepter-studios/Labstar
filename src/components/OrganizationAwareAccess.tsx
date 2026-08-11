import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getCurrentAccessIdentity,
  getPendingInviteToken,
  secureSignOut,
  subscribeToAccessChanges,
} from "../lib/access";
import { supabaseClient } from "../lib/supabase";
import { AccessControl } from "./AccessControl";
import { OrganizationEntryGate } from "./OrganizationEntryGate";

type AccessRoute = "resolving" | "standard" | "organization";

function OrganizationEntryWithAccountBack({ children }: { children: ReactNode }) {
  const [signingOut, setSigningOut] = useState(false);
  const [entryVisible, setEntryVisible] = useState(false);

  useEffect(() => {
    const sync = () => setEntryVisible(Boolean(document.querySelector(".organization-entry-screen")));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function switchAccount() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await secureSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      {entryVisible && (
        <button
          type="button"
          aria-label="Voltar e entrar com outra conta"
          title="Entrar com outra conta"
          disabled={signingOut}
          onClick={() => void switchAccount()}
          style={{
            position: "fixed",
            top: "clamp(18px, 3vw, 30px)",
            left: "clamp(18px, 3vw, 30px)",
            zIndex: 33020,
            minHeight: 38,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "0 13px",
            border: "1px solid rgba(180, 199, 238, .14)",
            borderRadius: 11,
            color: "#c9d3e6",
            background: "rgba(5, 9, 17, .58)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 12px 34px rgba(0,0,0,.22)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            font: "700 11px/1 Inter, ui-sans-serif, system-ui, sans-serif",
            cursor: signingOut ? "default" : "pointer",
            opacity: signingOut ? .55 : 1,
          }}
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          <span>{signingOut ? "Saindo…" : "Trocar conta"}</span>
        </button>
      )}
      <OrganizationEntryGate>{children}</OrganizationEntryGate>
    </>
  );
}

/**
 * Account authentication and organization authorization are different layers.
 *
 * The legacy AccessControl still owns Hepter Studios membership, invitations,
 * pending/suspended states and its protected workspace. A valid Supabase account
 * that simply does not belong to that legacy team must not be rejected globally:
 * it is routed into the organization entry flow, where it can create or open an
 * organization that is actually associated with its auth identity.
 */
export function OrganizationAwareAccess({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<AccessRoute>("resolving");

  const resolveRoute = useCallback(async () => {
    try {
      if (!supabaseClient) {
        setRoute("standard");
        return;
      }

      const { data, error } = await supabaseClient.auth.getSession();
      if (error || !data.session) {
        setRoute("standard");
        return;
      }

      // Invitation acceptance remains under AccessControl because it is what can
      // legitimately grant access to an existing organization/team.
      if (getPendingInviteToken()) {
        setRoute("standard");
        return;
      }

      const identity = await getCurrentAccessIdentity();
      if (identity?.authorization === "unauthorized") {
        setRoute("organization");
        return;
      }

      setRoute("standard");
    } catch {
      // Network/backend failures still use the established AccessControl error
      // treatment instead of accidentally bypassing an access decision.
      setRoute("standard");
    }
  }, []);

  useEffect(() => {
    void resolveRoute();
    const unsubscribe = subscribeToAccessChanges((event) => {
      if (event === "TOKEN_REFRESHED") return;
      setRoute("resolving");
      void resolveRoute();
    });
    return unsubscribe;
  }, [resolveRoute]);

  if (route === "resolving") {
    return <main className="organization-access-resolving" aria-label="Preparando Labstar" />;
  }

  if (route === "organization") {
    return <OrganizationEntryWithAccountBack>{children}</OrganizationEntryWithAccountBack>;
  }

  return (
    <AccessControl>
      <OrganizationEntryWithAccountBack>{children}</OrganizationEntryWithAccountBack>
    </AccessControl>
  );
}
