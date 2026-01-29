import React from "react";

type ProfileTabContextType = {
  registerResetCallback: (callback: () => boolean) => void;
  unregisterResetCallback: () => void;
  registerRefreshCallback: (callback: () => void) => void;
  unregisterRefreshCallback: () => void;
  triggerReset: () => boolean;
  triggerRefresh: () => void;
  setProfileTabActive: (active: boolean) => void;
};

const ProfileTabContext = React.createContext<ProfileTabContextType | null>(
  null,
);

export function ProfileTabProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const resetCallbackRef = React.useRef<(() => boolean) | null>(null);
  const refreshCallbackRef = React.useRef<(() => void) | null>(null);
  const isProfileTabActiveRef = React.useRef(false);

  const registerResetCallback = React.useCallback((callback: () => boolean) => {
    resetCallbackRef.current = callback;
  }, []);

  const unregisterResetCallback = React.useCallback(() => {
    resetCallbackRef.current = null;
  }, []);

  const registerRefreshCallback = React.useCallback((callback: () => void) => {
    refreshCallbackRef.current = callback;
  }, []);

  const unregisterRefreshCallback = React.useCallback(() => {
    refreshCallbackRef.current = null;
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

  const triggerRefresh = React.useCallback(() => {
    if (refreshCallbackRef.current) {
      refreshCallbackRef.current();
    }
  }, []);

  const value = React.useMemo(
    () => ({
      registerResetCallback,
      unregisterResetCallback,
      registerRefreshCallback,
      unregisterRefreshCallback,
      triggerReset,
      triggerRefresh,
      setProfileTabActive,
    }),
    [
      registerResetCallback,
      unregisterResetCallback,
      registerRefreshCallback,
      unregisterRefreshCallback,
      triggerReset,
      triggerRefresh,
      setProfileTabActive,
    ],
  );

  return (
    <ProfileTabContext.Provider value={value}>
      {children}
    </ProfileTabContext.Provider>
  );
}

export function useProfileTabReset() {
  const context = React.useContext(ProfileTabContext);
  if (!context) {
    throw new Error(
      "useProfileTabReset must be used within ProfileTabProvider",
    );
  }
  return context;
}
