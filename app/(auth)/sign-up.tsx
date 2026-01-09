import { useSignUp } from "@clerk/clerk-expo";
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
    const msg =
        anyErr?.errors?.[0]?.message ||
        anyErr?.message ||
        "Something went wrong. Please try again.";
    return String(msg);
}

export default function SignUp() {
    const router = useRouter();
    const { isLoaded, signUp, setActive } = useSignUp();

    const [fontsLoaded] = useFonts({
        JetBrainsMono_500Medium,
        JetBrainsMono_700Bold,
    });

    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");

    const [submitted, setSubmitted] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const [pendingVerification, setPendingVerification] = React.useState(false);
    const [code, setCode] = React.useState("");

    const [serverError, setServerError] = React.useState<string | null>(null);

    const trimmedEmail = email.trim();
    const emailOk = trimmedEmail.length > 0 && isValidEmail(trimmedEmail);
    const passwordOk = password.length >= 8;
    const confirmOk = confirmPassword.length > 0 && confirmPassword === password;

    const formOk = emailOk && passwordOk && confirmOk;

    const showEmailError = submitted && !emailOk;
    const showPasswordError = submitted && !passwordOk;
    const showConfirmError = submitted && !confirmOk;

    const onCreateAccountPress = async () => {
        setSubmitted(true);
        setServerError(null);

        if (!formOk) return;
        if (!isLoaded) return;

        try {
            setBusy(true);

            await signUp.create({
                emailAddress: trimmedEmail,
                password,
            });

            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

            setPendingVerification(true);
        } catch (err) {
            setServerError(getClerkMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const onVerifyPress = async () => {
        setServerError(null);
        if (!isLoaded) return;
        if (!code.trim()) {
            setServerError("Enter the verification code.");
            return;
        }

        try {
            setBusy(true);

            const attempt = await signUp.attemptEmailAddressVerification({
                code: code.trim(),
            });

            if (attempt.status === "complete") {
                await setActive({ session: attempt.createdSessionId });
                router.replace("/(tabs)");
            } else {
                setServerError("Verification not complete. Please try again.");
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
                    {pendingVerification ? "VERIFY EMAIL" : "CREATE ACCOUNT"}
                </Text>

                <View style={{ gap: 12 }}>
                    {!pendingVerification ? (
                        <>
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
                                    Password must be at least 8 characters.
                                </Text>
                            ) : null}

                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm password"
                                placeholderTextColor="#666"
                                secureTextEntry
                                style={{
                                    ...inputStyle,
                                    borderColor: showConfirmError ? "#ff6b6b" : "#333",
                                }}
                            />
                            {showConfirmError ? (
                                <Text style={{ color: "#ff6b6b", fontSize: 12 }}>
                                    Passwords do not match.
                                </Text>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <Text style={{ color: "#aaa", fontSize: 14 }}>
                                We sent a verification code to{" "}
                                <Text style={{ color: "white" }}>{trimmedEmail}</Text>
                            </Text>

                            <TextInput
                                value={code}
                                onChangeText={setCode}
                                placeholder="Verification code"
                                placeholderTextColor="#666"
                                keyboardType="number-pad"
                                returnKeyType="done"
                                onSubmitEditing={onVerifyPress}
                                style={inputStyle}
                            />
                        </>
                    )}

                    {serverError ? (
                        <Text style={{ color: "#ff6b6b", fontSize: 12 }}>{serverError}</Text>
                    ) : null}
                </View>
            </View>

            <View style={{ paddingBottom: 32, alignItems: "center" }}>
                <Pressable
                    onPress={pendingVerification ? onVerifyPress : onCreateAccountPress}
                    disabled={busy || (!pendingVerification && !formOk)}
                    style={{
                        width: "100%",
                        paddingVertical: 14,
                        borderRadius: 24,
                        backgroundColor: "#1c1c1c",
                        borderWidth: 1,
                        borderColor: "#333",
                        marginBottom: 16,
                        opacity: busy || (!pendingVerification && !formOk) ? 0.5 : 1,
                    }}
                >
                    <Text style={{ color: "white", textAlign: "center", fontSize: 16, fontWeight: "600" }}>
                        {pendingVerification ? (busy ? "Verifying..." : "Verify") : busy ? "Creating..." : "Create account"}
                    </Text>
                </Pressable>

                {!pendingVerification ? (
                    <Text style={{ color: "#777", fontSize: 14 }}>
                        Already have an account?{" "}
                        <Text
                            style={{ color: "white", fontWeight: "600" }}
                            onPress={() => router.replace("/(auth)/sign-in")}
                        >
                            Sign in
                        </Text>
                    </Text>
                ) : (
                    <Text style={{ color: "#777", fontSize: 14 }}>
                        Wrong email?{" "}
                        <Text
                            style={{ color: "white", fontWeight: "600" }}
                            onPress={() => {
                                setPendingVerification(false);
                                setCode("");
                                setServerError(null);
                            }}
                        >
                            Go back
                        </Text>
                    </Text>
                )}
            </View>
        </View>
    );
}