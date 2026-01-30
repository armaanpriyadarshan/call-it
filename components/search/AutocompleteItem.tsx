import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Pressable, Text, View } from "react-native";

export type AutocompleteSuggestion = {
  type: "question" | "user";
  id: string;
  label: string;
  sublabel?: string;
};

export const AutocompleteItem: React.FC<{
  suggestion: AutocompleteSuggestion;
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
    <Octicons
      name={suggestion.type === "user" ? "person" : "search"}
      size={18}
      color="#666"
      style={{ marginRight: 12 }}
    />
    <View style={{ flex: 1 }}>
      <Text style={{ color: "white", fontSize: 16 }}>{suggestion.label}</Text>
      {suggestion.type === "user" && suggestion.sublabel && (
        <Text style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
          {suggestion.sublabel}
        </Text>
      )}
    </View>
  </Pressable>
);
