import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Pressable } from "react-native";

const COLORS = {
  textSecondary: "#aaa",
};

export const ImageAttachmentButton: React.FC<{
  onPress: () => void;
  position: "bottom-right" | "center-right";
}> = ({ onPress, position }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      ...(position === "bottom-right" && { position: "absolute", bottom: 12, right: 12 }),
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: pressed ? "#2a2a2a" : "#262626",
      alignItems: "center",
      justifyContent: "center",
    })}
  >
    <Octicons name="image" size={18} color={COLORS.textSecondary} />
  </Pressable>
);
