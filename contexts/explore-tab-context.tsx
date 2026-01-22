import React from "react";

type ExploreTabContextType = {
  registerResetCallback: (callback: () => boolean) => void;
  unregisterResetCallback: () => void;
  triggerReset: () => boolean;
  setExploreTabActive: (active: boolean) => void;
};

const ExploreTabContext = React.createContext<ExploreTabContextType | null>(null);

export function ExploreTabProvider({ children }: { children: React.ReactNode }) {
  const resetCallbackRef = React.useRef<(() => boolean) | null>(null);
  const isExploreTabActiveRef = React.useRef(false);

  const registerResetCallback = React.useCallback((callback: () => boolean) => {
    resetCallbackRef.current = callback;
  }, []);

  const unregisterResetCallback = React.useCallback(() => {
    resetCallbackRef.current = null;
  }, []);

  const setExploreTabActive = React.useCallback((active: boolean) => {
    isExploreTabActiveRef.current = active;
  }, []);

  const triggerReset = React.useCallback(() => {
    if (isExploreTabActiveRef.current && resetCallbackRef.current) {
      return resetCallbackRef.current();
    }
    return false;
  }, []);

  const value = React.useMemo(
    () => ({ registerResetCallback, unregisterResetCallback, triggerReset, setExploreTabActive }),
    [registerResetCallback, unregisterResetCallback, triggerReset, setExploreTabActive]
  );

  return <ExploreTabContext.Provider value={value}>{children}</ExploreTabContext.Provider>;
}

export function useExploreTabReset() {
  const context = React.useContext(ExploreTabContext);
  if (!context) {
    throw new Error("useExploreTabReset must be used within ExploreTabProvider");
  }
  return context;
}
