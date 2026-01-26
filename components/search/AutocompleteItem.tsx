import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Pressable, Text } from "react-native";

export const AutocompleteItem: React.FC<{
  suggestion: string;
  onPress: () => void;
}> = ({ suggestion, onPress }) => (
  <Pressable
    onPress={onPress}
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#222",
    }}
  >
    <Octicons name="search" size={18} color="#666" style={{ marginRight: 12 }} />
    <Text style={{ color: "white", fontSize: 16 }}>{suggestion}</Text>
  </Pressable>
);
