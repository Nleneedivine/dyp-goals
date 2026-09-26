import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type UiMode = "classic" | "ui2";

type UiModeContextValue = {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
  isUi2: boolean;
};

const STORAGE_KEY = "dyp-goals-ui-mode";
const UiModeContext = createContext<UiModeContextValue | null>(null);

export function UiModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UiMode>(() => {
    if (typeof window === "undefined") return "classic";
    return window.localStorage.getItem(STORAGE_KEY) === "ui2" ? "ui2" : "classic";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiMode = mode;
    root.classList.toggle("ui2", mode === "ui2");
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      setMode: setModeState,
      isUi2: mode === "ui2",
    }),
    [mode],
  );

  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>;
}

export function useUiMode() {
  const context = useContext(UiModeContext);
  if (!context) throw new Error("useUiMode must be used within UiModeProvider");
  return context;
}
