import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Text, View } from "react-native";

export const StatsCard: React.FC<{ label: string; value: number; icon: keyof typeof Octicons.glyphMap }> = ({
  label,
  value,
  icon,
}) => (
  <View
    style={{
      backgroundColor: "#1c1c1c",
      borderRadius: 8,
      padding: 8,
      borderWidth: 1,
      borderColor: "#333",
      flex: 1,
      minWidth: 0,
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
      <Octicons name={icon} size={12} color="#aaa" style={{ marginRight: 4 }} />
      <Text style={{ color: "#aaa", fontSize: 10, fontWeight: "500" }}>{label}</Text>
    </View>
    <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>{value}</Text>
  </View>
);
