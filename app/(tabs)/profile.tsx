import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Pressable,
  Text,
  View,
} from "react-native";

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await signOut();
      router.replace("/(auth)");
    } catch (error) {
      console.error("Sign out error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "black", padding: 24, justifyContent: "center", alignItems: "center" }}>
      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => ({
          backgroundColor: pressed ? "#1c1c1c" : "#fff",
          borderRadius: 12,
          padding: 16,
          minWidth: 200,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: pressed ? "#333" : "transparent",
        })}
      >
        <Text
          style={{
            color: "#000",
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          Sign Out
        </Text>
      </Pressable>
    </View>
  );
}
