import { MiniVoteBar } from "@/components/questions";
import type { Question } from "@/types";
import { formatDate } from "@/utils/date";
import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

export const MyQuestionCard: React.FC<{
  question: Question;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ question, onPress, onEdit, onDelete }) => {
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
          resizeMode='cover'
        />
      )}

      <View
        style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 10 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              {question.meta?.category && (
                <Text style={{ color: "#aaa", fontSize: 12, marginRight: 8 }}>
                  {question.meta.category}
                </Text>
              )}
            </View>
            <Text
              style={{
                color: "white",
                fontSize: 18,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              {question.title}
            </Text>
            <Text
              style={{ color: "#aaa", fontSize: 14, marginBottom: 0 }}
              numberOfLines={2}
            >
              {question.prompt}
            </Text>
          </View>
        </View>

        {totalVotes > 0 && (
          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <MiniVoteBar
              leftVotes={question.votes?.left ?? 0}
              rightVotes={question.votes?.right ?? 0}
              leftLabel={question.left.label}
              rightLabel={question.right.label}
            />
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <Text style={{ color: "#666", fontSize: 12 }}>
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"} •{" "}
            {formatDate(question.createdAt || new Date().toISOString())}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 8,
                backgroundColor: pressed ? "#2a2a2a" : "transparent",
              })}
            >
              <Octicons name='pencil' size={16} color='#aaa' />
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 8,
                backgroundColor: pressed ? "#2a2a2a" : "transparent",
              })}
            >
              <Octicons name='trash' size={16} color='#ff6b6b' />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
};
