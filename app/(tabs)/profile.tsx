import { useAuth, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
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

type VoteHistoryItem = {
  questionId: string;
  questionTitle: string;
  direction: "left" | "right";
  votedAt: string;
};

const MOCK_USER_STATS = {
  questionsCreated: 12,
  totalVotesCast: 47,
  totalEngagement: 234,
  followers: 128,
  following: 64,
};

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

const ProfileHeader: React.FC<{ onEditPress: () => void; onSignOut: () => void; stats: typeof MOCK_USER_STATS }> = ({
  onEditPress,
  onSignOut,
  stats,
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
            {user?.firstName || user?.username || "User"}
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{stats.followers}</Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>followers</Text>
            </Pressable>
            <Pressable>
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

const VoteHistoryItemCard: React.FC<{ item: VoteHistoryItem; onPress: () => void }> = ({ item, onPress }) => (
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
      <Text style={{ color: "white", fontSize: 16, fontWeight: "600", marginBottom: 4 }}>{item.questionTitle}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: item.direction === "left" ? "rgba(59, 130, 246, 0.2)" : "rgba(239, 68, 68, 0.2)",
            borderWidth: 1,
            borderColor: item.direction === "left" ? "rgba(59, 130, 246, 0.4)" : "rgba(239, 68, 68, 0.4)",
          }}
        >
          <Text
            style={{
              color: item.direction === "left" ? "#60a5fa" : "#f87171",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Voted {item.direction.toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: "#666", fontSize: 12 }}>{formatDate(item.votedAt)}</Text>
      </View>
    </View>
    <Octicons name="chevron-right" size={20} color="#666" />
  </Pressable>
);

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"questions" | "history">("questions");
  const [myQuestions, setMyQuestions] = React.useState(MOCK_MY_QUESTIONS);
  const [editingQuestion, setEditingQuestion] = React.useState<Question | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editPrompt, setEditPrompt] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"list" | "card">("list");
  const [cardDisplayIndex, setCardDisplayIndex] = React.useState(0);
  const [cardOpacity, setCardOpacity] = React.useState(1);

  const cardPosition = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardEntryScale = React.useRef(new Animated.Value(1)).current;

  const translateX = React.useRef(new Animated.Value(0)).current;
  const activeTabIndex = activeTab === "questions" ? 0 : 1;
  const screenWidth = Dimensions.get("window").width;
  const swipeThreshold = screenWidth * 0.2;
  const horizontalActivationDx = 20;
  const [isSwiping, setIsSwiping] = React.useState(false);
  const tabIndicatorPosition = React.useRef(new Animated.Value(0)).current;
  const currentTranslateX = React.useRef(0);
  const tabContainerInnerWidth = screenWidth - 48 - 2 - 8;
  const tabIndicatorWidth = tabContainerInnerWidth / 2;
  React.useEffect(() => {
    if (!isSwiping) {
      const targetX = activeTabIndex === 0 ? 0 : -screenWidth;
      currentTranslateX.current = targetX;
      Animated.timing(translateX, {
        toValue: targetX,
        useNativeDriver: true,
        duration: 250,
        easing: Easing.out(Easing.cubic),
      }).start();
      
      Animated.timing(tabIndicatorPosition, {
        toValue: activeTabIndex,
        useNativeDriver: false,
        duration: 250,
        easing: Easing.out(Easing.cubic),
      }).start();
    }
  }, [activeTabIndex, translateX, screenWidth, isSwiping, tabIndicatorPosition]);

  React.useEffect(() => {
    const listenerId = translateX.addListener(({ value }) => {
      currentTranslateX.current = value;
      const normalizedPosition = Math.max(0, Math.min(1, -value / screenWidth));
      tabIndicatorPosition.setValue(normalizedPosition);
    });

    return () => {
      translateX.removeListener(listenerId);
    };
  }, [translateX, screenWidth, tabIndicatorPosition]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: (_, gesture) => {
          const dx = Math.abs(gesture.dx || 0);
          const dy = Math.abs(gesture.dy || 0);
          return dx > dy && dx > horizontalActivationDx;
        },
        onMoveShouldSetPanResponder: (_, gesture) => {
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          if (dy > dx) return false;
          return dx > horizontalActivationDx;
        },
        onPanResponderGrant: () => {
          setIsSwiping(true);
        },
        onPanResponderMove: (_, gesture) => {
          const newX = currentTranslateX.current + gesture.dx;
          const clampedX = Math.max(-screenWidth, Math.min(0, newX));
          translateX.setValue(clampedX);
        },
        onPanResponderRelease: (_, gesture) => {
          setIsSwiping(false);
          const velocity = gesture.vx;
          
          const currentPos = currentTranslateX.current + gesture.dx;
          const normalizedPos = -currentPos / screenWidth;

          let targetTabIndex = activeTabIndex;
          
          if (normalizedPos > 0.5) {
            targetTabIndex = 1;
          } else if (normalizedPos < 0.5) {
            targetTabIndex = 0;
          }
          
          if (Math.abs(gesture.dx) > swipeThreshold || Math.abs(velocity) > 0.3) {
            if (gesture.dx > 0 && activeTabIndex === 1) {
              targetTabIndex = 0;
            } else if (gesture.dx < 0 && activeTabIndex === 0) {
              targetTabIndex = 1;
            }
          }

          const targetX = targetTabIndex * -screenWidth;
          Animated.timing(translateX, {
            toValue: targetX,
            useNativeDriver: true,
            duration: 200,
            easing: Easing.out(Easing.cubic),
          }).start(() => {
            currentTranslateX.current = targetX;
            if (targetTabIndex !== activeTabIndex) {
              setActiveTab(targetTabIndex === 0 ? "questions" : "history");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          });
        },
        onPanResponderTerminate: () => {
          setIsSwiping(false);
          const targetX = activeTabIndex * -screenWidth;
          Animated.timing(translateX, {
            toValue: targetX,
            useNativeDriver: true,
            duration: 200,
            easing: Easing.out(Easing.cubic),
          }).start(() => {
            currentTranslateX.current = targetX;
          });
        },
      }),
    [activeTabIndex, translateX, screenWidth, swipeThreshold, horizontalActivationDx]
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

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setEditTitle(question.title);
    setEditPrompt(question.prompt);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = () => {
    if (editingQuestion) {
      setMyQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id
            ? { ...q, title: editTitle, prompt: editPrompt }
            : q
        )
      );
      setEditingQuestion(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setEditTitle("");
    setEditPrompt("");
  };

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

  const handleBackToList = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    cardPosition.setValue({ x: 0, y: 0 });
  }, [cardPosition]);

  const resetCard = React.useCallback(() => {
    Animated.timing(cardPosition, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      duration: 200,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [cardPosition]);

  const navigateCard = React.useCallback(
    (direction: "left" | "right") => {
      const questions = activeTab === "questions" ? myQuestions : MOCK_VOTE_HISTORY.map((item) => {
        const q = myQuestions.find((q) => q.id === item.questionId);
        return q || myQuestions[0];
      });
      const isFirst = cardDisplayIndex === 0;
      const isLast = cardDisplayIndex === questions.length - 1;

      if (direction === "right" && isFirst) {
        resetCard();
        return;
      }

      if (direction === "left" && isLast) {
        resetCard();
        return;
      }

      const nextIdx = direction === "left" 
        ? (cardDisplayIndex + 1) % questions.length
        : cardDisplayIndex === 0 ? questions.length - 1 : cardDisplayIndex - 1;

      setCardOpacity(0);
      setCardDisplayIndex(nextIdx);
    },
    [cardDisplayIndex, activeTab, myQuestions, resetCard]
  );

  const forceSwipe = React.useCallback(
    (direction: "left" | "right") => {
      const x = direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      Animated.timing(cardPosition, {
        toValue: { x, y: 0 },
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        navigateCard(direction);
      });
    },
    [cardPosition, navigateCard]
  );

  const cardPanResponder = React.useMemo(
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

  React.useEffect(() => {
    if (viewMode === "card") {
      cardPosition.setValue({ x: 0, y: 0 });
      cardEntryScale.setValue(0.98);
      setCardOpacity(0);
      requestAnimationFrame(() => {
        setCardOpacity(1);
        Animated.timing(cardEntryScale, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    }
  }, [cardDisplayIndex, cardEntryScale, cardPosition, viewMode]);

  React.useEffect(() => {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (viewMode === "card") {
    const questions = activeTab === "questions" ? myQuestions : MOCK_VOTE_HISTORY.map((item) => {
      const q = myQuestions.find((q) => q.id === item.questionId);
      return q || myQuestions[0];
    });
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
                  borderWidth: 1,
                  borderColor: "#333",
                  backgroundColor: "#1c1c1c",
                  overflow: "hidden",
                }}
              >
                <View style={{ position: "relative", padding: 12 }}>
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${leftPercentage}%`,
                      backgroundColor: "rgba(255, 255, 255, 0.15)",
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
                            color: "white",
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
                  borderWidth: 1,
                  borderColor: "#333",
                  backgroundColor: "#1c1c1c",
                  overflow: "hidden",
                }}
              >
                <View style={{ position: "relative", padding: 12 }}>
                  <View
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${rightPercentage}%`,
                      backgroundColor: "rgba(255, 255, 255, 0.15)",
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
                            color: "white",
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

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isSwiping}
      >
        <ProfileHeader onEditPress={handleEditProfile} onSignOut={handleSignOut} stats={MOCK_USER_STATS} />
        
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
            <Animated.View
              style={{
                flexDirection: "row",
                width: screenWidth * 2,
                transform: [{ translateX }],
              }}
              {...panResponder.panHandlers}
            >
              {/* My Questions Tab */}
              <View style={{ width: screenWidth, paddingHorizontal: 24 }}>
                {editingQuestion ? (
                  <View
                    style={{
                      backgroundColor: "#1c1c1c",
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: "#333",
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
                      Edit Question
                    </Text>
                    <TextInput
                      value={editTitle}
                      onChangeText={setEditTitle}
                      placeholder="Title"
                      placeholderTextColor="#666"
                      style={{
                        backgroundColor: "#0f0f0f",
                        borderRadius: 8,
                        padding: 12,
                        color: "white",
                        fontSize: 16,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: "#333",
                      }}
                    />
                    <TextInput
                      value={editPrompt}
                      onChangeText={setEditPrompt}
                      placeholder="Prompt"
                      placeholderTextColor="#666"
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      style={{
                        backgroundColor: "#0f0f0f",
                        borderRadius: 8,
                        padding: 12,
                        color: "white",
                        fontSize: 16,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: "#333",
                        minHeight: 100,
                      }}
                    />
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Pressable
                        onPress={handleSaveEdit}
                        style={{
                          flex: 1,
                          backgroundColor: "#fff",
                          borderRadius: 8,
                          padding: 12,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#000", fontSize: 14, fontWeight: "600" }}>Save</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleCancelEdit}
                        style={{
                          flex: 1,
                          backgroundColor: "transparent",
                          borderRadius: 8,
                          padding: 12,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: "#333",
                        }}
                      >
                        <Text style={{ color: "#aaa", fontSize: 14, fontWeight: "600" }}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {myQuestions.length > 0 ? (
                  myQuestions.map((question) => (
                    <MyQuestionCard
                      key={question.id}
                      question={question}
                      onPress={() => handleQuestionPress(question)}
                      onEdit={() => handleEditQuestion(question)}
                      onDelete={() => handleDeleteQuestion(question.id)}
                    />
                  ))
                ) : (
                  <View style={{ alignItems: "center", padding: 32 }}>
                    <Octicons name="question" size={48} color="#666" style={{ marginBottom: 16 }} />
                    <Text style={{ color: "#666", fontSize: 16 }}>You haven&apos;t created any questions yet</Text>
                  </View>
                )}
              </View>

              <View style={{ width: screenWidth, paddingHorizontal: 24 }}>
                {MOCK_VOTE_HISTORY.length > 0 ? (
                  MOCK_VOTE_HISTORY.map((item) => (
                    <VoteHistoryItemCard key={item.questionId} item={item} onPress={() => handleVoteHistoryPress(item)} />
                  ))
                ) : (
                  <View style={{ alignItems: "center", padding: 32 }}>
                    <Octicons name="check-circle" size={48} color="#666" style={{ marginBottom: 16 }} />
                    <Text style={{ color: "#666", fontSize: 16 }}>You haven&apos;t voted on any questions yet</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
