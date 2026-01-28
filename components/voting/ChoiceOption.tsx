import React from "react";
import { Image, Text, View } from "react-native";
import type { Choice } from "@/types";
import { PercentageBar } from "./PercentageBar";
import { PlusOneBadge } from "./PlusOneBadge";
import { VoteDisplay } from "./VoteDisplay";

export const ChoiceOption: React.FC<{
  choice: Choice;
  direction: "left" | "right";
  percentage: number;
  votes: number;
  swipeProgress: number;
  swipeDirection: "left" | "right" | null;
  isSelected: boolean;
  highlight: number;
}> = ({ choice, direction, percentage, votes, swipeProgress, swipeDirection, isSelected, highlight }) => {
  const isRight = direction === "right";
  const showPlusOne = swipeDirection === direction && swipeProgress > 0;

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1 + highlight * 2,
        borderColor:
          highlight > 0
            ? isSelected
              ? "rgba(255, 255, 255, 0.5)"
              : `rgba(255, 255, 255, ${0.15 + highlight * 0.1})`
            : "#333",
        backgroundColor: "#1c1c1c",
        overflow: "hidden",
      }}
    >
      {swipeProgress > 0 && (
        <PercentageBar
          width={percentage}
          opacity={swipeProgress}
          isSelected={isSelected}
          position={isRight ? "right" : "left"}
        />
      )}
      <View style={{ position: "relative", padding: 12 }}>

        <View style={{ position: "relative", zIndex: 1 }}>
          {showPlusOne && <PlusOneBadge opacity={swipeProgress} position={isRight ? "left" : "right"} />}

          <Text
            style={{
              color: "#aaa",
              fontSize: 12,
              marginBottom: 8,
              textAlign: isRight ? "right" : "left",
            }}
          >
            SWIPE {direction.toUpperCase()}
          </Text>

          <View
            style={{
              flexDirection: isRight ? "row-reverse" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: isRight ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
                flex: 1,
              }}
            >
              {choice.imageUrl && (
                <Image source={{ uri: choice.imageUrl }} style={{ width: 44, height: 44, borderRadius: 12 }} />
              )}
              <Text
                style={{
                  color: isSelected ? "#fff" : "white",
                  fontSize: 16,
                  fontWeight: "700",
                  textAlign: isRight ? "right" : "left",
                }}
              >
                {choice.label}
              </Text>
            </View>

            <VoteDisplay
              percentage={percentage}
              votes={votes}
              isSelected={isSelected}
              swipeProgress={swipeProgress}
              align={isRight ? "left" : "right"}
            />
          </View>
        </View>
      </View>
    </View>
  );
};
