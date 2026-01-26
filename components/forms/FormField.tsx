import React from "react";
import { Text, View } from "react-native";

const COLORS = {
  textSecondary: "#aaa",
  borderError: "#ff6b6b",
};

export const FormField: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <View>
    <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
      {label}
    </Text>
    {children}
    {error ? <Text style={{ color: COLORS.borderError, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
  </View>
);
