import React from "react";
import { View, Image } from "react-native";

export interface FriendAvatarData {
  userId: string;
  avatarUrl: string | null;
}

export const FriendAvatars: React.FC<{
  friends: FriendAvatarData[];
  opacity: number;
  position: "left" | "right";
  maxDisplay?: number;
}> = ({ friends, opacity, position, maxDisplay = 3 }) => {
  if (friends.length === 0 || opacity === 0) return null;

  const displayFriends = friends.slice(0, maxDisplay);
  const isRight = position === "right";

  return (
    <View
      style={{
        flexDirection: isRight ? "row-reverse" : "row",
        alignItems: "center",
        opacity,
      }}
    >
      {displayFriends.map((friend, index) => (
        <View
          key={friend.userId}
          style={{
            marginLeft: isRight ? 0 : index > 0 ? -8 : 0,
            marginRight: isRight && index > 0 ? -8 : 0,
            zIndex: displayFriends.length - index,
          }}
        >
          {friend.avatarUrl ? (
            <Image
              source={{ uri: friend.avatarUrl }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
              }}
            />
          ) : (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: "#333",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#666",
                }}
              />
            </View>
          )}
        </View>
      ))}
    </View>
  );
};
