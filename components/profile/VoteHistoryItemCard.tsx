import type { Question, VoteHistoryItem } from "@/types";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

export const VoteHistoryItemCard: React.FC<{
  item: VoteHistoryItem;
  question: Question | null;
  onPress: () => void;
  onDelete: () => void;
}> = ({ item, question, onPress, onDelete }) => {
  const router = useRouter();
  const votes = question?.votes ?? { left: 0, right: 0 };
  const totalVotes = votes.left + votes.right;
  const userVoteCount = item.direction === "left" ? votes.left : votes.right;
  const otherVoteCount = item.direction === "left" ? votes.right : votes.left;
  const userPercentage =
    totalVotes > 0 ? Math.round((userVoteCount / totalVotes) * 100) : 0;
  const isMajority = userVoteCount >= otherVoteCount && totalVotes > 0;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "#1c1c1c",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#333",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 4,
          flexWrap: "wrap",
        }}
      >
        {question?.meta?.category && (
          <Text style={{ color: "#aaa", fontSize: 12 }}>
            {question.meta.category}
          </Text>
        )}
        {question?.meta?.createdBy && (
          <>
            {question?.meta?.category && (
              <Text style={{ color: "#aaa", fontSize: 12 }}> • </Text>
            )}
            {question.meta.createdBy !== "Anonymous" &&
            question.visibleUserId ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/user-profile",
                    params: {
                      username: question.meta?.createdBy,
                      userId: question.visibleUserId,
                    },
                  });
                }}
              >
                {({ pressed }) => (
                  <Text
                    style={{
                      color: "#aaa",
                      fontSize: 12,
                      textDecorationLine: pressed ? "underline" : "none",
                    }}
                  >
                    {question.meta?.createdBy}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta.createdBy}
              </Text>
            )}
          </>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <Text
          style={{
            color: "white",
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          {item.questionTitle}
        </Text>
        <Octicons
          name='chevron-right'
          size={16}
          color='#666'
          style={{ marginLeft: 4 }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            flex: 1,
          }}
        >
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor:
                item.direction === "left"
                  ? "rgba(59, 130, 246, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
              borderWidth: 1,
              borderColor:
                item.direction === "left"
                  ? "rgba(59, 130, 246, 0.4)"
                  : "rgba(239, 68, 68, 0.4)",
            }}
          >
            <Text
              style={{
                color: item.direction === "left" ? "#60a5fa" : "#f87171",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Swiped {item.direction === "left" ? "Left" : "Right"}
            </Text>
          </View>
          {totalVotes > 0 && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: isMajority
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(234, 179, 8, 0.2)",
                borderWidth: 1,
                borderColor: isMajority
                  ? "rgba(34, 197, 94, 0.4)"
                  : "rgba(234, 179, 8, 0.4)",
              }}
            >
              <Text
                style={{
                  color: isMajority ? "#4ade80" : "#fbbf24",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isMajority ? "Majority" : "Minority"} • {userPercentage}%
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={({ pressed }) => ({
            padding: 8,
            borderRadius: 8,
            backgroundColor: pressed ? "#2a2a2a" : "transparent",
          })}
        >
          <Octicons name='trash' size={16} color='#ff6b6b' />
        </Pressable>
      </View>
    </Pressable>
  );
};
