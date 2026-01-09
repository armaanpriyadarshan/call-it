import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { useFonts } from "@expo-google-fonts/jetbrains-mono/useFonts";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getClerkMessage(err: unknown): string {
  const anyErr = err as any;
  return (
    anyErr?.errors?.[0]?.message ||
    anyErr?.message ||
    "Something went wrong. Please try again."
  );
}

export default function SignInEmail() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [fontsLoaded] = useFonts({
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const trimmedEmail = email.trim();
  const emailOk = trimmedEmail.length > 0 && isValidEmail(trimmedEmail);
  const passwordOk = password.length > 0;
  const formOk = emailOk && passwordOk;

  const showEmailError = submitted && !emailOk;
  const showPasswordError = submitted && !passwordOk;

  const onSignInPress = async () => {
    setSubmitted(true);
    setServerError(null);

    if (!formOk) return;
    if (!isLoaded) return;

    try {
      setBusy(true);

      const attempt = await signIn.create({
        identifier: trimmedEmail,
        password,
      });

      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/(tabs)");
      } else {
        // Rare: additional steps required (2FA, etc.)
        setServerError("Sign-in requires additional steps. Please try again.");
      }
    } catch (err) {
      setServerError(getClerkMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!fontsLoaded) return null;

  const inputStyle = {
    width: "100%" as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#333",
    color: "white",
    fontSize: 16,
  };

  return (
    <View style={{ flex: 1, backgroundColor: "black", paddingHorizontal: 24 }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text
          style={{
            color: "white",
            fontSize: 32,
            fontFamily: "JetBrainsMono_700Bold",
            marginBottom: 8,
          }}
        >
          SIGN IN
        </Text>

        <View style={{ gap: 12 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#666"
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              ...inputStyle,
              borderColor: showEmailError ? "#ff6b6b" : "#333",
            }}
          />
          {showEmailError ? (
            <Text style={{ color: "#ff6b6b", fontSize: 12 }}>
              Please enter a valid email.
            </Text>
          ) : null}

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#666"
            secureTextEntry
            style={{
              ...inputStyle,
              borderColor: showPasswordError ? "#ff6b6b" : "#333",
            }}
          />
          {showPasswordError ? (
            <Text style={{ color: "#ff6b6b", fontSize: 12 }}>
              Please enter your password.
            </Text>
          ) : null}

          {serverError ? (
            <Text style={{ color: "#ff6b6b", fontSize: 12 }}>
              {serverError}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ paddingBottom: 32, alignItems: "center" }}>
        <Pressable
          onPress={onSignInPress}
          disabled={busy || !formOk}
          style={{
            width: "100%",
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: "#1c1c1c",
            borderWidth: 1,
            borderColor: "#333",
            marginBottom: 16,
            opacity: busy || !formOk ? 0.5 : 1,
          }}
        >
          <Text style={{ color: "white", textAlign: "center", fontSize: 16, fontWeight: "600" }}>
            {busy ? "Signing in..." : "Sign in"}
          </Text>
        </Pressable>

        <Text style={{ color: "#777", fontSize: 14 }}>
          Don&apos;t have an account?{" "}
          <Text
            style={{ color: "white", fontWeight: "600" }}
            onPress={() => router.replace("/(auth)/sign-up")}
          >
            Create one
          </Text>
        </Text>
      </View>
    </View>
  );
}