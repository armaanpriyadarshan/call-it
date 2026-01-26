import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { User } from "@/types";

export const UserSearchCard: React.FC<{
  user: User;
  onPress: () => void;
}> = ({ user, onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1c1c1c",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#333",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: user.avatarUrl ? "transparent" : "#333",
          marginRight: 12,
          overflow: "hidden",
        }}
      >
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: 48, height: 48 }} />
        ) : (
          <View
            style={{
              width: 48,
              height: 48,
              backgroundColor: "#333",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#aaa", fontSize: 18, fontWeight: "600" }}>
              {user.username[0].toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600", marginBottom: 4 }}>
          {user.username}
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Text style={{ color: "#666", fontSize: 12 }}>
            {user.questionsCount} questions
          </Text>
          <Text style={{ color: "#666", fontSize: 12 }}>
            {user.followersCount} followers
          </Text>
        </View>
      </View>

      <Octicons name="chevron-right" size={20} color="#666" />
    </Pressable>
  );
};
