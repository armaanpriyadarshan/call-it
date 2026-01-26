import React from "react";
import { Pressable, Text } from "react-native";

export const SearchFilterTab: React.FC<{
  label: string;
  isActive: boolean;
  onPress: () => void;
  count?: number;
}> = ({ label, isActive, onPress, count }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: isActive ? "white" : "transparent",
      borderWidth: 1,
      borderColor: isActive ? "white" : "#333",
      opacity: pressed ? 0.8 : 1,
    })}
  >
    <Text
      style={{
        color: isActive ? "black" : "#aaa",
        fontSize: 14,
        fontWeight: "600",
      }}
    >
      {label}{count !== undefined ? ` (${count})` : ""}
    </Text>
  </Pressable>
);
