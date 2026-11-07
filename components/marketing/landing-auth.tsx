"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AuthModal } from "@/components/auth/auth-modal";

type LandingAuthContextValue = {
  openAuth: (nextPath?: string) => void;
  allowCreate: boolean;
  googleEnabled: boolean;
};

const LandingAuthContext = createContext<LandingAuthContextValue | null>(
  null,
);

export function LandingAuthProvider({
  children,
  allowCreate,
  googleEnabled,
}: {
  children: ReactNode;
  allowCreate: boolean;
  googleEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nextPath, setNextPath] = useState("/app");

  const openAuth = useCallback((next = "/app") => {
    setNextPath(next.startsWith("/") ? next : "/app");
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ openAuth, allowCreate, googleEnabled }),
    [openAuth, allowCreate, googleEnabled],
  );

  return (
    <LandingAuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={open}
        onOpenChange={setOpen}
        nextPath={nextPath}
        allowCreate={allowCreate}
        googleEnabled={googleEnabled}
      />
    </LandingAuthContext.Provider>
  );
}

export function useLandingAuth() {
  const ctx = useContext(LandingAuthContext);
  if (!ctx) {
    throw new Error("useLandingAuth must be used within LandingAuthProvider");
  }
  return ctx;
}

export function LandingAuthButton({
  children,
  className,
  nextPath = "/app",
}: {
  children: ReactNode;
  className?: string;
  nextPath?: string;
}) {
  const { openAuth } = useLandingAuth();
  return (
    <button
      type="button"
      className={className}
      onClick={() => openAuth(nextPath)}
    >
      {children}
    </button>
  );
}
