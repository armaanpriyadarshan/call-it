import { FullScreenChoice } from "@/components/voting";
import { SUGGESTED_CATEGORIES } from "@/constants/categories";
import { useProfileTabReset } from "@/contexts/profile-tab-context";
import {
    useRealtimeFollows,
    useRealtimeUserQuestions,
    useRealtimeUserQuestionVotes,
    useRealtimeUserVotes,
} from "@/lib/hooks/useRealtime";
import {
    getFollowersWithProfiles,
    getFollowingWithProfiles,
    getUserStats,
} from "@/lib/queries/follows";
import { ensureProfile, getProfile } from "@/lib/queries/profiles";
import {
    Question as DbQuestion,
    deleteQuestion,
    getQuestion,
    getQuestions,
    updateQuestion,
} from "@/lib/queries/questions";
import {
    deleteVote,
    getTotalVotesOnUserQuestions,
    getUserVotesCastCount,
    getUserVotingHistory,
    getVoteCounts,
    VoteWithQuestion,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { ImageInfo, Question, User, VoteHistoryItem } from "@/types";
import { formatDate } from "@/utils/date";
import { getNormalizedPercentages } from "@/utils/voting";
import { useAuth, useSession, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
}> = ({
  value,
  onChangeText,
  placeholder,
  suggestions,
  style,
  onFocus,
  onBlur,
  onDropdownOpen,
  onDropdownClose,
}) => {
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
      const filtered = suggestions.filter((cat) =>
        cat.toLowerCase().includes(value.toLowerCase()),
      );
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
            keyboardShouldPersistTaps='always'
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
                  borderBottomWidth:
                    index < filteredSuggestions.length - 1 ? 1 : 0,
                  borderBottomColor: "#222",
                  backgroundColor: pressed ? "#2a2a2a" : "transparent",
                })}
              >
                <Text style={{ color: COLORS.text, fontSize: 16 }}>
                  {suggestion}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  voteCounts: Map<string, { left: number; right: number }>,
  isAnonymous: boolean,
): Question {
  const votes = voteCounts.get(dbQuestion.id) || { left: 0, right: 0 };

  return {
    id: dbQuestion.id,
    visibleUserId: dbQuestion.is_anonymous ? undefined : dbQuestion.user_id,
    title: dbQuestion.title,
    prompt: dbQuestion.prompt,
    promptImageUrl: dbQuestion.prompt_image_url || undefined,
    left: {
      id: "left",
      label: dbQuestion.left_choice_label,
      imageUrl: dbQuestion.left_choice_image_url || undefined,
    },
    right: {
      id: "right",
      label: dbQuestion.right_choice_label,
      imageUrl: dbQuestion.right_choice_image_url || undefined,
    },
    votes,
    meta: {
      category: dbQuestion.category || undefined,
      createdBy: dbQuestion.is_anonymous ? "Anonymous" : "You",
    },
    createdAt: dbQuestion.created_at,
    isOwnQuestion: true,
  };
}

function mapVoteHistoryItem(vote: VoteWithQuestion): VoteHistoryItem {
  return {
    questionId: vote.question_id,
    questionTitle: vote.question?.title || "Unknown Question",
    direction: vote.choice,
    votedAt: vote.created_at,
  };
}

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

const StatsCard: React.FC<{
  label: string;
  value: number;
  icon: keyof typeof Octicons.glyphMap;
}> = ({ label, value, icon }) => (
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
    <View
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}
    >
      <Octicons name={icon} size={12} color='#aaa' style={{ marginRight: 4 }} />
      <Text style={{ color: "#aaa", fontSize: 10, fontWeight: "500" }}>
        {label}
      </Text>
    </View>
    <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
      {value}
    </Text>
  </View>
);

interface UserStats {
  questionsCreated: number;
  totalVotesCast: number;
  totalEngagement: number;
  followers: number;
  following: number;
}

const ProfileHeader: React.FC<{
  stats: UserStats;
  onEditPress: () => void;
  onSignOut: () => void;
  onFollowersPress: () => void;
  onFollowingPress: () => void;
}> = ({
  stats,
  onEditPress,
  onSignOut,
  onFollowersPress,
  onFollowingPress,
}) => {
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          marginTop: 12,
          marginBottom: 16,
          minHeight: 80,
        }}
      >
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
              resizeMode='cover'
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
          <Text
            style={{
              color: "white",
              fontSize: 20,
              fontWeight: "700",
              marginBottom: 8,
            }}
          >
            {user?.username || user?.firstName || "User"}
          </Text>
          {user?.username && user?.firstName && (
            <Text style={{ color: "#aaa", fontSize: 14, marginBottom: 8 }}>
              {user.firstName}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable onPress={onFollowersPress}>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                {stats.followers}
              </Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>followers</Text>
            </Pressable>
            <Pressable onPress={onFollowingPress}>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                {stats.following}
              </Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>following</Text>
            </Pressable>
          </View>
        </View>
        <View
          style={{ flexDirection: "column", gap: 8, justifyContent: "center" }}
        >
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
            <Octicons name='pencil' size={16} color='#aaa' />
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
            <Octicons name='sign-out' size={16} color='#ff6b6b' />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatsCard
          label='Questions'
          value={stats.questionsCreated}
          icon='question'
        />
        <StatsCard
          label='Votes Cast'
          value={stats.totalVotesCast}
          icon='check-circle'
        />
        <StatsCard
          label='Votes Received'
          value={stats.totalEngagement}
          icon='flame'
        />
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
          <Image
            source={{ uri: user.avatarUrl }}
            style={{ width: 48, height: 48 }}
          />
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
          {user.username ||
            (user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.firstName || "User")}
        </Text>
        {user.username && user.firstName && (
          <Text style={{ color: "#aaa", fontSize: 14 }}>
            {user.firstName}
            {user.lastName ? ` ${user.lastName}` : ""}
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

const VoteHistoryItemCard: React.FC<{
  item: VoteHistoryItem;
  question: Question | null;
  onPress: () => void;
  onDelete: () => void;
}> = ({ item, question, onPress, onDelete }) => {
  const router = useRouter();
  const votes = question?.votes ?? { left: 0, right: 0 };
  const totalVotes = votes.left + votes.right;
  const userVoteCount = item.direction === "left" ? votes.left : votes.right;
  const otherVoteCount = item.direction === "left" ? votes.right : votes.left;
  const userPercentage =
    totalVotes > 0 ? Math.round((userVoteCount / totalVotes) * 100) : 0;
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
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 4,
          flexWrap: "wrap",
        }}
      >
        {question?.meta?.category && (
          <Text style={{ color: "#aaa", fontSize: 12 }}>
            {question.meta.category}
          </Text>
        )}
        {question?.meta?.createdBy && (
          <>
            {question?.meta?.category && (
              <Text style={{ color: "#aaa", fontSize: 12 }}> • </Text>
            )}
            {question.meta.createdBy !== "Anonymous" &&
            question.visibleUserId ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/user-profile",
                    params: {
                      username: question.meta?.createdBy,
                      userId: question.visibleUserId,
                    },
                  });
                }}
              >
                {({ pressed }) => (
                  <Text
                    style={{
                      color: "#aaa",
                      fontSize: 12,
                      textDecorationLine: pressed ? "underline" : "none",
                    }}
                  >
                    {question.meta?.createdBy}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta.createdBy}
              </Text>
            )}
          </>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <Text
          style={{
            color: "white",
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          {item.questionTitle}
        </Text>
        <Octicons
          name='chevron-right'
          size={16}
          color='#666'
          style={{ marginLeft: 4 }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            flex: 1,
          }}
        >
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor:
                item.direction === "left"
                  ? "rgba(59, 130, 246, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
              borderWidth: 1,
              borderColor:
                item.direction === "left"
                  ? "rgba(59, 130, 246, 0.4)"
                  : "rgba(239, 68, 68, 0.4)",
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
                backgroundColor: isMajority
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(234, 179, 8, 0.2)",
                borderWidth: 1,
                borderColor: isMajority
                  ? "rgba(34, 197, 94, 0.4)"
                  : "rgba(234, 179, 8, 0.4)",
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
  const { signOut, getToken } = useAuth();
  const { session } = useSession();
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    registerResetCallback,
    unregisterResetCallback,
    registerRefreshCallback,
    unregisterRefreshCallback,
  } = useProfileTabReset();

  const getTokenRef = useRef(getToken);
  const clerkUserRef = useRef(clerkUser);
  const supabaseRef = useRef<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);

  getTokenRef.current = getToken;
  clerkUserRef.current = clerkUser;

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClerkSupabaseClient({
        getToken: getTokenRef.current,
      });
    }
    return supabaseRef.current;
  }, []);

  const [supabase, setSupabase] = useState<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);

  useEffect(() => {
    if (clerkUser && !supabase) {
      setSupabase(getSupabase());
    }
  }, [clerkUser, supabase, getSupabase]);

  const [isLoading, setIsLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    questionsCreated: 0,
    totalVotesCast: 0,
    totalEngagement: 0,
    followers: 0,
    following: 0,
  });
  const [followers, setFollowers] = useState<User[]>([]);
  const [following, setFollowing] = useState<User[]>([]);
  const [voteHistory, setVoteHistory] = useState<VoteHistoryItem[]>([]);
  const [votedQuestions, setVotedQuestions] = useState<Question[]>([]);

  const [activeTab, setActiveTab] = useState<"questions" | "history">(
    "questions",
  );
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editLeftChoice, setEditLeftChoice] = useState("");
  const [editRightChoice, setEditRightChoice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [editPromptImage, setEditPromptImage] = useState<ImageInfo | null>(
    null,
  );
  const [editLeftImage, setEditLeftImage] = useState<ImageInfo | null>(null);
  const [editRightImage, setEditRightImage] = useState<ImageInfo | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [cardDisplayIndex, setCardDisplayIndex] = useState(0);
  const [profileView, setProfileView] = useState<
    "profile" | "followers" | "following"
  >("profile");
  const [followersFollowingSearch, setFollowersFollowingSearch] = useState("");

  const cardPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardEntryScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardDisplayIndexRef = useRef(cardDisplayIndex);
  cardDisplayIndexRef.current = cardDisplayIndex;
  // Static animated values for results display
  const leftBarWidth = useRef(new Animated.Value(0)).current;
  const rightBarWidth = useRef(new Animated.Value(0)).current;

  const screenWidth = Dimensions.get("window").width;
  const tabIndicatorPosition = useRef(
    new Animated.Value(activeTab === "questions" ? 0 : 1),
  ).current;
  const tabContainerInnerWidth = screenWidth - 48 - 2 - 8;
  const tabIndicatorWidth = tabContainerInnerWidth / 2;
  const followersFollowingTabIndicator = useRef(new Animated.Value(0)).current;
  const followersFollowingOpacity = useRef(new Animated.Value(0)).current;
  const followersFollowingTranslateY = useRef(new Animated.Value(20)).current;
  const profileViewOpacity = useRef(new Animated.Value(1)).current;
  const profileViewTranslateY = useRef(new Animated.Value(0)).current;
  const prevProfileViewRef = useRef<"profile" | "followers" | "following">(
    "profile",
  );

  useEffect(() => {
    Animated.timing(tabIndicatorPosition, {
      toValue: activeTab === "questions" ? 0 : 1,
      useNativeDriver: false,
      duration: TAB_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [activeTab, tabIndicatorPosition]);

  const fetchProfileData = useCallback(
    async (showLoading = true) => {
      const currentUser = clerkUserRef.current;
      if (!currentUser?.id) return;

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const supabase = getSupabase();

        await ensureProfile(supabase, {
          user_id: currentUser.id,
          username: currentUser.username || undefined,
          first_name: currentUser.firstName || undefined,
          last_name: currentUser.lastName || undefined,
          avatar_url: currentUser.imageUrl || undefined,
        });

        const stats = await getUserStats(supabase, currentUser.id);
        const votesCast = await getUserVotesCastCount(supabase, currentUser.id);
        const totalEngagement = await getTotalVotesOnUserQuestions(
          supabase,
          currentUser.id,
        );

        setUserStats({
          questionsCreated: stats.questions_count,
          totalVotesCast: votesCast,
          totalEngagement,
          followers: stats.followers_count,
          following: stats.following_count,
        });

        const dbQuestions = await getQuestions(supabase, {
          userId: currentUser.id,
          limit: 50,
        });

        if (dbQuestions.length > 0) {
          const questionIds = dbQuestions.map((q) => q.id);
          const voteCounts = await getVoteCounts(supabase, questionIds);

          const displayQuestions = dbQuestions.map((q) =>
            mapDbQuestionToQuestion(q, voteCounts, q.is_anonymous),
          );
          setMyQuestions(displayQuestions);
        } else {
          setMyQuestions([]);
        }

        const votingHistory = await getUserVotingHistory(
          supabase,
          currentUser.id,
          { limit: 50 },
        );
        setVoteHistory(votingHistory.map(mapVoteHistoryItem));

        const creatorIds = [
          ...new Set(
            votingHistory
              .filter((v) => v.question && !v.question.is_anonymous)
              .map((v) => v.question.user_id),
          ),
        ];
        const creatorProfiles = await Promise.all(
          creatorIds.map((id) => getProfile(supabase, id).catch(() => null)),
        );
        const creatorProfileMap = new Map<string, string | null>();
        creatorIds.forEach((id, i) => {
          const profile = creatorProfiles[i];
          let displayName: string | null = null;
          if (profile?.username) {
            displayName = profile.username.toLowerCase();
          } else if (profile?.first_name) {
            displayName = profile.first_name.toLowerCase();
          }
          creatorProfileMap.set(id, displayName);
        });

        const votedQuestionsFromHistory: Question[] = votingHistory
          .filter((v) => v.question)
          .map((v) => {
            let createdBy: string | undefined;
            if (v.question.is_anonymous) {
              createdBy = "Anonymous";
            } else {
              createdBy =
                creatorProfileMap.get(v.question.user_id) || undefined;
            }
            return {
              id: v.question_id,
              visibleUserId: v.question.is_anonymous
                ? undefined
                : v.question.user_id,
              title: v.question.title,
              prompt: v.question.prompt,
              promptImageUrl: v.question.prompt_image_url || undefined,
              left: {
                id: "left" as const,
                label: v.question.left_choice_label,
                imageUrl: v.question.left_choice_image_url || undefined,
              },
              right: {
                id: "right" as const,
                label: v.question.right_choice_label,
                imageUrl: v.question.right_choice_image_url || undefined,
              },
              votes: { left: 0, right: 0 },
              meta: {
                category: v.question.category || undefined,
                createdBy,
              },
              createdAt: v.created_at,
              hasVoted: true,
              userVote: v.choice,
            };
          });

        if (votedQuestionsFromHistory.length > 0) {
          const votedQuestionIds = votedQuestionsFromHistory.map((q) => q.id);
          const votedVoteCounts = await getVoteCounts(
            supabase,
            votedQuestionIds,
          );
          votedQuestionsFromHistory.forEach((q) => {
            const counts = votedVoteCounts.get(q.id);
            if (counts) {
              q.votes = counts;
            }
          });
        }
        setVotedQuestions(votedQuestionsFromHistory);

        const [followersData, followingData] = await Promise.all([
          getFollowersWithProfiles(supabase, currentUser.id),
          getFollowingWithProfiles(supabase, currentUser.id),
        ]);

        setFollowers(
          followersData.map((f) => ({
            id: f.id,
            username: f.username || f.firstName || "User",
            firstName: f.firstName || undefined,
            lastName: f.lastName || undefined,
            avatarUrl: f.avatarUrl || undefined,
          })),
        );

        setFollowing(
          followingData.map((f) => ({
            id: f.id,
            username: f.username || f.firstName || "User",
            firstName: f.firstName || undefined,
            lastName: f.lastName || undefined,
            avatarUrl: f.avatarUrl || undefined,
          })),
        );
      } catch (err) {
        console.error("Error fetching profile data:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [getSupabase],
  );

  useEffect(() => {
    if (clerkUser?.id) {
      fetchProfileData(true);
    }
  }, [clerkUser?.id, fetchProfileData]);

  const myQuestionIds = useMemo(
    () => myQuestions.map((q) => q.id),
    [myQuestions],
  );

  const handleVoteReceived = useCallback(
    async (questionId: string, payload: any) => {
      const sb = getSupabase();
      const counts = await getVoteCounts(sb, [questionId]);
      const newCounts = counts.get(questionId);

      if (newCounts) {
        setMyQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId ? { ...q, votes: newCounts } : q,
          ),
        );
      }

      const isInsert = payload.eventType === "INSERT";
      const isDelete = payload.eventType === "DELETE";

      if (isInsert) {
        setUserStats((prev) => ({
          ...prev,
          totalEngagement: prev.totalEngagement + 1,
        }));
      } else if (isDelete) {
        setUserStats((prev) => ({
          ...prev,
          totalEngagement: Math.max(0, prev.totalEngagement - 1),
        }));
      }
    },
    [getSupabase],
  );

  useRealtimeUserQuestionVotes(supabase, myQuestionIds, handleVoteReceived);

  const handleQuestionCreated = useCallback(
    async (questionData: any) => {
      const sb = getSupabase();
      const counts = await getVoteCounts(sb, [questionData.id]);

      const newQuestion: Question = {
        id: questionData.id,
        visibleUserId: questionData.is_anonymous
          ? undefined
          : questionData.user_id,
        title: questionData.title,
        prompt: questionData.prompt,
        promptImageUrl: questionData.prompt_image_url || undefined,
        left: {
          id: "left",
          label: questionData.left_choice_label,
          imageUrl: questionData.left_choice_image_url || undefined,
        },
        right: {
          id: "right",
          label: questionData.right_choice_label,
          imageUrl: questionData.right_choice_image_url || undefined,
        },
        votes: counts.get(questionData.id) || { left: 0, right: 0 },
        meta: {
          category: questionData.category || undefined,
          createdBy: questionData.is_anonymous ? "Anonymous" : "You",
        },
        createdAt: questionData.created_at,
        isOwnQuestion: true,
      };

      setMyQuestions((prev) => [newQuestion, ...prev]);
      setUserStats((prev) => ({
        ...prev,
        questionsCreated: prev.questionsCreated + 1,
      }));
    },
    [getSupabase],
  );

  const handleQuestionDeleted = useCallback((questionId: string) => {
    setMyQuestions((prev) => prev.filter((q) => q.id !== questionId));
    setUserStats((prev) => ({
      ...prev,
      questionsCreated: Math.max(0, prev.questionsCreated - 1),
    }));
  }, []);

  useRealtimeUserQuestions(
    supabase,
    clerkUser?.id || null,
    handleQuestionCreated,
    handleQuestionDeleted,
  );

  const handleVoteCast = useCallback(
    async (voteData: any) => {
      const sb = getSupabase();
      const question = await getQuestion(sb, voteData.question_id);
      if (!question) return;

      const counts = await getVoteCounts(sb, [question.id]);
      const voteCounts = counts.get(question.id) || { left: 0, right: 0 };

      const newHistoryItem: VoteHistoryItem = {
        questionId: voteData.question_id,
        questionTitle: question.title,
        direction: voteData.choice,
        votedAt: voteData.created_at,
      };

      setVoteHistory((prev) => [newHistoryItem, ...prev]);

      const newVotedQuestion: Question = {
        id: question.id,
        visibleUserId: question.is_anonymous ? undefined : question.user_id,
        title: question.title,
        prompt: question.prompt,
        promptImageUrl: question.prompt_image_url || undefined,
        left: {
          id: "left",
          label: question.left_choice_label,
          imageUrl: question.left_choice_image_url || undefined,
        },
        right: {
          id: "right",
          label: question.right_choice_label,
          imageUrl: question.right_choice_image_url || undefined,
        },
        votes: voteCounts,
        meta: {
          category: question.category || undefined,
          createdBy: question.is_anonymous ? "Anonymous" : undefined,
        },
        createdAt: voteData.created_at,
        hasVoted: true,
        userVote: voteData.choice,
      };

      setVotedQuestions((prev) => [newVotedQuestion, ...prev]);

      setUserStats((prev) => ({
        ...prev,
        totalVotesCast: prev.totalVotesCast + 1,
      }));
    },
    [getSupabase],
  );

  const handleVoteRemoved = useCallback((voteData: any) => {
    setVoteHistory((prev) =>
      prev.filter((v) => v.questionId !== voteData.question_id),
    );

    setVotedQuestions((prev) =>
      prev.filter((q) => q.id !== voteData.question_id),
    );

    setUserStats((prev) => ({
      ...prev,
      totalVotesCast: Math.max(0, prev.totalVotesCast - 1),
    }));
  }, []);

  useRealtimeUserVotes(
    supabase,
    clerkUser?.id || null,
    handleVoteCast,
    handleVoteRemoved,
  );

  const handleFollowerChange = useCallback(
    async (isNewFollower: boolean) => {
      setUserStats((prev) => ({
        ...prev,
        followers: isNewFollower
          ? prev.followers + 1
          : Math.max(0, prev.followers - 1),
      }));

      const currentUserId = clerkUserRef.current?.id;
      if (currentUserId) {
        const sb = getSupabase();
        const followersData = await getFollowersWithProfiles(sb, currentUserId);
        setFollowers(
          followersData.map((f) => ({
            id: f.id,
            username: f.username || f.firstName || "User",
            firstName: f.firstName || undefined,
            lastName: f.lastName || undefined,
            avatarUrl: f.avatarUrl || undefined,
          })),
        );
      }
    },
    [getSupabase],
  );

  const handleFollowingChange = useCallback(
    async (isNewFollowing: boolean) => {
      setUserStats((prev) => ({
        ...prev,
        following: isNewFollowing
          ? prev.following + 1
          : Math.max(0, prev.following - 1),
      }));
      const currentUserId = clerkUserRef.current?.id;
      if (currentUserId) {
        const sb = getSupabase();
        const followingData = await getFollowingWithProfiles(sb, currentUserId);
        setFollowing(
          followingData.map((f) => ({
            id: f.id,
            username: f.username || f.firstName || "User",
            firstName: f.firstName || undefined,
            lastName: f.lastName || undefined,
            avatarUrl: f.avatarUrl || undefined,
          })),
        );
      }
    },
    [getSupabase],
  );

  useRealtimeFollows(
    supabase,
    clerkUser?.id || null,
    handleFollowerChange,
    handleFollowingChange,
  );

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
    setEditPromptImage(
      question.promptImageUrl ? { uri: question.promptImageUrl } : null,
    );
    setEditLeftImage(
      question.left.imageUrl ? { uri: question.left.imageUrl } : null,
    );
    setEditRightImage(
      question.right.imageUrl ? { uri: question.right.imageUrl } : null,
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = async () => {
    if (
      !editingQuestion ||
      !editTitle.trim() ||
      !editPrompt.trim() ||
      !editLeftChoice.trim() ||
      !editRightChoice.trim()
    ) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const updatedData = {
      title: editTitle.trim(),
      prompt: editPrompt.trim(),
      category: editCategory.trim() || null,
      prompt_image_url: editPromptImage?.uri || null,
      left_choice_label: editLeftChoice.trim(),
      left_choice_image_url: editLeftImage?.uri || null,
      right_choice_label: editRightChoice.trim(),
      right_choice_image_url: editRightImage?.uri || null,
    };

    setMyQuestions((prev) =>
      prev.map((q) =>
        q.id === editingQuestion.id
          ? {
              ...q,
              title: updatedData.title,
              prompt: updatedData.prompt,
              promptImageUrl: updatedData.prompt_image_url || undefined,
              left: {
                ...q.left,
                label: updatedData.left_choice_label,
                imageUrl: updatedData.left_choice_image_url || undefined,
              },
              right: {
                ...q.right,
                label: updatedData.right_choice_label,
                imageUrl: updatedData.right_choice_image_url || undefined,
              },
              meta: {
                ...q.meta,
                category: updatedData.category || undefined,
              },
            }
          : q,
      ),
    );

    const questionId = editingQuestion.id;
    clearEditState();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const sb = getSupabase();
      await updateQuestion(sb, questionId, updatedData);
    } catch (err) {
      console.error("Failed to update question:", err);
      fetchProfileData(false);
    }
  };

  const handleCancelEdit = clearEditState;

  const handleDeleteQuestion = (questionId: string) => {
    Alert.alert(
      "Delete Question",
      "Are you sure you want to delete this question?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setMyQuestions((prev) => prev.filter((q) => q.id !== questionId));
            setUserStats((prev) => ({
              ...prev,
              questionsCreated: Math.max(0, prev.questionsCreated - 1),
            }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            try {
              const sb = getSupabase();
              await deleteQuestion(sb, questionId);
            } catch (err) {
              console.error("Failed to delete question:", err);
              fetchProfileData(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteVote = (questionId: string) => {
    Alert.alert(
      "Delete Vote",
      "Are you sure you want to remove your vote from this question?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setVoteHistory((prev) =>
              prev.filter((v) => v.questionId !== questionId),
            );
            setVotedQuestions((prev) =>
              prev.filter((q) => q.id !== questionId),
            );
            setUserStats((prev) => ({
              ...prev,
              totalVotesCast: Math.max(0, prev.totalVotesCast - 1),
            }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            try {
              const sb = getSupabase();
              const currentUser = clerkUserRef.current;
              if (currentUser?.id) {
                await deleteVote(sb, questionId, currentUser.id);
              }
            } catch (err) {
              console.error("Failed to delete vote:", err);
              fetchProfileData(false);
            }
          },
        },
      ],
    );
  };

  const handleQuestionPress = (question: Question) => {
    const foundIndex = myQuestions.findIndex((q) => q.id === question.id);
    if (foundIndex >= 0) {
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleBackToList = useCallback((options?: { skipPositionReset?: boolean }) => {
    const skipPositionReset = options?.skipPositionReset ?? false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    setProfileView("profile");
    // Ensure profile view is visible when returning to list
    profileViewOpacity.setValue(1);
    profileViewTranslateY.setValue(0);
    followersFollowingOpacity.setValue(0);
    if (!skipPositionReset) {
      cardPosition.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
    }
  }, [cardPosition, cardOpacity, profileViewOpacity, profileViewTranslateY, followersFollowingOpacity]);

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
  }, [
    profileView,
    viewMode,
    editingQuestion,
    handleBackToList,
    clearEditState,
  ]);

  useEffect(() => {
    registerResetCallback(resetToRoot);
    return () => unregisterResetCallback();
  }, [registerResetCallback, unregisterResetCallback, resetToRoot]);

  useEffect(() => {
    registerRefreshCallback(() => fetchProfileData(false));
    return () => unregisterRefreshCallback();
  }, [registerRefreshCallback, unregisterRefreshCallback, fetchProfileData]);

  useEffect(() => {
    const prevProfileView = prevProfileViewRef.current;
    const isTransitioningToFollowersFollowing =
      prevProfileView === "profile" &&
      (profileView === "followers" || profileView === "following");
    const isTransitioningToProfile =
      (prevProfileView === "followers" || prevProfileView === "following") &&
      profileView === "profile";
    const isTogglingBetweenFollowersFollowing =
      (prevProfileView === "followers" && profileView === "following") ||
      (prevProfileView === "following" && profileView === "followers");

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
  }, [
    profileView,
    followersFollowingTabIndicator,
    followersFollowingOpacity,
    followersFollowingTranslateY,
    profileViewOpacity,
    profileViewTranslateY,
  ]);

  const resetCard = useCallback(() => {
    Animated.timing(cardPosition, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [cardPosition]);

  const getQuestionsForTab = useCallback(() => {
    return activeTab === "questions" ? myQuestions : votedQuestions;
  }, [activeTab, myQuestions, votedQuestions]);

  const navigateCard = useCallback(
    (direction: "left" | "right", shouldGoBackToList?: boolean) => {
      const questions = getQuestionsForTab();
      const currentIndex = cardDisplayIndexRef.current;
      const isFirst = currentIndex === 0;
      const isLast = currentIndex === questions.length - 1;

      if (
        (direction === "right" && isFirst) ||
        (direction === "left" && isLast)
      ) {
        if (shouldGoBackToList) {
          handleBackToList({ skipPositionReset: true });
        } else {
          resetCard();
        }
        return;
      }

      const nextIdx =
        direction === "left"
          ? (currentIndex + 1) % questions.length
          : currentIndex === 0
            ? questions.length - 1
            : currentIndex - 1;

      cardOpacity.setValue(0);
      setCardDisplayIndex(nextIdx);
    },
    [getQuestionsForTab, resetCard, handleBackToList, cardOpacity],
  );

  const forceSwipe = useCallback(
    (direction: "left" | "right") => {
      const questions = getQuestionsForTab();
      const currentIndex = cardDisplayIndexRef.current;
      const isFirst = currentIndex === 0;
      const isLast = currentIndex === questions.length - 1;
      const isGoingBackToList =
        (direction === "right" && isFirst) || (direction === "left" && isLast);

      const x =
        direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Animate card off screen, with fade if going back to list
      const animations: Animated.CompositeAnimation[] = [
        Animated.timing(cardPosition, {
          toValue: { x, y: 0 },
          duration: ANIMATION_DURATION,
          useNativeDriver: false,
        }),
      ];

      if (isGoingBackToList) {
        // Fade out when going back to list for smoother transition
        animations.push(
          Animated.timing(cardOpacity, {
            toValue: 0,
            duration: ANIMATION_DURATION,
            useNativeDriver: false,
          }),
        );
      }

      Animated.parallel(animations).start(() => {
        navigateCard(direction, isGoingBackToList);
      });
    },
    [cardPosition, cardOpacity, navigateCard, getQuestionsForTab],
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
    [resetCard, forceSwipe, cardPosition],
  );

  useEffect(() => {
    if (viewMode === "card") {
      cardPosition.setValue({ x: 0, y: 0 });
      cardEntryScale.setValue(0.98);
      cardOpacity.setValue(0);
      requestAnimationFrame(() => {
        cardOpacity.setValue(1);
        Animated.timing(cardEntryScale, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    }
  }, [cardDisplayIndex, cardEntryScale, cardPosition, cardOpacity, viewMode]);

  useEffect(() => {
    const listenerId = cardPosition.x.addListener(({ value }) => {
      const absDx = Math.abs(value);
      if (absDx >= SWIPE_OUT_DISTANCE * 0.8) {
        cardOpacity.setValue(0);
      } else if (absDx < SWIPE_OUT_DISTANCE * 0.1) {
        cardOpacity.setValue(1);
      }
    });

    return () => {
      cardPosition.x.removeListener(listenerId);
    };
  }, [cardPosition.x, cardOpacity]);

  const cardRotate = cardPosition.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  const cardStyle = {
    transform: [{ translateX: cardPosition.x }, { rotate: cardRotate }],
  };

  const handleVoteHistoryPress = (item: VoteHistoryItem) => {
    const foundIndex = voteHistory.findIndex(
      (v) => v.questionId === item.questionId,
    );
    if (foundIndex >= 0) {
      setActiveTab("history");
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "black",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size='large' color='#fff' />
        <Text style={{ color: "#aaa", marginTop: 16, fontSize: 16 }}>
          Loading profile...
        </Text>
      </View>
    );
  }

  if (viewMode === "card") {
    const questions = getQuestionsForTab();
    const question = questions[cardDisplayIndex] ?? null;

    if (!question) {
      return (
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <View
            style={{
              position: "absolute",
              top: insets.top + 8,
              left: 16,
              zIndex: 20,
            }}
          >
            <Pressable
              onPress={() => handleBackToList()}
              style={{
                padding: 8,
              }}
            >
              <Octicons name="chevron-left" size={24} color="white" />
            </Pressable>
          </View>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: "white", fontSize: 18, textAlign: "center" }}>
              No questions available
            </Text>
          </View>
        </View>
      );
    }

    const currentVotes = question.votes ?? { left: 0, right: 0 };
    const currentTotal = currentVotes.left + currentVotes.right;
    const percentages = getNormalizedPercentages(
      currentVotes.left,
      currentVotes.right,
      currentTotal,
    );

    // Set static animated values for results display
    leftBarWidth.setValue(percentages.left);
    rightBarWidth.setValue(percentages.right);

    const userVote =
      activeTab === "history" && cardDisplayIndex < voteHistory.length
        ? voteHistory[cardDisplayIndex]?.direction
        : null;

    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        {/* Back button header */}
        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            zIndex: 20,
          }}
        >
          <Pressable
            onPress={() => handleBackToList()}
            style={{
              padding: 8,
            }}
          >
            <Octicons name="chevron-left" size={24} color="white" />
          </Pressable>
        </View>

        <Animated.View
          {...cardPanResponder.panHandlers}
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 20,
            opacity: cardOpacity,
            transform: [
              { translateX: cardPosition.x },
              { scale: cardEntryScale },
            ],
          }}
        >
          <View style={{ gap: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Text style={{ color: "#aaa", fontSize: 14 }}>
                {question.meta?.category ?? "General"}
              </Text>
              {question.meta?.createdBy && (
                <>
                  <Text style={{ color: "#aaa", fontSize: 14 }}> • </Text>
                  {question.meta.createdBy !== "Anonymous" &&
                  question.meta.createdBy !== "You" &&
                  question.visibleUserId ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({
                          pathname: "/user-profile",
                          params: {
                            username: question.meta?.createdBy,
                            userId: question.visibleUserId,
                          },
                        });
                      }}
                    >
                      {({ pressed }) => (
                        <Text
                          style={{
                            color: "#aaa",
                            fontSize: 14,
                            textDecorationLine: pressed ? "underline" : "none",
                          }}
                        >
                          @{question.meta?.createdBy}
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <Text style={{ color: "#aaa", fontSize: 14 }}>
                      {question.meta.createdBy}
                    </Text>
                  )}
                </>
              )}
            </View>

            <Text
              style={{
                color: "white",
                fontSize: 28,
                fontWeight: "800",
                lineHeight: 34,
              }}
            >
              {question.title}
            </Text>

            {question.promptImageUrl && (
              <Image
                source={{ uri: question.promptImageUrl }}
                style={{
                  width: "100%",
                  height: 200,
                  borderRadius: 16,
                }}
                resizeMode="cover"
              />
            )}

            {question.prompt && (
              <Text
                style={{
                  color: "#ccc",
                  fontSize: 18,
                  lineHeight: 26,
                }}
              >
                {question.prompt}
              </Text>
            )}

            <View style={{ gap: 12, marginTop: 8 }}>
              <FullScreenChoice
                choice={question.left}
                direction="left"
                onPress={() => {}}
                disabled={true}
                showResults={true}
                percentage={percentages.left}
                votes={currentVotes.left}
                animatedWidth={leftBarWidth}
                isSelected={userVote === "left"}
              />

              <FullScreenChoice
                choice={question.right}
                direction="right"
                onPress={() => {}}
                disabled={true}
                showResults={true}
                percentage={percentages.right}
                votes={currentVotes.right}
                animatedWidth={rightBarWidth}
                isSelected={userVote === "right"}
              />
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  const currentTab = profileView === "followers" ? "followers" : "following";
  const allUsers =
    profileView === "followers"
      ? followers
      : profileView === "following"
        ? following
        : [];

  const filteredUsers = allUsers.filter((user) => {
    if (!followersFollowingSearch.trim()) return true;
    const searchLower = followersFollowingSearch.toLowerCase();
    const fullName =
      user.firstName && user.lastName
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
            zIndex:
              profileView === "followers" || profileView === "following"
                ? 1
                : 0,
          }}
          pointerEvents={
            profileView === "followers" || profileView === "following"
              ? "auto"
              : "none"
          }
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
              <Octicons name='chevron-left' size={20} color='#aaa' />
            </Pressable>
            <Text
              style={{
                color: "white",
                fontSize: 20,
                fontWeight: "700",
                flex: 1,
              }}
            >
              People
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <View
            style={{ paddingHorizontal: 24, marginTop: 16, marginBottom: 12 }}
          >
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
              <Octicons name='search' size={18} color='#666' />
              <TextInput
                value={followersFollowingSearch}
                onChangeText={setFollowersFollowingSearch}
                placeholder='Search...'
                placeholderTextColor='#666'
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
                  <Octicons name='x' size={18} color='#666' />
                </Pressable>
              )}
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='always'
          >
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <UserListItem key={user.id} user={user} />
              ))
            ) : (
              <View style={{ alignItems: "center", padding: 32 }}>
                <Octicons
                  name='search'
                  size={48}
                  color='#666'
                  style={{ marginBottom: 16 }}
                />
                <Text style={{ color: "#666", fontSize: 16 }}>
                  No {currentTab === "followers" ? "followers" : "following"}{" "}
                  found
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
          keyboardShouldPersistTaps='always'
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
            stats={userStats}
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
                      if (
                        editingQuestion &&
                        editingQuestion.id === question.id
                      ) {
                        return (
                          <KeyboardAvoidingView
                            key={question.id}
                            behavior={
                              Platform.OS === "ios" ? "padding" : undefined
                            }
                            style={{ marginBottom: 12 }}
                          >
                            <ScrollView
                              contentContainerStyle={{ paddingBottom: 24 }}
                              keyboardShouldPersistTaps='always'
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
                                <View
                                  style={{
                                    padding: 16,
                                    borderBottomWidth: 1,
                                    borderBottomColor: "#222",
                                  }}
                                >
                                  <View style={{ marginBottom: 8 }}>
                                    <AutocompleteInput
                                      value={editCategory}
                                      onChangeText={setEditCategory}
                                      placeholder='Category (optional)'
                                      suggestions={SUGGESTED_CATEGORIES}
                                      onDropdownOpen={() =>
                                        setIsCategoryDropdownOpen(true)
                                      }
                                      onDropdownClose={() =>
                                        setIsCategoryDropdownOpen(false)
                                      }
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
                                    placeholder='Question Title'
                                    placeholderTextColor='#666'
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
                                  <View
                                    style={{
                                      position: "relative",
                                      minHeight: 100,
                                    }}
                                  >
                                    <TextInput
                                      value={editPrompt}
                                      onChangeText={setEditPrompt}
                                      placeholder="What's your question?"
                                      placeholderTextColor='#666'
                                      multiline
                                      numberOfLines={4}
                                      textAlignVertical='top'
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
                                      onPress={() =>
                                        pickImage(setEditPromptImage)
                                      }
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
                                      <Octicons
                                        name='image'
                                        size={18}
                                        color='#aaa'
                                      />
                                    </Pressable>
                                  </View>
                                  {editPromptImage && (
                                    <View style={{ position: "relative" }}>
                                      <Image
                                        source={{ uri: editPromptImage.uri }}
                                        style={{
                                          width: "100%",
                                          height: 180,
                                          borderRadius: 16,
                                        }}
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
                                        <Octicons
                                          name='x'
                                          size={12}
                                          color='white'
                                        />
                                      </Pressable>
                                    </View>
                                  )}

                                  <View
                                    style={{
                                      gap: 12,
                                      borderTopWidth: 1,
                                      borderTopColor: "#222",
                                      paddingTop: 12,
                                    }}
                                  >
                                    <View
                                      style={{
                                        borderRadius: 18,
                                        borderWidth: 1,
                                        borderColor: "#333",
                                        backgroundColor: "#1c1c1c",
                                        overflow: "hidden",
                                      }}
                                    >
                                      <View
                                        style={{
                                          position: "relative",
                                          padding: 12,
                                        }}
                                      >
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 12,
                                          }}
                                        >
                                          <View
                                            style={{ position: "relative" }}
                                          >
                                            <Pressable
                                              onPress={() =>
                                                pickImage(setEditLeftImage)
                                              }
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
                                                  source={{
                                                    uri: editLeftImage.uri,
                                                  }}
                                                  style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 12,
                                                  }}
                                                />
                                              ) : (
                                                <Octicons
                                                  name='image'
                                                  size={20}
                                                  color='#666'
                                                />
                                              )}
                                            </Pressable>
                                            {editLeftImage && (
                                              <Pressable
                                                onPress={() =>
                                                  setEditLeftImage(null)
                                                }
                                                style={{
                                                  position: "absolute",
                                                  top: -4,
                                                  right: -4,
                                                  width: 20,
                                                  height: 20,
                                                  borderRadius: 10,
                                                  backgroundColor:
                                                    "rgba(0, 0, 0, 0.8)",
                                                  borderWidth: 1,
                                                  borderColor: "#333",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  zIndex: 1,
                                                }}
                                              >
                                                <Octicons
                                                  name='x'
                                                  size={10}
                                                  color='white'
                                                />
                                              </Pressable>
                                            )}
                                          </View>
                                          <TextInput
                                            value={editLeftChoice}
                                            onChangeText={setEditLeftChoice}
                                            placeholder='Left Choice'
                                            placeholderTextColor='#666'
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
                                      <View
                                        style={{
                                          position: "relative",
                                          padding: 12,
                                        }}
                                      >
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 12,
                                          }}
                                        >
                                          <View
                                            style={{ position: "relative" }}
                                          >
                                            <Pressable
                                              onPress={() =>
                                                pickImage(setEditRightImage)
                                              }
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
                                                  source={{
                                                    uri: editRightImage.uri,
                                                  }}
                                                  style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 12,
                                                  }}
                                                />
                                              ) : (
                                                <Octicons
                                                  name='image'
                                                  size={20}
                                                  color='#666'
                                                />
                                              )}
                                            </Pressable>
                                            {editRightImage && (
                                              <Pressable
                                                onPress={() =>
                                                  setEditRightImage(null)
                                                }
                                                style={{
                                                  position: "absolute",
                                                  top: -4,
                                                  right: -4,
                                                  width: 20,
                                                  height: 20,
                                                  borderRadius: 10,
                                                  backgroundColor:
                                                    "rgba(0, 0, 0, 0.8)",
                                                  borderWidth: 1,
                                                  borderColor: "#333",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  zIndex: 1,
                                                }}
                                              >
                                                <Octicons
                                                  name='x'
                                                  size={10}
                                                  color='white'
                                                />
                                              </Pressable>
                                            )}
                                          </View>
                                          <TextInput
                                            value={editRightChoice}
                                            onChangeText={setEditRightChoice}
                                            placeholder='Right Choice'
                                            placeholderTextColor='#666'
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

                                  <View
                                    style={{
                                      flexDirection: "row",
                                      gap: 12,
                                      marginTop: 8,
                                    }}
                                  >
                                    <Pressable
                                      onPress={handleCancelEdit}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? "#2a2a2a"
                                          : "transparent",
                                        borderRadius: 12,
                                        padding: 16,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderWidth: 1,
                                        borderColor: "#333",
                                      })}
                                    >
                                      <Text
                                        style={{
                                          color: "#aaa",
                                          fontSize: 16,
                                          fontWeight: "600",
                                        }}
                                      >
                                        Cancel
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      onPress={handleSaveEdit}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? "#e0e0e0"
                                          : "#fff",
                                        borderRadius: 12,
                                        padding: 16,
                                        alignItems: "center",
                                        justifyContent: "center",
                                      })}
                                    >
                                      <Text
                                        style={{
                                          color: "#000",
                                          fontSize: 16,
                                          fontWeight: "700",
                                        }}
                                      >
                                        Save Changes
                                      </Text>
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
                      <Octicons
                        name='question'
                        size={48}
                        color='#666'
                        style={{ marginBottom: 16 }}
                      />
                      <Text style={{ color: "#666", fontSize: 16 }}>
                        You haven&apos;t created any questions yet
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ paddingHorizontal: 24 }}>
                  {voteHistory.length > 0 ? (
                    voteHistory.map((item, index) => {
                      const question = votedQuestions[index] || null;
                      return (
                        <VoteHistoryItemCard
                          key={item.questionId}
                          item={item}
                          question={question}
                          onPress={() => handleVoteHistoryPress(item)}
                          onDelete={() => item.questionId && handleDeleteVote(item.questionId)}
                        />
                      );
                    })
                  ) : (
                    <View style={{ alignItems: "center", padding: 32 }}>
                      <Octicons
                        name='check-circle'
                        size={48}
                        color='#666'
                        style={{ marginBottom: 16 }}
                      />
                      <Text style={{ color: "#666", fontSize: 16 }}>
                        You haven&apos;t voted on any questions yet
                      </Text>
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
