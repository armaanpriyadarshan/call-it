import type { Choice } from "@/types";
import React from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
import { FriendAvatars, FriendAvatarData } from "./FriendAvatars";

interface FullScreenChoiceProps {
  choice: Choice;
  direction: "left" | "right";
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled: boolean;
  showResults: boolean;
  percentage: number;
  votes: number;
  animatedWidth: Animated.Value;
  friendVotes?: FriendAvatarData[];
  isSelected?: boolean;
}

export const FullScreenChoice: React.FC<FullScreenChoiceProps> = ({
  choice,
  direction,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  showResults,
  percentage,
  votes,
  animatedWidth,
  friendVotes = [],
  isSelected = false,
}) => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Derive opacity from animatedWidth so text fades in with the bar during animation.
  // For 0% results (percentage is 0 but showResults is true), always show text.
  const animatedOpacity = animatedWidth.interpolate({
    inputRange: [0, 15, 100],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });
  // If showing results with 0%, use full opacity; otherwise use animated opacity
  const resultsOpacity = percentage === 0 && showResults ? 1 : animatedOpacity;

  const handlePressIn = () => {
    onPressIn?.();
    if (!disabled) {
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        useNativeDriver: true,
        friction: 8,
      }).start();
    }
  };

  const handlePressOut = () => {
    onPressOut?.();
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const widthInterpolation = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        style={{
          borderRadius: 18,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? "rgba(255, 255, 255, 0.6)" : "#333",
          backgroundColor: "#1c1c1c",
          overflow: "hidden",
          transform: [{ scale: scaleAnim }],
        }}
      >
        {showResults && (
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: widthInterpolation,
              backgroundColor: isSelected
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255, 255, 255, 0.15)",
              borderRadius: 14,
            }}
          />
        )}

        <View style={{ position: "relative", padding: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            {choice.imageUrl && (
              <Image
                source={{ uri: choice.imageUrl }}
                style={{ width: 48, height: 48, borderRadius: 12 }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "white",
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                {choice.label}
              </Text>
              {showResults && (
                <Animated.View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 4,
                    gap: 8,
                    opacity: resultsOpacity,
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? "#fff" : "#aaa",
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {Math.round(percentage)}%
                  </Text>
                  <Text
                    style={{
                      color: "#777",
                      fontSize: 14,
                    }}
                  >
                    ({votes} {votes === 1 ? "vote" : "votes"})
                  </Text>
                  {friendVotes.length > 0 && (
                    <FriendAvatars
                      friends={friendVotes}
                      opacity={1}
                      position="left"
                    />
                  )}
                </Animated.View>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};
