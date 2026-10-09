import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { Assets } from "../api/client";
import type { DocState } from "../store/docStore";
import type { Session, StatusState } from "../store/session";

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionContext");
  return session;
}

export const useDoc = <T,>(selector: (state: DocState) => T): T => useStore(useSession().doc, selector);
export const useAssets = <T,>(selector: (state: Assets) => T): T => useStore(useSession().assets, selector);
export const useStatus = <T,>(selector: (state: StatusState) => T): T => useStore(useSession().status, selector);
