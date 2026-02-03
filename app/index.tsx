import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";

export default function Index() {
  const { isSignedIn } = useAuth();
  // ClerkLoaded in _layout.tsx guarantees isSignedIn is a boolean, not undefined
  return isSignedIn ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)" />;
}