import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function HomeScreen() {
  const router = useRouter();
  const { signOut, isLoaded } = useAuth();

  const onSignOut = async () => {
    if (!isLoaded) return;

    try {
      await signOut();
      router.replace("/(auth)");
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        justifyContent: "center",
        backgroundColor: "black",
      }}
    >
      <Pressable
        onPress={onSignOut}
        style={{
          paddingVertical: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "white",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white" }}>Sign out</Text>
      </Pressable>
    </View>
  );
}