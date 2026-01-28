import React from "react";
import { View } from "react-native";

export const PercentageBar: React.FC<{
  width: number;
  opacity: number;
  isSelected: boolean;
  position: "left" | "right";
}> = ({ width, opacity, isSelected, position }) => (
  <View
    style={{
      position: "absolute",
      [position]: 0,
      top: 0,
      bottom: 0,
      width: `${width}%`,
      backgroundColor: isSelected ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.15)",
      borderRadius: 14,
      opacity,
    }}
  />
);
