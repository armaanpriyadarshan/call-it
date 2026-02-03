import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { useFonts } from "@expo-google-fonts/jetbrains-mono/useFonts";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

const SPLASH_DURATION_MS = 2000;

export default function Index() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  const [fontsLoaded] = useFonts({
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (hasRedirected.current) return;
    const timer = setTimeout(() => {
      hasRedirected.current = true;
      router.replace(isSignedIn ? "/(tabs)" : "/(auth)");
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isSignedIn, router]);

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <Text
        style={{
          color: "white",
          fontSize: 32,
          fontFamily: "JetBrainsMono_700Bold",
          marginBottom: 8,
        }}
      >
        CALL IT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
