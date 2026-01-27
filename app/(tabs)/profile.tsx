import { useProfileTabReset } from "@/contexts/profile-tab-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Question, User, VoteHistoryItem, ImageInfo } from "@/types";
import { getNormalizedPercentages } from "@/utils/voting";
import { formatDate } from "@/utils/date";


const SUGGESTED_CATEGORIES = [
  "Style",
  "Food",
  "Career",
  "Social",
  "Travel",
  "Technology",
  "Sports",
  "Entertainment",
  "Health",
  "Education",
];

const COLORS = {
  background: "#1c1c1c",
  border: "#333",
  text: "white",
  textSecondary: "#aaa",
  placeholder: "#666",
};

const AutocompleteInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  suggestions: string[];
  style?: any;
  onFocus?: () => void;
  onBlur?: () => void;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
}> = ({ value, onChangeText, placeholder, suggestions, style, onFocus, onBlur, onDropdownOpen, onDropdownClose }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isSelectingRef = useRef(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const cancelBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (value.trim() && isFocused) {
      const filtered = suggestions.filter((cat) => cat.toLowerCase().includes(value.toLowerCase()));
      setFilteredSuggestions(filtered);
    } else if (isFocused) {
      setFilteredSuggestions(suggestions);
    } else {
      setFilteredSuggestions([]);
    }
  }, [value, isFocused, suggestions]);

  const isDropdownVisible = isFocused && filteredSuggestions.length > 0;

  useEffect(() => {
    if (isDropdownVisible) {
      onDropdownOpen?.();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      onDropdownClose?.();
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [isDropdownVisible, fadeAnim, onDropdownOpen, onDropdownClose]);

  useEffect(() => {
    return () => cancelBlurTimeout();
  }, [cancelBlurTimeout]);

  const handleSelect = (suggestion: string) => {
    cancelBlurTimeout();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isSelectingRef.current = true;
    onChangeText(suggestion);
    setIsFocused(false);

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 100);
    });
  };

  return (
    <View style={{ position: "relative", zIndex: isFocused ? 1000 : 1 }}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          if (!isSelectingRef.current && text.trim() !== value.trim()) {
            setIsFocused(true);
          }
        }}
        onFocus={() => {
          cancelBlurTimeout();
          setIsFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => {
            if (!isSelectingRef.current) {
              setIsFocused(false);
              onBlur?.();
            }
          }, 150);
        }}
        placeholder={placeholder}
        placeholderTextColor={COLORS.placeholder}
        style={style}
      />
      {isFocused && filteredSuggestions.length > 0 && (
        <View
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            backgroundColor: COLORS.background,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            maxHeight: 200,
            zIndex: 1001,
            elevation: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            overflow: "hidden",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="always"
            style={{ maxHeight: 200 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={true}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <Pressable
                key={index}
                onPressIn={cancelBlurTimeout}
                onPress={() => handleSelect(suggestion)}
                style={({ pressed }) => ({
                  padding: 12,
                  borderBottomWidth: index < filteredSuggestions.length - 1 ? 1 : 0,
                  borderBottomColor: "#222",
                  backgroundColor: pressed ? "#2a2a2a" : "transparent",
                })}
              >
                <Text style={{ color: COLORS.text, fontSize: 16 }}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
const MOCK_USER_STATS = {
  questionsCreated: 12,
  totalVotesCast: 47,
  totalEngagement: 234,
  followers: 128,
  following: 64,
};

const MOCK_FOLLOWERS: User[] = Array.from({ length: 128 }, (_, i) => ({
  id: `follower-${i + 1}`,
  username: `user${i + 1}`,
  firstName: i % 3 === 0 ? `First${i + 1}` : undefined,
  lastName: i % 5 === 0 ? `Last${i + 1}` : undefined,
  avatarUrl: i % 7 === 0 ? undefined : `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
}));

const MOCK_FOLLOWING: User[] = Array.from({ length: 64 }, (_, i) => ({
  id: `following-${i + 1}`,
  username: `friend${i + 1}`,
  firstName: i % 2 === 0 ? `Friend${i + 1}` : undefined,
  lastName: i % 4 === 0 ? `Name${i + 1}` : undefined,
  avatarUrl: i % 6 === 0 ? undefined : `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
}));



const MOCK_MY_QUESTIONS: Question[] = [
  {
    id: "q1",
    title: "Outfit check",
    prompt: "Which one for dinner tonight?",
    promptImageUrl: "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=1200&q=80",
    left: {
      id: "left",
      label: "Black dress",
      imageUrl: "https://images.unsplash.com/photo-1643756635111-ee5b18e055dc?w=400&h=400&fit=crop",
    },
    right: {
      id: "right",
      label: "Red dress",
      imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=400&fit=crop",
    },
    votes: { left: 12, right: 8 },
    meta: { category: "Style", createdBy: "You" },
    createdAt: "2024-01-15",
  },
  {
    id: "q2",
    title: "Text them?",
    prompt: "Do I double-text if they haven't replied in 24 hours?",
    left: { id: "left", label: "No (chill)" },
    right: { id: "right", label: "Yes (send it)" },
    votes: { left: 45, right: 23 },
    meta: { category: "Social", createdBy: "You" },
    createdAt: "2024-01-10",
  },
  {
    id: "q3",
    title: "Food",
    prompt: "Pick my late-night order.",
    left: {
      id: "left",
      label: "Sushi",
      imageUrl: "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1200&q=80",
    },
    right: {
      id: "right",
      label: "Tacos",
      imageUrl: "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=1200&q=80",
    },
    votes: { left: 3, right: 5 },
    meta: { category: "Food", createdBy: "You" },
    createdAt: "2024-01-05",
  },
  {
    id: "q4",
    title: "Weekend plans",
    prompt: "What should I do this weekend?",
    left: { id: "left", label: "Stay home" },
    right: { id: "right", label: "Go out" },
    votes: { left: 8, right: 15 },
    meta: { category: "Social", createdBy: "Anonymous" },
    createdAt: "2024-01-20",
  },
  {
    id: "q5",
    title: "Career move",
    prompt: "Should I take the new job offer?",
    left: { id: "left", label: "Yes, take it" },
    right: { id: "right", label: "No, stay put" },
    votes: { left: 22, right: 18 },
    meta: { category: "Career", createdBy: "Anonymous" },
    createdAt: "2024-01-19",
  },
  {
    id: "q6",
    title: "Travel destination",
    prompt: "Where should I go on vacation?",
    left: { id: "left", label: "Beach" },
    right: { id: "right", label: "Mountains" },
    votes: { left: 12, right: 20 },
    meta: { category: "Travel", createdBy: "Anonymous" },
    createdAt: "2024-01-18",
  },
  {
    id: "q7",
    title: "Morning routine",
    prompt: "What's the best way to start the day?",
    left: { id: "left", label: "Exercise" },
    right: { id: "right", label: "Sleep in" },
    votes: { left: 30, right: 10 },
    meta: { category: "Health", createdBy: "Anonymous" },
    createdAt: "2024-01-17",
  },
];

const MOCK_VOTE_HISTORY: VoteHistoryItem[] = [
  {
    questionId: "q4",
    questionTitle: "Weekend plans",
    direction: "right",
    votedAt: "2024-01-20",
  },
  {
    questionId: "q5",
    questionTitle: "Career move",
    direction: "left",
    votedAt: "2024-01-19",
  },
  {
    questionId: "q6",
    questionTitle: "Travel destination",
    direction: "right",
    votedAt: "2024-01-18",
  },
  {
    questionId: "q7",
    questionTitle: "Morning routine",
    direction: "left",
    votedAt: "2024-01-17",
  },
];

const MiniVoteBar: React.FC<{
  leftVotes: number;
  rightVotes: number;
  leftLabel: string;
  rightLabel: string;
}> = ({ leftVotes, rightVotes, leftLabel, rightLabel }) => {
  const total = leftVotes + rightVotes;
  
  if (total === 0) {
    return (
      <View
        style={{
          height: 28,
          borderRadius: 6,
          backgroundColor: "#0f0f0f",
          borderWidth: 1,
          borderColor: "#333",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#666", fontSize: 11 }}>No votes yet</Text>
      </View>
    );
  }

  const percentages = getNormalizedPercentages(leftVotes, rightVotes, total);
  const leftWidth = percentages.left;
  const rightWidth = percentages.right;

  return (
    <View
      style={{
        height: 28,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: "#0f0f0f",
        borderWidth: 1,
        borderColor: "#333",
        flexDirection: "row",
      }}
    >
      {leftWidth > 0 && (
        <View
          style={{
            width: `${leftWidth}%`,
            backgroundColor: "rgba(59, 130, 246, 0.2)",
            borderRightWidth: rightWidth > 0 ? 1 : 0,
            borderRightColor: "#333",
            paddingHorizontal: 8,
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          <Text
            style={{
              color: "#60a5fa",
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {percentages.left}% {leftLabel}
          </Text>
        </View>
      )}
      {rightWidth > 0 && (
        <View
          style={{
            width: `${rightWidth}%`,
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            paddingHorizontal: 8,
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <Text
            style={{
              color: "#f87171",
              fontSize: 11,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {percentages.right}% {rightLabel}
          </Text>
        </View>
      )}
    </View>
  );
};

const StatsCard: React.FC<{ label: string; value: number; icon: keyof typeof Octicons.glyphMap }> = ({
  label,
  value,
  icon,
}) => (
  <View
    style={{
      backgroundColor: "#1c1c1c",
      borderRadius: 8,
      padding: 8,
      borderWidth: 1,
      borderColor: "#333",
      flex: 1,
      minWidth: 0,
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
      <Octicons name={icon} size={12} color="#aaa" style={{ marginRight: 4 }} />
      <Text style={{ color: "#aaa", fontSize: 10, fontWeight: "500" }}>{label}</Text>
    </View>
    <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>{value}</Text>
  </View>
);

const ProfileHeader: React.FC<{
  stats: typeof MOCK_USER_STATS;
  onEditPress: () => void;
  onSignOut: () => void;
  onFollowersPress: () => void;
  onFollowingPress: () => void;
}> = ({ stats, onEditPress, onSignOut, onFollowersPress, onFollowingPress }) => {
  const { user } = useUser();

  return (
    <View
      style={{
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 24,
        marginBottom: 12,
        backgroundColor: "black",
        borderBottomWidth: 1,
        borderBottomColor: "#333",
        justifyContent: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "stretch", marginTop: 12, marginBottom: 16, minHeight: 80 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#1c1c1c",
            borderWidth: 2,
            borderColor: "#333",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 16,
            overflow: "hidden",
          }}
        >
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: "white",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: "black",
                }}
              />
            </View>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
            {user?.username || user?.firstName || "User"}
          </Text>
          {user?.username && user?.firstName && (
            <Text style={{ color: "#aaa", fontSize: 14, marginBottom: 8 }}>
              {user.firstName}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable onPress={onFollowersPress}>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{stats.followers}</Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>followers</Text>
            </Pressable>
            <Pressable onPress={onFollowingPress}>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{stats.following}</Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>following</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: "column", gap: 8, justifyContent: "center" }}>
          <Pressable
            onPress={onEditPress}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#333",
              backgroundColor: pressed ? "#1c1c1c" : "transparent",
            })}
          >
            <Octicons name="pencil" size={16} color="#aaa" />
          </Pressable>
          <Pressable
            onPress={onSignOut}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#333",
              backgroundColor: pressed ? "#1c1c1c" : "transparent",
            })}
          >
            <Octicons name="sign-out" size={16} color="#ff6b6b" />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatsCard label="Questions" value={stats.questionsCreated} icon="question" />
        <StatsCard label="Votes Cast" value={stats.totalVotesCast} icon="check-circle" />
        <StatsCard label="Votes Received" value={stats.totalEngagement} icon="flame" />
      </View>
    </View>
  );
};

const UserListItem: React.FC<{ user: User }> = ({ user }) => {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: "/user-profile",
          params: { username: user.username, userId: user.id },
        });
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#222",
        backgroundColor: pressed ? "#1c1c1c" : "transparent",
      })}
    >
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: user.avatarUrl ? "transparent" : "#333",
        marginRight: 12,
        overflow: "hidden",
      }}
    >
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={{ width: 48, height: 48 }} />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            backgroundColor: "#333",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#aaa", fontSize: 18, fontWeight: "600" }}>
            {(user.firstName || user.username || "U")[0].toUpperCase()}
          </Text>
        </View>
      )}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
        {user.username || (user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || "User")}
      </Text>
      {user.username && user.firstName && (
        <Text style={{ color: "#aaa", fontSize: 14 }}>
          {user.firstName}{user.lastName ? ` ${user.lastName}` : ""}
        </Text>
      )}
    </View>
    </Pressable>
  );
};

const MyQuestionCard: React.FC<{
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

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <Text style={{ color: "#666", fontSize: 12 }}>
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"} • {formatDate(question.createdAt)}
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
              <Octicons name="pencil" size={16} color="#aaa" />
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
              <Octicons name="trash" size={16} color="#ff6b6b" />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const VoteHistoryItemCard: React.FC<{ item: VoteHistoryItem; question: Question | null; onPress: () => void }> = ({ item, question, onPress }) => {
  const votes = question?.votes ?? { left: 0, right: 0 };
  const totalVotes = votes.left + votes.right;
  const userVoteCount = item.direction === "left" ? votes.left : votes.right;
  const otherVoteCount = item.direction === "left" ? votes.right : votes.left;
  const userPercentage = totalVotes > 0 ? Math.round((userVoteCount / totalVotes) * 100) : 0;
  const isMajority = userVoteCount >= otherVoteCount && totalVotes > 0;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "#1c1c1c",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#333",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1 }}>
        {question?.meta?.category && (
          <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>{question.meta.category}</Text>
        )}
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600", marginBottom: 10 }}>{item.questionTitle}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: item.direction === "left" ? "rgba(59, 130, 246, 0.2)" : "rgba(239, 68, 68, 0.2)",
              borderWidth: 1,
              borderColor: item.direction === "left" ? "rgba(59, 130, 246, 0.4)" : "rgba(239, 68, 68, 0.4)",
              alignSelf: "flex-start",
            }}
          >
            <Text
              style={{
                color: item.direction === "left" ? "#60a5fa" : "#f87171",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Swiped {item.direction === "left" ? "Left" : "Right"}
            </Text>
          </View>
          {totalVotes > 0 && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: isMajority ? "rgba(34, 197, 94, 0.2)" : "rgba(234, 179, 8, 0.2)",
                borderWidth: 1,
                borderColor: isMajority ? "rgba(34, 197, 94, 0.4)" : "rgba(234, 179, 8, 0.4)",
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{
                  color: isMajority ? "#4ade80" : "#fbbf24",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isMajority ? "Majority" : "Minority"} • {userPercentage}%
              </Text>
            </View>
          )}
        </View>
      </View>
      <Octicons name="chevron-right" size={20} color="#666" />
    </Pressable>
  );
};

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const ANIMATION_DURATION = 200;
const TAB_ANIMATION_DURATION = 250;

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { registerResetCallback, unregisterResetCallback } = useProfileTabReset();
  const [activeTab, setActiveTab] = useState<"questions" | "history">("questions");
  const [myQuestions, setMyQuestions] = useState(MOCK_MY_QUESTIONS);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editLeftChoice, setEditLeftChoice] = useState("");
  const [editRightChoice, setEditRightChoice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [editPromptImage, setEditPromptImage] = useState<ImageInfo | null>(null);
  const [editLeftImage, setEditLeftImage] = useState<ImageInfo | null>(null);
  const [editRightImage, setEditRightImage] = useState<ImageInfo | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [cardDisplayIndex, setCardDisplayIndex] = useState(0);
  const [cardOpacity, setCardOpacity] = useState(1);
  const [profileView, setProfileView] = useState<"profile" | "followers" | "following">("profile");
  const [followersFollowingSearch, setFollowersFollowingSearch] = useState("");

  const cardPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardEntryScale = useRef(new Animated.Value(1)).current;

  const screenWidth = Dimensions.get("window").width;
  const tabIndicatorPosition = useRef(new Animated.Value(activeTab === "questions" ? 0 : 1)).current;
  const tabContainerInnerWidth = screenWidth - 48 - 2 - 8;
  const tabIndicatorWidth = tabContainerInnerWidth / 2;
  const followersFollowingTabIndicator = useRef(new Animated.Value(0)).current;
  const followersFollowingOpacity = useRef(new Animated.Value(0)).current;
  const followersFollowingTranslateY = useRef(new Animated.Value(20)).current;
  const profileViewOpacity = useRef(new Animated.Value(1)).current;
  const profileViewTranslateY = useRef(new Animated.Value(0)).current;
  const prevProfileViewRef = useRef<"profile" | "followers" | "following">("profile");
  
  useEffect(() => {
    Animated.timing(tabIndicatorPosition, {
      toValue: activeTab === "questions" ? 0 : 1,
      useNativeDriver: false,
      duration: TAB_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [activeTab, tabIndicatorPosition]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await signOut();
            router.replace("/(auth)");
          } catch (error) {
            console.error("Sign out error:", error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
      },
    ]);
  };

  const handleEditProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pickImage = async (setImage: (image: ImageInfo | null) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImage({
        uri: result.assets[0].uri,
        width: result.assets[0].width,
        height: result.assets[0].height,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const clearEditState = useCallback(() => {
    setEditingQuestion(null);
    setEditTitle("");
    setEditPrompt("");
    setEditLeftChoice("");
    setEditRightChoice("");
    setEditCategory("");
    setEditPromptImage(null);
    setEditLeftImage(null);
    setEditRightImage(null);
  }, []);

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setEditTitle(question.title);
    setEditPrompt(question.prompt);
    setEditLeftChoice(question.left.label);
    setEditRightChoice(question.right.label);
    setEditCategory(question.meta?.category || "");
    setEditPromptImage(question.promptImageUrl ? { uri: question.promptImageUrl } : null);
    setEditLeftImage(question.left.imageUrl ? { uri: question.left.imageUrl } : null);
    setEditRightImage(question.right.imageUrl ? { uri: question.right.imageUrl } : null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = () => {
    if (editingQuestion && editTitle.trim() && editPrompt.trim() && editLeftChoice.trim() && editRightChoice.trim()) {
      setMyQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id
            ? {
                ...q,
                title: editTitle.trim(),
                prompt: editPrompt.trim(),
                promptImageUrl: editPromptImage?.uri,
                left: {
                  ...q.left,
                  label: editLeftChoice.trim(),
                  imageUrl: editLeftImage?.uri,
                },
                right: {
                  ...q.right,
                  label: editRightChoice.trim(),
                  imageUrl: editRightImage?.uri,
                },
                meta: {
                  ...q.meta,
                  category: editCategory.trim() || undefined,
                },
              }
            : q
        )
      );
      clearEditState();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCancelEdit = clearEditState;

  const handleDeleteQuestion = (questionId: string) => {
    Alert.alert("Delete Question", "Are you sure you want to delete this question?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setMyQuestions((prev) => prev.filter((q) => q.id !== questionId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const handleQuestionPress = (question: Question) => {
    const foundIndex = myQuestions.findIndex((q) => q.id === question.id);
    if (foundIndex >= 0) {
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      setCardOpacity(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleBackToList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    cardPosition.setValue({ x: 0, y: 0 });
  }, [cardPosition]);

  const resetToRoot = useCallback(() => {
    if (profileView !== "profile") {
      setProfileView("profile");
      return true;
    }
    if (viewMode === "card") {
      handleBackToList();
      return true;
    }
    if (editingQuestion) {
      clearEditState();
      return true;
    }
    return false;
  }, [profileView, viewMode, editingQuestion, handleBackToList, clearEditState]);

  useEffect(() => {
    registerResetCallback(resetToRoot);
    return () => unregisterResetCallback();
  }, [registerResetCallback, unregisterResetCallback, resetToRoot]);

  useEffect(() => {
    const prevProfileView = prevProfileViewRef.current;
    const isTransitioningToFollowersFollowing = (prevProfileView === "profile" && (profileView === "followers" || profileView === "following"));
    const isTransitioningToProfile = ((prevProfileView === "followers" || prevProfileView === "following") && profileView === "profile");
    const isTogglingBetweenFollowersFollowing = (prevProfileView === "followers" && profileView === "following") || (prevProfileView === "following" && profileView === "followers");

    if (isTransitioningToFollowersFollowing) {
      const currentTab = profileView === "followers" ? 0 : 1;
      
      followersFollowingOpacity.setValue(0);
      followersFollowingTranslateY.setValue(20);
      profileViewOpacity.setValue(1);
      profileViewTranslateY.setValue(0);
      
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(followersFollowingTabIndicator, {
            toValue: currentTab,
            useNativeDriver: false,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(followersFollowingOpacity, {
            toValue: 1,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(followersFollowingTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(profileViewOpacity, {
            toValue: 0,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(profileViewTranslateY, {
            toValue: -20,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
        ]).start();
      });
    } else if (isTransitioningToProfile) {
      followersFollowingOpacity.setValue(1);
      followersFollowingTranslateY.setValue(0);
      profileViewOpacity.setValue(0);
      profileViewTranslateY.setValue(-20);
      
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(followersFollowingOpacity, {
            toValue: 0,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(followersFollowingTranslateY, {
            toValue: 20,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(profileViewOpacity, {
            toValue: 1,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(profileViewTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            duration: TAB_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
        ]).start();
      });
    } else if (isTogglingBetweenFollowersFollowing) {
      const currentTab = profileView === "followers" ? 0 : 1;
      Animated.timing(followersFollowingTabIndicator, {
        toValue: currentTab,
        useNativeDriver: false,
        duration: TAB_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
      }).start();
    }

    prevProfileViewRef.current = profileView;
  }, [profileView, followersFollowingTabIndicator, followersFollowingOpacity, followersFollowingTranslateY, profileViewOpacity, profileViewTranslateY]);

  const resetCard = useCallback(() => {
    Animated.timing(cardPosition, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [cardPosition]);

  const getQuestionsForTab = useCallback(() => {
    return activeTab === "questions" 
      ? myQuestions 
      : MOCK_VOTE_HISTORY.map((item) => {
          const q = myQuestions.find((q) => q.id === item.questionId);
          return q || myQuestions[0];
        });
  }, [activeTab, myQuestions]);

  const navigateCard = useCallback(
    (direction: "left" | "right") => {
      const questions = getQuestionsForTab();
      const isFirst = cardDisplayIndex === 0;
      const isLast = cardDisplayIndex === questions.length - 1;

      if ((direction === "right" && isFirst) || (direction === "left" && isLast)) {
        resetCard();
        return;
      }

      const nextIdx = direction === "left" 
        ? (cardDisplayIndex + 1) % questions.length
        : cardDisplayIndex === 0 ? questions.length - 1 : cardDisplayIndex - 1;

      setCardOpacity(0);
      setCardDisplayIndex(nextIdx);
    },
    [cardDisplayIndex, getQuestionsForTab, resetCard]
  );

  const forceSwipe = useCallback(
    (direction: "left" | "right") => {
      const x = direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      Animated.timing(cardPosition, {
        toValue: { x, y: 0 },
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }).start(() => {
        navigateCard(direction);
      });
    },
    [cardPosition, navigateCard]
  );

  const cardPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          if (dy > dx) return false;
          return dx > HORIZONTAL_ACTIVATION_DX;
        },
        onPanResponderMove: (_, gesture) => {
          cardPosition.setValue({ x: gesture.dx, y: 0 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            forceSwipe("right");
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            forceSwipe("left");
          } else {
            resetCard();
          }
        },
        onPanResponderTerminate: () => {
          resetCard();
        },
      }),
    [resetCard, forceSwipe, cardPosition]
  );

  useEffect(() => {
    if (viewMode === "card") {
      cardPosition.setValue({ x: 0, y: 0 });
      cardEntryScale.setValue(0.98);
      setCardOpacity(0);
      requestAnimationFrame(() => {
        setCardOpacity(1);
        Animated.timing(cardEntryScale, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    }
  }, [cardDisplayIndex, cardEntryScale, cardPosition, viewMode]);

  useEffect(() => {
    const listenerId = cardPosition.x.addListener(({ value }) => {
      const absDx = Math.abs(value);
      if (absDx >= SWIPE_OUT_DISTANCE * 0.8) {
        setCardOpacity(0);
      } else if (absDx < SWIPE_OUT_DISTANCE * 0.1) {
        setCardOpacity(1);
      }
    });

    return () => {
      cardPosition.x.removeListener(listenerId);
    };
  }, [cardPosition.x]);

  const cardRotate = cardPosition.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  const cardStyle = {
    transform: [{ translateX: cardPosition.x }, { rotate: cardRotate }],
  };

  const handleVoteHistoryPress = (item: VoteHistoryItem) => {
    const foundIndex = MOCK_VOTE_HISTORY.findIndex((v) => v.questionId === item.questionId);
    if (foundIndex >= 0) {
      setActiveTab("history");
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      setCardOpacity(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  if (viewMode === "card") {
    const questions = getQuestionsForTab();
    const question = questions[cardDisplayIndex] ?? null;

    if (!question) {
      return (
        <View style={{ flex: 1, backgroundColor: "black", padding: 24, justifyContent: "center" }}>
          <Text style={{ color: "white" }}>No questions</Text>
        </View>
      );
    }

    const currentVotes = question.votes ?? { left: 0, right: 0 };
    const currentTotal = currentVotes.left + currentVotes.right;
    const percentages = getNormalizedPercentages(currentVotes.left, currentVotes.right, currentTotal);
    const leftPercentage = percentages.left;
    const rightPercentage = percentages.right;

    const userVote = activeTab === "history" && cardDisplayIndex < MOCK_VOTE_HISTORY.length
      ? MOCK_VOTE_HISTORY[cardDisplayIndex]?.direction
      : null;

    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        <View
          style={{
            position: "absolute",
            bottom: 16,
            left: 24,
            right: 24,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={handleBackToList}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: pressed ? "#333" : "transparent",
              backgroundColor: pressed ? "#1c1c1c" : "transparent",
              minWidth: 60,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <Octicons name="arrow-left" size={24} color="#aaa" />
              <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4, fontWeight: "500" }}>Back</Text>
            </View>
          </Pressable>
          <View style={{ minWidth: 60 }} />
          <View style={{ minWidth: 60 }} />
        </View>

        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Animated.View
            key={`${question.id}-${cardDisplayIndex}`}
            {...cardPanResponder.panHandlers}
            style={[
              {
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "#333",
                backgroundColor: "#0f0f0f",
                overflow: "hidden",
                opacity: cardOpacity,
              },
              cardStyle,
              { transform: [...cardStyle.transform, { scale: cardEntryScale }] },
            ]}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#222" }}>
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta?.category ?? "General"}
                {question.meta?.createdBy ? ` • ${question.meta.createdBy}` : ""}
              </Text>
              <Text style={{ color: "white", fontSize: 20, fontWeight: "800", marginTop: 6 }}>
                {question.title}
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: 260 }}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              nestedScrollEnabled
            >
              <Text style={{ color: "white", fontSize: 16, lineHeight: 22 }}>{question.prompt}</Text>

              {question.promptImageUrl && (
                <Image
                  source={{ uri: question.promptImageUrl }}
                  style={{ width: "100%", height: 180, borderRadius: 16 }}
                />
              )}
            </ScrollView>

            <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: userVote === "left" ? 2 : 1,
                  borderColor: userVote === "left" ? "rgba(59, 130, 246, 0.6)" : "#333",
                  backgroundColor: "#1c1c1c",
                  overflow: "visible",
                  position: "relative",
                }}
              >
                {userVote === "left" && (
                  <View
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      backgroundColor: "rgba(59, 130, 246, 0.9)",
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10,
                    }}
                  >
                    <Octicons name="check" size={14} color="white" />
                  </View>
                )}
                <View style={{ position: "relative", padding: 12, overflow: "hidden", borderRadius: 18 }}>
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${leftPercentage}%`,
                      backgroundColor: userVote === "left" ? "rgba(59, 130, 246, 0.25)" : "rgba(255, 255, 255, 0.15)",
                      borderRadius: 18,
                      opacity: 1,
                    }}
                  />
                  <View style={{ position: "relative", zIndex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          flex: 1,
                        }}
                      >
                        {question.left.imageUrl && (
                          <Image source={{ uri: question.left.imageUrl }} style={{ width: 44, height: 44, borderRadius: 12 }} />
                        )}
                        <Text
                          style={{
                            color: userVote === "left" ? "#60a5fa" : "white",
                            fontSize: 16,
                            fontWeight: "700",
                            textAlign: "left",
                          }}
                        >
                          {question.left.label}
                        </Text>
                      </View>
                      <View
                        style={{
                          alignItems: "flex-end",
                          minWidth: 65,
                          opacity: 1,
                        }}
                      >
                        <Text
                          style={{
                            color: "#aaa",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {leftPercentage}%
                        </Text>
                        <Text
                          style={{
                            color: "#aaa",
                            fontSize: 12,
                            fontWeight: "500",
                          }}
                        >
                          ({currentVotes.left} {currentVotes.left === 1 ? "vote" : "votes"})
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View
                style={{
                  borderRadius: 18,
                  borderWidth: userVote === "right" ? 2 : 1,
                  borderColor: userVote === "right" ? "rgba(239, 68, 68, 0.6)" : "#333",
                  backgroundColor: "#1c1c1c",
                  overflow: "visible",
                  position: "relative",
                }}
              >
                {userVote === "right" && (
                  <View
                    style={{
                      position: "absolute",
                      top: -8,
                      left: -8,
                      backgroundColor: "rgba(239, 68, 68, 0.9)",
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10,
                    }}
                  >
                    <Octicons name="check" size={14} color="white" />
                  </View>
                )}
                <View style={{ position: "relative", padding: 12, overflow: "hidden", borderRadius: 18 }}>
                  <View
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${rightPercentage}%`,
                      backgroundColor: userVote === "right" ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.15)",
                      borderRadius: 18,
                      opacity: 1,
                    }}
                  />
                  <View style={{ position: "relative", zIndex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row-reverse",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 12,
                          flex: 1,
                        }}
                      >
                        {question.right.imageUrl && (
                          <Image source={{ uri: question.right.imageUrl }} style={{ width: 44, height: 44, borderRadius: 12 }} />
                        )}
                        <Text
                          style={{
                            color: userVote === "right" ? "#f87171" : "white",
                            fontSize: 16,
                            fontWeight: "700",
                            textAlign: "right",
                          }}
                        >
                          {question.right.label}
                        </Text>
                      </View>
                      <View
                        style={{
                          alignItems: "flex-start",
                          minWidth: 65,
                          opacity: 1,
                        }}
                      >
                        <Text
                          style={{
                            color: "#aaa",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {rightPercentage}%
                        </Text>
                        <Text
                          style={{
                            color: "#aaa",
                            fontSize: 12,
                            fontWeight: "500",
                          }}
                        >
                          ({currentVotes.right} {currentVotes.right === 1 ? "vote" : "votes"})
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <Text style={{ color: "#777", fontSize: 12 }}>
                Tip: Swipe left or right to navigate between questions.
              </Text>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  const currentTab = profileView === "followers" ? "followers" : "following";
  const allUsers = profileView === "followers" ? MOCK_FOLLOWERS : profileView === "following" ? MOCK_FOLLOWING : [];
  
  const filteredUsers = allUsers.filter((user) => {
    if (!followersFollowingSearch.trim()) return true;
    const searchLower = followersFollowingSearch.toLowerCase();
    const fullName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}`.toLowerCase()
      : (user.firstName || user.username || "").toLowerCase();
    const username = user.username.toLowerCase();
    return fullName.includes(searchLower) || username.includes(searchLower);
  });

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {(profileView === "followers" || profileView === "following") && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: followersFollowingOpacity,
            transform: [{ translateY: followersFollowingTranslateY }],
            zIndex: profileView === "followers" || profileView === "following" ? 1 : 0,
          }}
          pointerEvents={profileView === "followers" || profileView === "following" ? "auto" : "none"}
        >
          <View
            style={{
              paddingTop: 60,
              paddingBottom: 8,
              paddingHorizontal: 24,
              borderBottomWidth: 1,
              borderBottomColor: "#333",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Pressable
              onPress={() => {
                setProfileView("profile");
                setFollowersFollowingSearch("");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: pressed ? "#333" : "transparent",
                backgroundColor: pressed ? "#1c1c1c" : "transparent",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Octicons name="chevron-left" size={20} color="#aaa" />
            </Pressable>
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700", flex: 1 }}>People</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={{ paddingHorizontal: 24, marginTop: 16, marginBottom: 12 }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#1c1c1c",
              borderRadius: 12,
              padding: 4,
              borderWidth: 1,
              borderColor: "#333",
              position: "relative",
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                top: 4,
                bottom: 4,
                left: 4,
                width: tabIndicatorWidth,
                transform: [
                  {
                    translateX: followersFollowingTabIndicator.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, tabIndicatorWidth],
                    }),
                  },
                ],
                backgroundColor: "#fff",
                borderRadius: 8,
              }}
            />
            <Pressable
              onPress={() => {
                setProfileView("followers");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                zIndex: 1,
              }}
            >
              <Animated.Text
                style={{
                  color: followersFollowingTabIndicator.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ["#000", "#aaa", "#aaa"],
                  }),
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Followers
              </Animated.Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setProfileView("following");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                zIndex: 1,
              }}
            >
              <Animated.Text
                style={{
                  color: followersFollowingTabIndicator.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ["#aaa", "#aaa", "#000"],
                  }),
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Following
              </Animated.Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, marginBottom: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#1c1c1c",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: "#333",
              gap: 8,
              minHeight: 44,
              maxHeight: 44,
            }}
          >
            <Octicons name="search" size={18} color="#666" />
            <TextInput
              value={followersFollowingSearch}
              onChangeText={setFollowersFollowingSearch}
              placeholder="Search..."
              placeholderTextColor="#666"
              style={{
                flex: 1,
                color: "white",
                fontSize: 16,
                padding: 0,
                margin: 0,
              }}
            />
            {followersFollowingSearch.length > 0 && (
              <Pressable
                onPress={() => setFollowersFollowingSearch("")}
                style={{ padding: 4 }}
              >
                <Octicons name="x" size={18} color="#666" />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <UserListItem key={user.id} user={user} />
            ))
          ) : (
            <View style={{ alignItems: "center", padding: 32 }}>
              <Octicons name="search" size={48} color="#666" style={{ marginBottom: 16 }} />
              <Text style={{ color: "#666", fontSize: 16 }}>
                No {currentTab === "followers" ? "followers" : "following"} found
              </Text>
            </View>
          )}
        </ScrollView>
        </Animated.View>
      )}

      <Animated.View
        style={{
          flex: 1,
          opacity: profileViewOpacity,
          transform: [{ translateY: profileViewTranslateY }],
          zIndex: profileView === "profile" ? 1 : 0,
        }}
        pointerEvents={profileView === "profile" ? "auto" : "none"}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isCategoryDropdownOpen}
          keyboardShouldPersistTaps="always"
        >
          <ProfileHeader
          onEditPress={handleEditProfile}
          onSignOut={handleSignOut}
          onFollowersPress={() => {
            setProfileView("followers");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          onFollowingPress={() => {
            setProfileView("following");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          stats={MOCK_USER_STATS}
        />
        
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ marginBottom: 12 }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#1c1c1c",
              borderRadius: 12,
              padding: 4,
              borderWidth: 1,
              borderColor: "#333",
              marginBottom: 0,
              position: "relative",
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                top: 4,
                bottom: 4,
                left: 4,
                width: tabIndicatorWidth,
                transform: [
                  {
                    translateX: tabIndicatorPosition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, tabIndicatorWidth],
                    }),
                  },
                ],
                backgroundColor: "#fff",
                borderRadius: 8,
              }}
            />
            <Pressable
              onPress={() => {
                setActiveTab("questions");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                zIndex: 1,
              }}
            >
              <Animated.Text
                style={{
                  color: tabIndicatorPosition.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ["#000", "#aaa", "#aaa"],
                  }),
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                My Questions
              </Animated.Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActiveTab("history");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                zIndex: 1,
              }}
            >
              <Animated.Text
                style={{
                  color: tabIndicatorPosition.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ["#aaa", "#aaa", "#000"],
                  }),
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Voting History
              </Animated.Text>
            </Pressable>
          </View>
          </View>

          <View style={{ overflow: "hidden", marginHorizontal: -24 }}>
            {activeTab === "questions" ? (
              <View style={{ paddingHorizontal: 24 }}>
                {myQuestions.length > 0 ? (
                  myQuestions.map((question) => {
                    if (editingQuestion && editingQuestion.id === question.id) {
                      return (
                        <KeyboardAvoidingView
                          key={question.id}
                          behavior={Platform.OS === "ios" ? "padding" : undefined}
                          style={{ marginBottom: 12 }}
                        >
                          <ScrollView
                            contentContainerStyle={{ paddingBottom: 24 }}
                            keyboardShouldPersistTaps="always"
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={!isCategoryDropdownOpen}
                          >
                            <View
                              style={{
                                borderRadius: 24,
                                borderWidth: 1,
                                borderColor: "#333",
                                backgroundColor: "#0f0f0f",
                                overflow: "hidden",
                              }}
                            >
                              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#222" }}>
                                <View style={{ marginBottom: 8 }}>
                                  <AutocompleteInput
                                    value={editCategory}
                                    onChangeText={setEditCategory}
                                    placeholder="Category (optional)"
                                    suggestions={SUGGESTED_CATEGORIES}
                                    onDropdownOpen={() => setIsCategoryDropdownOpen(true)}
                                    onDropdownClose={() => setIsCategoryDropdownOpen(false)}
                                    style={{
                                      width: "100%",
                                      color: "#aaa",
                                      fontSize: 12,
                                      padding: 8,
                                      backgroundColor: "#1c1c1c",
                                      borderRadius: 6,
                                      borderWidth: 1,
                                      borderColor: "#333",
                                    }}
                                  />
                                </View>
                                <TextInput
                                  value={editTitle}
                                  onChangeText={setEditTitle}
                                  placeholder="Question Title"
                                  placeholderTextColor="#666"
                                  style={{
                                    color: "white",
                                    fontSize: 20,
                                    fontWeight: "800",
                                    padding: 10,
                                    backgroundColor: "#1c1c1c",
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    borderColor: "#333",
                                  }}
                                />
                              </View>

                              <View style={{ padding: 16, gap: 12 }}>
                                <View style={{ position: "relative", minHeight: 100 }}>
                                  <TextInput
                                    value={editPrompt}
                                    onChangeText={setEditPrompt}
                                    placeholder="What's your question?"
                                    placeholderTextColor="#666"
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                    style={{
                                      color: "white",
                                      fontSize: 16,
                                      lineHeight: 22,
                                      padding: 12,
                                      paddingRight: 48,
                                      paddingBottom: 48,
                                      minHeight: 100,
                                      backgroundColor: "#1c1c1c",
                                      borderRadius: 12,
                                      borderWidth: 1,
                                      borderColor: "#333",
                                    }}
                                  />
                                  <Pressable
                                    onPress={() => pickImage(setEditPromptImage)}
                                    style={{
                                      position: "absolute",
                                      bottom: 12,
                                      right: 12,
                                      width: 32,
                                      height: 32,
                                      borderRadius: 8,
                                      backgroundColor: "#262626",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <Octicons name="image" size={18} color="#aaa" />
                                  </Pressable>
                                </View>
                                {editPromptImage && (
                                  <View style={{ position: "relative" }}>
                                    <Image
                                      source={{ uri: editPromptImage.uri }}
                                      style={{ width: "100%", height: 180, borderRadius: 16 }}
                                    />
                                    <Pressable
                                      onPress={() => setEditPromptImage(null)}
                                      style={{
                                        position: "absolute",
                                        top: 8,
                                        right: 8,
                                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                                        borderRadius: 12,
                                        width: 24,
                                        height: 24,
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Octicons name="x" size={12} color="white" />
                                    </Pressable>
                                  </View>
                                )}

                                <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: "#222", paddingTop: 12 }}>
                                  <View
                                    style={{
                                      borderRadius: 18,
                                      borderWidth: 1,
                                      borderColor: "#333",
                                      backgroundColor: "#1c1c1c",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <View style={{ position: "relative", padding: 12 }}>
                                      <View
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          gap: 12,
                                        }}
                                      >
                                        <View style={{ position: "relative" }}>
                                          <Pressable
                                            onPress={() => pickImage(setEditLeftImage)}
                                            style={{
                                              width: 44,
                                              height: 44,
                                              borderRadius: 12,
                                              backgroundColor: "#0f0f0f",
                                              borderWidth: 1,
                                              borderColor: "#333",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              overflow: "hidden",
                                            }}
                                          >
                                            {editLeftImage ? (
                                              <Image
                                                source={{ uri: editLeftImage.uri }}
                                                style={{ width: 44, height: 44, borderRadius: 12 }}
                                              />
                                            ) : (
                                              <Octicons name="image" size={20} color="#666" />
                                            )}
                                          </Pressable>
                                          {editLeftImage && (
                                            <Pressable
                                              onPress={() => setEditLeftImage(null)}
                                              style={{
                                                position: "absolute",
                                                top: -4,
                                                right: -4,
                                                width: 20,
                                                height: 20,
                                                borderRadius: 10,
                                                backgroundColor: "rgba(0, 0, 0, 0.8)",
                                                borderWidth: 1,
                                                borderColor: "#333",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                zIndex: 1,
                                              }}
                                            >
                                              <Octicons name="x" size={10} color="white" />
                                            </Pressable>
                                          )}
                                        </View>
                                        <TextInput
                                          value={editLeftChoice}
                                          onChangeText={setEditLeftChoice}
                                          placeholder="Left Choice"
                                          placeholderTextColor="#666"
                                          style={{
                                            flex: 1,
                                            color: "white",
                                            fontSize: 16,
                                            fontWeight: "700",
                                            padding: 10,
                                            backgroundColor: "#0f0f0f",
                                            borderRadius: 6,
                                            borderWidth: 1,
                                            borderColor: "#333",
                                          }}
                                        />
                                      </View>
                                    </View>
                                  </View>

                                  <View
                                    style={{
                                      borderRadius: 18,
                                      borderWidth: 1,
                                      borderColor: "#333",
                                      backgroundColor: "#1c1c1c",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <View style={{ position: "relative", padding: 12 }}>
                                      <View
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          gap: 12,
                                        }}
                                      >
                                        <View style={{ position: "relative" }}>
                                          <Pressable
                                            onPress={() => pickImage(setEditRightImage)}
                                            style={{
                                              width: 44,
                                              height: 44,
                                              borderRadius: 12,
                                              backgroundColor: "#0f0f0f",
                                              borderWidth: 1,
                                              borderColor: "#333",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              overflow: "hidden",
                                            }}
                                          >
                                            {editRightImage ? (
                                              <Image
                                                source={{ uri: editRightImage.uri }}
                                                style={{ width: 44, height: 44, borderRadius: 12 }}
                                              />
                                            ) : (
                                              <Octicons name="image" size={20} color="#666" />
                                            )}
                                          </Pressable>
                                          {editRightImage && (
                                            <Pressable
                                              onPress={() => setEditRightImage(null)}
                                              style={{
                                                position: "absolute",
                                                top: -4,
                                                right: -4,
                                                width: 20,
                                                height: 20,
                                                borderRadius: 10,
                                                backgroundColor: "rgba(0, 0, 0, 0.8)",
                                                borderWidth: 1,
                                                borderColor: "#333",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                zIndex: 1,
                                              }}
                                            >
                                              <Octicons name="x" size={10} color="white" />
                                            </Pressable>
                                          )}
                                        </View>
                                        <TextInput
                                          value={editRightChoice}
                                          onChangeText={setEditRightChoice}
                                          placeholder="Right Choice"
                                          placeholderTextColor="#666"
                                          style={{
                                            flex: 1,
                                            color: "white",
                                            fontSize: 16,
                                            fontWeight: "700",
                                            padding: 10,
                                            backgroundColor: "#0f0f0f",
                                            borderRadius: 6,
                                            borderWidth: 1,
                                            borderColor: "#333",
                                          }}
                                        />
                                      </View>
                                    </View>
                                  </View>
                                </View>

                                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                                  <Pressable
                                    onPress={handleCancelEdit}
                                    style={({ pressed }) => ({
                                      flex: 1,
                                      backgroundColor: pressed ? "#2a2a2a" : "transparent",
                                      borderRadius: 12,
                                      padding: 16,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      borderWidth: 1,
                                      borderColor: "#333",
                                    })}
                                  >
                                    <Text style={{ color: "#aaa", fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={handleSaveEdit}
                                    style={({ pressed }) => ({
                                      flex: 1,
                                      backgroundColor: pressed ? "#e0e0e0" : "#fff",
                                      borderRadius: 12,
                                      padding: 16,
                                      alignItems: "center",
                                      justifyContent: "center",
                                    })}
                                  >
                                    <Text style={{ color: "#000", fontSize: 16, fontWeight: "700" }}>Save Changes</Text>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          </ScrollView>
                        </KeyboardAvoidingView>
                      );
                    }
                    return (
                      <MyQuestionCard
                        key={question.id}
                        question={question}
                        onPress={() => handleQuestionPress(question)}
                        onEdit={() => handleEditQuestion(question)}
                        onDelete={() => handleDeleteQuestion(question.id)}
                      />
                    );
                  })
                ) : (
                  <View style={{ alignItems: "center", padding: 32 }}>
                    <Octicons name="question" size={48} color="#666" style={{ marginBottom: 16 }} />
                    <Text style={{ color: "#666", fontSize: 16 }}>You haven&apos;t created any questions yet</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ paddingHorizontal: 24 }}>
                {MOCK_VOTE_HISTORY.length > 0 ? (
                  MOCK_VOTE_HISTORY.map((item) => {
                    const question = myQuestions.find((q) => q.id === item.questionId);
                    return (
                      <VoteHistoryItemCard
                        key={item.questionId}
                        item={item}
                        question={question || null}
                        onPress={() => handleVoteHistoryPress(item)}
                      />
                    );
                  })
                ) : (
                  <View style={{ alignItems: "center", padding: 32 }}>
                    <Octicons name="check-circle" size={48} color="#666" style={{ marginBottom: 16 }} />
                    <Text style={{ color: "#666", fontSize: 16 }}>You haven&apos;t voted on any questions yet</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      </Animated.View>
    </View>
  );
}
