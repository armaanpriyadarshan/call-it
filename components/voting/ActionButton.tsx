import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Pressable, Text, View } from "react-native";

export const ActionButton: React.FC<{
  onPress: () => void;
  icon: keyof typeof Octicons.glyphMap;
  label: string;
}> = ({ onPress, icon, label }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: pressed ? "#333" : "transparent",
      backgroundColor: pressed ? "#1c1c1c" : "transparent",
      minWidth: 60,
      alignItems: "center",
      justifyContent: "center",
    })}
  >
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Octicons name={icon} size={24} color="#aaa" />
      <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4, fontWeight: "500" }}>{label}</Text>
    </View>
  </Pressable>
);
