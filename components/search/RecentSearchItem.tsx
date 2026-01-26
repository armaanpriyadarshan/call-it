import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Pressable, Text, View } from "react-native";

export const RecentSearchItem: React.FC<{
  query: string;
  onPress: () => void;
  onDelete: () => void;
}> = ({ query, onPress, onDelete }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#222",
    }}
  >
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Octicons name="clock" size={18} color="#666" style={{ marginRight: 12 }} />
      <Text style={{ color: "white", fontSize: 16, flex: 1 }}>{query}</Text>
    </Pressable>
    <Pressable
      onPress={onDelete}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => ({
        padding: 8,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Octicons name="x" size={18} color="#666" />
    </Pressable>
  </View>
);
