import { AutocompleteSuggestion } from "@/lib/queries/search";
import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

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
    {suggestion.type === "user" ? (
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: suggestion.avatarUrl ? "transparent" : "#333",
          marginRight: 12,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {suggestion.avatarUrl ? (
          <Image
            source={{ uri: suggestion.avatarUrl }}
            style={{ width: 40, height: 40 }}
          />
        ) : (
          <Text style={{ color: "#aaa", fontSize: 16, fontWeight: "600" }}>
            {suggestion.label[0]?.toUpperCase() || "?"}
          </Text>
        )}
      </View>
    ) : (
      <Octicons
        name="search"
        size={18}
        color="#666"
        style={{ marginRight: 12 }}
      />
    )}
    <View style={{ flex: 1 }}>
      <Text style={{ color: "white", fontSize: 16 }}>{suggestion.label}</Text>
      {suggestion.type === "user" && suggestion.sublabel && (
        <Text style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
          {suggestion.sublabel}
        </Text>
      )}
    </View>
    {suggestion.type === "user" && (
      <Octicons name="chevron-right" size={16} color="#666" />
    )}
  </Pressable>
);
