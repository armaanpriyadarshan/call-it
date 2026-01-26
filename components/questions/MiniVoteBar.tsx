import React from "react";
import { Text, View } from "react-native";
import { getNormalizedPercentages } from "@/utils/voting";

export const MiniVoteBar: React.FC<{
  leftVotes: number;
  rightVotes: number;
  leftLabel: string;
  rightLabel: string;
}> = ({ leftVotes, rightVotes, leftLabel, rightLabel }) => {
  const total = leftVotes + rightVotes;

  if (total === 0) {
    return (
      <View
        style={{
          height: 28,
          borderRadius: 6,
          backgroundColor: "#0f0f0f",
          borderWidth: 1,
          borderColor: "#333",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#666", fontSize: 11 }}>No votes yet</Text>
      </View>
    );
  }

  const percentages = getNormalizedPercentages(leftVotes, rightVotes, total);
  const leftWidth = percentages.left;
  const rightWidth = percentages.right;

  return (
    <View
      style={{
        height: 28,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: "#0f0f0f",
        borderWidth: 1,
        borderColor: "#333",
        flexDirection: "row",
      }}
    >
      {leftWidth > 0 && (
        <View
          style={{
            width: `${leftWidth}%`,
            backgroundColor: "rgba(59, 130, 246, 0.2)",
            borderRightWidth: rightWidth > 0 ? 1 : 0,
            borderRightColor: "#333",
            paddingHorizontal: 8,
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          <Text
            style={{
              color: "#60a5fa",
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {percentages.left}% {leftLabel}
          </Text>
        </View>
      )}
      {rightWidth > 0 && (
        <View
          style={{
            width: `${rightWidth}%`,
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            paddingHorizontal: 8,
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <Text
            style={{
              color: "#f87171",
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {percentages.right}% {rightLabel}
          </Text>
        </View>
      )}
    </View>
  );
};
