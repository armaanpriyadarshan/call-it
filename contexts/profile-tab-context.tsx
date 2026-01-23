import React from "react";

type ProfileTabContextType = {
  registerResetCallback: (callback: () => boolean) => void;
  unregisterResetCallback: () => void;
  triggerReset: () => boolean;
  setProfileTabActive: (active: boolean) => void;
};

const ProfileTabContext = React.createContext<ProfileTabContextType | null>(null);

export function ProfileTabProvider({ children }: { children: React.ReactNode }) {
  const resetCallbackRef = React.useRef<(() => boolean) | null>(null);
  const isProfileTabActiveRef = React.useRef(false);

  const registerResetCallback = React.useCallback((callback: () => boolean) => {
    resetCallbackRef.current = callback;
  }, []);

  const unregisterResetCallback = React.useCallback(() => {
    resetCallbackRef.current = null;
  }, []);

  const setProfileTabActive = React.useCallback((active: boolean) => {
    isProfileTabActiveRef.current = active;
  }, []);

  const triggerReset = React.useCallback(() => {
    if (isProfileTabActiveRef.current && resetCallbackRef.current) {
      return resetCallbackRef.current();
    }
    return false;
  }, []);

  const value = React.useMemo(
    () => ({ registerResetCallback, unregisterResetCallback, triggerReset, setProfileTabActive }),
    [registerResetCallback, unregisterResetCallback, triggerReset, setProfileTabActive]
  );

  return <ProfileTabContext.Provider value={value}>{children}</ProfileTabContext.Provider>;
}

export function useProfileTabReset() {
  const context = React.useContext(ProfileTabContext);
  if (!context) {
    throw new Error("useProfileTabReset must be used within ProfileTabProvider");
  }
  return context;
}
