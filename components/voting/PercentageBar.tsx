import React from "react";
import { Animated, View } from "react-native";

type PercentageBarProps = {
  width: number;
  opacity: number;
  isSelected: boolean;
  position: "left" | "right";
  animatedWidth?: Animated.Value;
};

export const PercentageBar: React.FC<PercentageBarProps> = ({
  width,
  opacity,
  isSelected,
  position,
  animatedWidth,
}) => {
  if (animatedWidth) {
    const widthInterpolation = animatedWidth.interpolate({
      inputRange: [0, 100],
      outputRange: ["0%", "100%"],
      extrapolate: "clamp",
    });

    return (
      <Animated.View
        style={{
          position: "absolute",
          [position]: 0,
          top: 0,
          bottom: 0,
          width: widthInterpolation,
          backgroundColor: isSelected
            ? "rgba(255, 255, 255, 0.25)"
            : "rgba(255, 255, 255, 0.15)",
          borderRadius: 14,
          opacity,
        }}
      />
    );
  }

  return (
    <View
      style={{
        position: "absolute",
        [position]: 0,
        top: 0,
        bottom: 0,
        width: `${width}%`,
        backgroundColor: isSelected
          ? "rgba(255, 255, 255, 0.25)"
          : "rgba(255, 255, 255, 0.15)",
        borderRadius: 14,
        opacity,
      }}
    />
  );
};
