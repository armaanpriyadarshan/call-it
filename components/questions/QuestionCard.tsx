import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { Question } from "@/types";
import { formatDate } from "@/utils/date";

export const QuestionCard: React.FC<{ question: Question; onPress: () => void; showMiniBar?: boolean }> = ({
  question,
  onPress,
  showMiniBar = false,
}) => {
  const router = useRouter();
  const totalVotes = (question.votes?.left ?? 0) + (question.votes?.right ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "#1c1c1c",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#333",
      }}
    >
      {question.promptImageUrl && (
        <Image
          source={{ uri: question.promptImageUrl }}
          style={{ width: "100%", height: 120 }}
          resizeMode="cover"
        />
      )}

      <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              {question.meta?.category && (
                <Text style={{ color: "#aaa", fontSize: 12, marginRight: 8 }}>{question.meta.category}</Text>
              )}
            </View>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700", marginBottom: 6 }}>{question.title}</Text>
            <Text style={{ color: "#aaa", fontSize: 14, marginBottom: 0 }} numberOfLines={2}>
              {question.prompt}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <Text style={{ color: "#666", fontSize: 12 }}>
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"} {question.createdAt ? `• ${formatDate(question.createdAt)}` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};
