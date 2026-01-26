import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { User } from "@/types";

export const UserListItem: React.FC<{ user: User }> = ({ user }) => {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: "/user-profile",
          params: { username: user.username, userId: user.id },
        });
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#222",
        backgroundColor: pressed ? "#1c1c1c" : "transparent",
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
              {(user.firstName || user.username || "U")[0].toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
          {user.username || (user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.firstName || "User")}
        </Text>
        {user.username && user.firstName && (
          <Text style={{ color: "#aaa", fontSize: 14 }}>
            {user.firstName}{user.lastName ? ` ${user.lastName}` : ""}
          </Text>
        )}
      </View>
    </Pressable>
  );
};
