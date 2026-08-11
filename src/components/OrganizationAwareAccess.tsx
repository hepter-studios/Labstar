import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  getCurrentAccessIdentity,
  getPendingInviteToken,
  subscribeToAccessChanges,
} from "../lib/access";
import { supabaseClient } from "../lib/supabase";
import { AccessControl } from "./AccessControl";
import { OrganizationEntryGate } from "./OrganizationEntryGate";

type AccessRoute = "resolving" | "standard" | "organization";

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
    return <OrganizationEntryGate>{children}</OrganizationEntryGate>;
  }

  return (
    <AccessControl>
      <OrganizationEntryGate>{children}</OrganizationEntryGate>
    </AccessControl>
  );
}
