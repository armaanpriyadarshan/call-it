import type { Choice } from "@/types";
import React from "react";
import { Image, Text, View } from "react-native";
import { FriendAvatars, FriendAvatarData } from "./FriendAvatars";
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
  resultsMode?: boolean;
  friendVotes?: FriendAvatarData[];
}> = ({
  choice,
  direction,
  percentage,
  votes,
  swipeProgress,
  swipeDirection,
  isSelected,
  highlight,
  resultsMode = false,
  friendVotes = [],
}) => {
  const isRight = direction === "right";
  const showPlusOne =
    !resultsMode && swipeDirection === direction && swipeProgress > 0;

  const showBar = resultsMode || swipeProgress > 0;
  const barOpacity = React.useMemo(() => {
    return resultsMode ? 1 : swipeProgress;
  }, [resultsMode, swipeProgress]);

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: resultsMode ? 1 : 1 + highlight * 2,
        borderColor: resultsMode
          ? "#333"
          : highlight > 0
            ? isSelected
              ? "rgba(255, 255, 255, 0.5)"
              : `rgba(255, 255, 255, ${0.15 + highlight * 0.1})`
            : "#333",
        backgroundColor: "#1c1c1c",
        overflow: "hidden",
      }}
    >
      {showBar && (
        <PercentageBar
          width={percentage}
          opacity={barOpacity}
          isSelected={resultsMode ? false : isSelected}
          position={isRight ? "right" : "left"}
        />
      )}
      <View style={{ position: "relative", padding: 12 }}>
        <View style={{ position: "relative", zIndex: 1 }}>
          {showPlusOne && (
            <PlusOneBadge
              opacity={swipeProgress}
              position={isRight ? "left" : "right"}
            />
          )}

          {!resultsMode && (
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
          )}

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
                <Image
                  source={{ uri: choice.imageUrl }}
                  style={{ width: 44, height: 44, borderRadius: 12 }}
                />
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
              {friendVotes.length > 0 && (
                <FriendAvatars
                  friends={friendVotes}
                  opacity={resultsMode ? 1 : swipeProgress}
                  position={isRight ? "right" : "left"}
                />
              )}
            </View>

            <VoteDisplay
              percentage={percentage}
              votes={votes}
              isSelected={isSelected}
              swipeProgress={resultsMode ? 1 : swipeProgress}
              align={isRight ? "left" : "right"}
            />
          </View>
        </View>
      </View>
    </View>
  );
};
