import React from "react";

type HomeTabContextType = {
  registerResetCallback: (callback: () => boolean) => void;
  unregisterResetCallback: () => void;
  triggerReset: () => boolean;
  setHomeTabActive: (active: boolean) => void;
};

const HomeTabContext = React.createContext<HomeTabContextType | null>(null);

export function HomeTabProvider({ children }: { children: React.ReactNode }) {
  const resetCallbackRef = React.useRef<(() => boolean) | null>(null);
  const isHomeTabActiveRef = React.useRef(false);

  const registerResetCallback = React.useCallback((callback: () => boolean) => {
    resetCallbackRef.current = callback;
  }, []);

  const unregisterResetCallback = React.useCallback(() => {
    resetCallbackRef.current = null;
  }, []);

  const setHomeTabActive = React.useCallback((active: boolean) => {
    isHomeTabActiveRef.current = active;
  }, []);

  const triggerReset = React.useCallback(() => {
    if (isHomeTabActiveRef.current && resetCallbackRef.current) {
      return resetCallbackRef.current();
    }
    return false;
  }, []);

  const value = React.useMemo(
    () => ({ registerResetCallback, unregisterResetCallback, triggerReset, setHomeTabActive }),
    [registerResetCallback, unregisterResetCallback, triggerReset, setHomeTabActive]
  );

  return <HomeTabContext.Provider value={value}>{children}</HomeTabContext.Provider>;
}

export function useHomeTabReset() {
  const context = React.useContext(HomeTabContext);
  if (!context) {
    throw new Error("useHomeTabReset must be used within HomeTabProvider");
  }
  return context;
}
