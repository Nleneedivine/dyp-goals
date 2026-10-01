import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UiMode = "classic" | "ui2";

type UiModeContextValue = {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
  clearPreview: () => void;
  globalMode: UiMode;
  refreshGlobalMode: () => Promise<void>;
  isUi2: boolean;
};

const PREVIEW_STORAGE_KEY = "dyp-goals-ui-mode";
const GLOBAL_CACHE_KEY = "dyp-goals-global-ui-mode";
const UiModeContext = createContext<UiModeContextValue | null>(null);

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [globalMode, setGlobalMode] = useState<UiMode>(() => {
    if (typeof window === "undefined") return "classic";
    return window.localStorage.getItem(GLOBAL_CACHE_KEY) === "ui2" ? "ui2" : "classic";
  });
  const [previewMode, setPreviewMode] = useState<UiMode | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    return stored === "ui2" || stored === "classic" ? stored : null;
  });

  const refreshGlobalMode = useCallback(async () => {
    const { data } = await supabase
      .from("platform_configuration")
      .select("ui2_default")
      .eq("id", "global")
      .maybeSingle();

    const nextMode: UiMode = data?.ui2_default === true ? "ui2" : "classic";
    setGlobalMode(nextMode);
    window.localStorage.setItem(GLOBAL_CACHE_KEY, nextMode);
  }, []);

  useEffect(() => {
    void refreshGlobalMode();
  }, [refreshGlobalMode]);

  const mode = previewMode ?? globalMode;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiMode = mode;
    root.classList.toggle("ui2", mode === "ui2");
  }, [mode]);

  const setMode = (nextMode: UiMode) => {
    setPreviewMode(nextMode);
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, nextMode);
  };

  const clearPreview = () => {
    setPreviewMode(null);
    window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      mode,
      setMode,
      clearPreview,
      globalMode,
      refreshGlobalMode,
      isUi2: mode === "ui2",
    }),
    [globalMode, mode, refreshGlobalMode],
  );

  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>;
}

export function useUiMode() {
  const context = useContext(UiModeContext);
  if (!context) throw new Error("useUiMode must be used within UiModeProvider");
  return context;
}
