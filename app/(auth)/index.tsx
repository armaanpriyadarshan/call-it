import AntDesign from "@expo/vector-icons/AntDesign";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { useOAuth } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { useFonts } from "@expo-google-fonts/jetbrains-mono/useFonts";

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: "oauth_google" });
  const { startOAuthFlow: startAppleOAuth } = useOAuth({ strategy: "oauth_apple" });

  if (!fontsLoaded) return null;

  const onGooglePress = async () => {
    try {
      const redirectUrl = Linking.createURL("/(tabs)");
      const { createdSessionId, setActive } = await startGoogleOAuth({ redirectUrl });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err) {
      console.error("Google OAuth error:", err);
    }
  };

  const onApplePress = async () => {
    try {
      const redirectUrl = Linking.createURL("/(tabs)");
      const { createdSessionId, setActive } = await startAppleOAuth({ redirectUrl });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err) {
      console.error("Apple OAuth error:", err);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "black", paddingHorizontal: 24 }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
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

        <Text
          style={{
            color: "#aaa",
            fontSize: 16,
            fontFamily: "JetBrainsMono_500Medium",
            textAlign: "center",
          }}
        >
          Pick your side. Make the call.
        </Text>
      </View>

      <View style={{ paddingBottom: 32, alignItems: "center" }}>
        <Pressable
          onPress={onGooglePress}
          style={{
            width: "100%",
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: "#1c1c1c",
            borderWidth: 1,
            borderColor: "#333",
            marginBottom: 12,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <AntDesign name="google" size={20} color="white" style={{ marginRight: 10 }} />
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
            Continue with Google
          </Text>
        </Pressable>

        <Pressable
          onPress={onApplePress}
          style={{
            width: "100%",
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: "#1c1c1c",
            borderWidth: 1,
            borderColor: "#333",
            marginBottom: 12,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <AntDesign name="apple" size={20} color="white" style={{ marginRight: 10 }} />
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
            Continue with Apple
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: "#333" }} />
          <Text style={{ color: "#777", marginHorizontal: 12 }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: "#333" }} />
        </View>

        <Pressable
          onPress={() => router.push("/(auth)/sign-up")}
          style={{
            width: "100%",
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: "#1c1c1c",
            borderWidth: 1,
            borderColor: "#333",
            marginBottom: 20,
          }}
        >
          <Text style={{ color: "white", textAlign: "center", fontSize: 16, fontWeight: "600" }}>
            Create account
          </Text>
        </Pressable>

        <Text style={{ color: "#777", fontSize: 14 }}>
          Already have an account?{" "}
          <Text
            style={{ color: "white", fontWeight: "600" }}
            onPress={() => router.replace("/(auth)/sign-in")}
          >
            Sign in
          </Text>
        </Text>
      </View>
    </View>
  );
}