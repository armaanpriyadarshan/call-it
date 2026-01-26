import React from "react";
import { Text, View } from "react-native";

export const PlusOneBadge: React.FC<{ opacity: number; position: "left" | "right" }> = ({ opacity, position }) => (
  <View
    style={{
      position: "absolute",
      top: 0,
      [position]: 0,
      backgroundColor: "white",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      zIndex: 2,
      opacity,
    }}
  >
    <Text style={{ color: "black", fontSize: 12, fontWeight: "700" }}>+1</Text>
  </View>
);
