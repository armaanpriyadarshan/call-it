import React from "react";
import { Text, View } from "react-native";

export const VoteDisplay: React.FC<{
  percentage: number;
  votes: number;
  isSelected: boolean;
  swipeProgress: number;
  align: "left" | "right";
}> = ({ percentage, votes, isSelected, swipeProgress, align }) => (
  <View
    style={{
      alignItems: align === "right" ? "flex-end" : "flex-start",
      minWidth: 65,
      opacity: swipeProgress,
    }}
  >
    <Text
      style={{
        color: isSelected ? "#ddd" : "#aaa",
        fontSize: 14,
        fontWeight: "600",
      }}
    >
      {swipeProgress > 0 ? `${Math.round(percentage)}%` : "0%"}
    </Text>
    <Text
      style={{
        color: isSelected ? "#ddd" : "#aaa",
        fontSize: 12,
        fontWeight: "500",
      }}
    >
      ({votes} {votes === 1 ? "vote" : "votes"})
    </Text>
  </View>
);
