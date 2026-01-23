import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type Question = {
  id: string;
  title: string;
  prompt: string;
  promptImageUrl?: string;
  left: { id: "left"; label: string; imageUrl?: string };
  right: { id: "right"; label: string; imageUrl?: string };
  votes?: { left: number; right: number };
  meta?: { category?: string; createdBy?: string };
  createdAt: string;
};

type User = {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
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

const MOCK_OTHER_USER_QUESTIONS: Question[] = [
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
    meta: { category: "Style", createdBy: "User" },
    createdAt: "2024-01-15",
  },
  {
    id: "q2",
    title: "Text them?",
    prompt: "Do I double-text if they haven't replied in 24 hours?",
    left: { id: "left", label: "No (chill)" },
    right: { id: "right", label: "Yes (send it)" },
    votes: { left: 45, right: 23 },
    meta: { category: "Social", createdBy: "User" },
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
    meta: { category: "Food", createdBy: "User" },
    createdAt: "2024-01-05",
  },
];

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const currentYear = now.getFullYear();
  const dateYear = date.getFullYear();
  
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  
  if (dateYear === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${dateYear}`;
};

const calculatePercentage = (votes: number, total: number) => (total > 0 ? (votes / total) * 100 : 0);

const getNormalizedPercentages = (leftVotes: number, rightVotes: number, total: number) => {
  if (total === 0) return { left: 0, right: 0 };

  const left = calculatePercentage(leftVotes, total);
  const right = calculatePercentage(rightVotes, total);
  const leftRounded = Math.round(left);
  const rightRounded = Math.round(right);
  const sum = leftRounded + rightRounded;

  if (sum !== 100) {
    return leftRounded >= rightRounded
      ? { left: leftRounded + (100 - sum), right: rightRounded }
      : { left: leftRounded, right: rightRounded + (100 - sum) };
  }
  return { left: leftRounded, right: rightRounded };
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

const UserProfileHeader: React.FC<{
  user: User;
  stats: typeof MOCK_USER_STATS;
  onFollowersPress: () => void;
  onFollowingPress: () => void;
  isFollowing: boolean;
  onFollowPress: () => void;
}> = ({ user, stats, onFollowersPress, onFollowingPress, isFollowing, onFollowPress }) => {
  return (
    <View
      style={{
        paddingTop: 0,
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
          {user.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
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
            {user.username || "User"}
          </Text>
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
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <StatsCard label="Questions" value={stats.questionsCreated} icon="question" />
        <StatsCard label="Votes Cast" value={stats.totalVotesCast} icon="check-circle" />
        <StatsCard label="Votes Received" value={stats.totalEngagement} icon="flame" />
      </View>

      <Pressable
        onPress={onFollowPress}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isFollowing ? "#333" : "#fff",
          backgroundColor: isFollowing ? "transparent" : pressed ? "#e0e0e0" : "#fff",
          alignItems: "center",
        })}
      >
        <Text
          style={{
            color: isFollowing ? "#aaa" : "#000",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {isFollowing ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </View>
  );
};

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

const QuestionCard: React.FC<{
  question: Question;
  onPress: () => void;
}> = ({ question, onPress }) => {
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
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"} • {formatDate(question.createdAt)}
          </Text>
        </View>
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

const PlusOneBadge: React.FC<{ opacity: number; position: "left" | "right" }> = ({ opacity, position }) => (
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

const PercentageBar: React.FC<{
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
      borderRadius: 18,
      opacity,
    }}
  />
);

const VoteDisplay: React.FC<{
  percentage: number;
  votes: number;
  isSelected: boolean;
  swipeProgress: number;
  align: "left" | "right";
}> = ({ percentage, votes, isSelected, swipeProgress, align }) => (
  <View
    style={{
      alignItems: align === "right" ? "flex-end" : "flex-start",
      minWidth: 65,
      opacity: swipeProgress,
    }}
  >
    <Text
      style={{
        color: isSelected ? "#ddd" : "#aaa",
        fontSize: 14,
        fontWeight: "600",
      }}
    >
      {swipeProgress > 0 ? `${Math.round(percentage)}%` : "0%"}
    </Text>
    <Text
      style={{
        color: isSelected ? "#ddd" : "#aaa",
        fontSize: 12,
        fontWeight: "500",
      }}
    >
      ({votes} {votes === 1 ? "vote" : "votes"})
    </Text>
  </View>
);

const ChoiceOption: React.FC<{
  choice: { id: "left" | "right"; label: string; imageUrl?: string };
  direction: "left" | "right";
  percentage: number;
  votes: number;
  swipeProgress: number;
  swipeDirection: "left" | "right" | null;
  isSelected: boolean;
  highlight: number;
}> = ({ choice, direction, percentage, votes, swipeProgress, swipeDirection, isSelected, highlight }) => {
  const isRight = direction === "right";
  const showPlusOne = swipeDirection === direction && swipeProgress > 0;

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1 + highlight * 2,
        borderColor:
          highlight > 0
            ? isSelected
              ? "rgba(255, 255, 255, 0.25)"
              : `rgba(255, 255, 255, ${0.12 + highlight * 0.06})`
            : "#333",
        backgroundColor: "#1c1c1c",
        overflow: "hidden",
      }}
    >
      <View style={{ position: "relative", padding: 12 }}>
        {swipeProgress > 0 && (
          <PercentageBar
            width={percentage}
            opacity={swipeProgress}
            isSelected={isSelected}
            position={isRight ? "right" : "left"}
          />
        )}

        <View style={{ position: "relative", zIndex: 1 }}>
          {showPlusOne && <PlusOneBadge opacity={swipeProgress} position={isRight ? "left" : "right"} />}

          <Text
            style={{
              color: "#aaa",
              fontSize: 12,
              marginBottom: 8,
              textAlign: isRight ? "right" : "left",
            }}
          >
            SWIPE {direction.toUpperCase()}
          </Text>

          <View
            style={{
              flexDirection: isRight ? "row-reverse" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: isRight ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
                flex: 1,
              }}
            >
              {choice.imageUrl && (
                <Image source={{ uri: choice.imageUrl }} style={{ width: 44, height: 44, borderRadius: 12 }} />
              )}
              <Text
                style={{
                  color: isSelected ? "#fff" : "white",
                  fontSize: 16,
                  fontWeight: "700",
                  textAlign: isRight ? "right" : "left",
                }}
              >
                {choice.label}
              </Text>
            </View>

            <VoteDisplay
              percentage={percentage}
              votes={votes}
              isSelected={isSelected}
              swipeProgress={swipeProgress}
              align={isRight ? "left" : "right"}
            />
          </View>
        </View>
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

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string; userId?: string }>();
  
  const [userQuestions, setUserQuestions] = useState(MOCK_OTHER_USER_QUESTIONS);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [cardDisplayIndex, setCardDisplayIndex] = useState(0);
  const [cardOpacity, setCardOpacity] = useState(1);
  const [profileView, setProfileView] = useState<"profile" | "followers" | "following">("profile");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersFollowingSearch, setFollowersFollowingSearch] = useState("");
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [voteHistory, setVoteHistory] = useState<{ questionIndex: number; direction: "left" | "right" }[]>([]);

  const screenWidth = Dimensions.get("window").width;
  const tabContainerInnerWidth = screenWidth - 48 - 2 - 8;
  const tabIndicatorWidth = tabContainerInnerWidth / 2;
  const followersFollowingTabIndicator = useRef(new Animated.Value(0)).current;
  const followersFollowingOpacity = useRef(new Animated.Value(0)).current;
  const followersFollowingTranslateY = useRef(new Animated.Value(20)).current;
  const profileViewOpacity = useRef(new Animated.Value(1)).current;
  const profileViewTranslateY = useRef(new Animated.Value(0)).current;
  const prevProfileViewRef = useRef<"profile" | "followers" | "following">("profile");

  const cardPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardEntryScale = useRef(new Animated.Value(1)).current;

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

  const user: User = useMemo(() => {
    const username = params.username || "user";
    const userId = params.userId || "1";
    return {
      id: userId,
      username,
      firstName: username.includes("user") ? `First${userId}` : undefined,
      lastName: username.includes("user") ? `Last${userId}` : undefined,
      avatarUrl: `https://i.pravatar.cc/150?img=${parseInt(userId) % 70}`,
    };
  }, [params.username, params.userId]);

  const handleQuestionPress = (question: Question) => {
    const foundIndex = userQuestions.findIndex((q) => q.id === question.id);
    if (foundIndex >= 0) {
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      setCardOpacity(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleBackToList = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    cardPosition.setValue({ x: 0, y: 0 });
  };

  const recordVote = useCallback(
    (direction: "left" | "right") => {
      setUserQuestions((prev) => {
        const updated = [...prev];
        const currentQ = updated[cardDisplayIndex];
        if (currentQ) {
          const currentVotes = currentQ.votes ?? { left: 0, right: 0 };
          updated[cardDisplayIndex] = {
            ...currentQ,
            votes: {
              ...currentVotes,
              [direction]: currentVotes[direction] + 1,
            },
          };
        }
        return updated;
      });
      setVoteHistory((prev) => [...prev, { questionIndex: cardDisplayIndex, direction }]);
    },
    [cardDisplayIndex]
  );

  const resetCard = useCallback(() => {
    Animated.spring(cardPosition, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
    }).start(() => {
      setSwipeProgress(0);
      setSwipeDirection(null);
    });
  }, [cardPosition]);

  const advance = useCallback(
    (direction: "left" | "right" | null = null) => {
      if (direction) {
        recordVote(direction);
      }

      const nextIdx = (cardDisplayIndex + 1) >= userQuestions.length ? 0 : cardDisplayIndex + 1;
      
      setSwipeProgress(0);
      setSwipeDirection(null);
      setCardOpacity(0);
      setCardDisplayIndex(nextIdx);
    },
    [userQuestions.length, recordVote, cardDisplayIndex]
  );

  const skip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    advance(null);
  }, [advance]);

  const undo = useCallback(() => {
    if (voteHistory.length === 0) return;

    const lastVote = voteHistory[voteHistory.length - 1];
    const previousIndex = lastVote.questionIndex;

    setUserQuestions((prev) => {
      const updated = [...prev];
      const votedQ = updated[previousIndex];
      if (votedQ) {
        const currentVotes = votedQ.votes ?? { left: 0, right: 0 };
        updated[previousIndex] = {
          ...votedQ,
          votes: {
            ...currentVotes,
            [lastVote.direction]: Math.max(0, currentVotes[lastVote.direction] - 1),
          },
        };
      }
      return updated;
    });

    setVoteHistory((prev) => prev.slice(0, -1));
    setCardDisplayIndex(previousIndex);
    cardPosition.setValue({ x: 0, y: 0 });
    setSwipeProgress(0);
    setSwipeDirection(null);
    setCardOpacity(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [voteHistory, cardPosition]);

  const forceSwipe = useCallback(
    (direction: "left" | "right") => {
      const x = direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSwipeProgress(0);
      setSwipeDirection(null);

      Animated.timing(cardPosition, {
        toValue: { x, y: 0 },
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }).start(() => {
        advance(direction);
      });
    },
    [cardPosition, advance]
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
    const listenerId = cardPosition.x.addListener(({ value }) => {
      const absDx = Math.abs(value);
      const progress = Math.min(absDx / SWIPE_THRESHOLD, 1);
      setSwipeProgress(progress);

      if (absDx >= SWIPE_OUT_DISTANCE * 0.8) {
        setCardOpacity(0);
      } else if (absDx < SWIPE_OUT_DISTANCE * 0.1) {
        setCardOpacity(1);
      }

      if (value < -HORIZONTAL_ACTIVATION_DX) {
        setSwipeDirection("left");
      } else if (value > HORIZONTAL_ACTIVATION_DX) {
        setSwipeDirection("right");
      } else {
        setSwipeDirection(null);
      }
    });

    return () => {
      cardPosition.x.removeListener(listenerId);
    };
  }, [cardDisplayIndex, cardPosition.x]);

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

  if (viewMode === "card") {
    const question = userQuestions[cardDisplayIndex] ?? null;

    if (!question) {
      return (
        <View style={{ flex: 1, backgroundColor: "black", padding: 24, justifyContent: "center" }}>
          <Text style={{ color: "white" }}>No question found</Text>
        </View>
      );
    }

    const currentVotes = question.votes ?? { left: 0, right: 0 };
    const currentTotal = currentVotes.left + currentVotes.right;
    
    const previewVotes = {
      left: swipeDirection === "left" ? currentVotes.left + 1 : currentVotes.left,
      right: swipeDirection === "right" ? currentVotes.right + 1 : currentVotes.right,
    };
    
    const totalPreviewVotes = previewVotes.left + previewVotes.right;
    
    let leftPercentage: number;
    let rightPercentage: number;
    
    if (swipeProgress > 0 && swipeDirection === "left") {
      const percentages = getNormalizedPercentages(previewVotes.left, previewVotes.right, totalPreviewVotes);
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    } else if (swipeProgress > 0 && swipeDirection === "right") {
      const percentages = getNormalizedPercentages(previewVotes.left, previewVotes.right, totalPreviewVotes);
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    } else {
      const percentages = getNormalizedPercentages(currentVotes.left, currentVotes.right, currentTotal);
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    }
    
    const leftVotes = swipeProgress > 0 && swipeDirection === "left" ? previewVotes.left : currentVotes.left;
    const rightVotes = swipeProgress > 0 && swipeDirection === "right" ? previewVotes.right : currentVotes.right;
    
    const leftHighlight = swipeDirection === "left" ? swipeProgress : 0;
    const rightHighlight = swipeDirection === "right" ? swipeProgress : 0;

    const cardRotate = cardPosition.x.interpolate({
      inputRange: [-SCREEN_W, 0, SCREEN_W],
      outputRange: ["-8deg", "0deg", "8deg"],
    });

    const cardStyle = {
      transform: [{ translateX: cardPosition.x }, { rotate: cardRotate }],
    };

    return (
      <View style={{ flex: 1, backgroundColor: "black", padding: 24 }}>
        <View
          style={{
            position: "absolute",
            bottom: 24,
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

          {voteHistory.length > 0 ? (
            <Pressable
              onPress={undo}
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
                <Octicons name="undo" size={24} color="#aaa" />
                <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4, fontWeight: "500" }}>Undo</Text>
              </View>
            </Pressable>
          ) : (
            <View style={{ minWidth: 60 }} />
          )}

          <Pressable
            onPress={skip}
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
              <Octicons name="arrow-right" size={24} color="#aaa" />
              <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4, fontWeight: "500" }}>Skip</Text>
            </View>
          </Pressable>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
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
              <ChoiceOption
                choice={question.left}
                direction="left"
                percentage={leftPercentage}
                votes={leftVotes}
                swipeProgress={swipeProgress}
                swipeDirection={swipeDirection}
                isSelected={swipeDirection === "left"}
                highlight={leftHighlight}
              />

              <ChoiceOption
                choice={question.right}
                direction="right"
                percentage={rightPercentage}
                votes={rightVotes}
                swipeProgress={swipeProgress}
                swipeDirection={swipeDirection}
                isSelected={swipeDirection === "right"}
                highlight={rightHighlight}
              />

              <Text style={{ color: "#777", fontSize: 12 }}>
                Tip: Scroll vertically in the prompt. Swipe left or right to pick.
              </Text>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {(profileView === "followers" || profileView === "following") ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: "black",
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
      ) : (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: "black",
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
              router.back();
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
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700", flex: 1 }}>{user.username}</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

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
          <View style={{ paddingTop: 108 }}>
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
            {(() => {
              const currentTab = profileView === "followers" ? "followers" : "following";
              const allUsers = currentTab === "followers" ? MOCK_FOLLOWERS : MOCK_FOLLOWING;
              
              const filteredUsers = allUsers.filter((user) => {
                if (!followersFollowingSearch.trim()) return true;
                const searchLower = followersFollowingSearch.toLowerCase();
                const fullName = user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`.toLowerCase()
                  : (user.firstName || user.username || "").toLowerCase();
                const username = user.username.toLowerCase();
                return fullName.includes(searchLower) || username.includes(searchLower);
              });

              return filteredUsers.length > 0 ? (
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
              );
            })()}
          </ScrollView>
          </View>
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
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 108 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <UserProfileHeader
            user={user}
            stats={MOCK_USER_STATS}
            onFollowersPress={() => {
              setProfileView("followers");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onFollowingPress={() => {
              setProfileView("following");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            isFollowing={isFollowing}
            onFollowPress={() => {
              setIsFollowing(!isFollowing);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />
          
          <View style={{ paddingHorizontal: 24 }}>
            {userQuestions.length > 0 ? (
              userQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  onPress={() => handleQuestionPress(question)}
                />
              ))
            ) : (
              <View style={{ alignItems: "center", padding: 32 }}>
                <Octicons name="question" size={48} color="#666" style={{ marginBottom: 16 }} />
                <Text style={{ color: "#666", fontSize: 16 }}>No questions yet</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
