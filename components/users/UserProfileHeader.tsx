import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { User } from "@/types";
import { StatsCard } from "./StatsCard";

export const UserProfileHeader: React.FC<{
  user: User;
  stats: {
    questionsCreated: number;
    totalVotesCast: number;
    totalEngagement: number;
    followers: number;
    following: number;
  };
  onFollowersPress: () => void;
  onFollowingPress: () => void;
  isFollowing: boolean;
  onFollowPress: () => void;
}> = ({ user, stats, onFollowersPress, onFollowingPress, isFollowing, onFollowPress }) => {
  return (
    <View
      style={{
        paddingTop: 0,
        paddingBottom: 16,
        paddingHorizontal: 24,
        marginBottom: 12,
        backgroundColor: "black",
        borderBottomWidth: 1,
        borderBottomColor: "#333",
        justifyContent: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "stretch", marginTop: 12, marginBottom: 16, minHeight: 80 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#1c1c1c",
            borderWidth: 2,
            borderColor: "#333",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 16,
            overflow: "hidden",
          }}
        >
          {user.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: "white",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: "black",
                }}
              />
            </View>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
            {user.username || "User"}
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable onPress={onFollowersPress}>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{stats.followers}</Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>followers</Text>
            </Pressable>
            <Pressable onPress={onFollowingPress}>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{stats.following}</Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>following</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <StatsCard label="Questions" value={stats.questionsCreated} icon="question" />
        <StatsCard label="Votes Cast" value={stats.totalVotesCast} icon="check-circle" />
        <StatsCard label="Votes Received" value={stats.totalEngagement} icon="flame" />
      </View>

      <Pressable
        onPress={onFollowPress}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isFollowing ? "#333" : "#fff",
          backgroundColor: isFollowing ? "transparent" : pressed ? "#e0e0e0" : "#fff",
          alignItems: "center",
        })}
      >
        <Text
          style={{
            color: isFollowing ? "#aaa" : "#000",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {isFollowing ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </View>
  );
};
