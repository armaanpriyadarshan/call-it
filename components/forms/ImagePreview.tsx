import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Image, Pressable, View } from "react-native";
import type { ImageInfo } from "@/types";

const COLORS = {
  overlay: "rgba(0, 0, 0, 0.7)",
  text: "white",
};

export const ImagePreview: React.FC<{
  image: ImageInfo;
  onRemove: () => void;
}> = ({ image, onRemove }) => (
  <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
    <View style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden" }}>
      <Image source={{ uri: image.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      <Pressable
        onPress={onRemove}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          backgroundColor: COLORS.overlay,
          borderRadius: 12,
          width: 24,
          height: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Octicons name="x" size={12} color={COLORS.text} />
      </Pressable>
    </View>
  </View>
);
