import { useExploreTabReset } from "@/contexts/explore-tab-context";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type Choice = {
  id: "left" | "right";
  label: string;
  imageUrl?: string;
};

type Question = {
  id: string;
  title: string;
  prompt: string;
  promptImageUrl?: string;
  left: Choice;
  right: Choice;
  votes?: {
    left: number;
    right: number;
  };
  meta?: {
    category?: string;
    createdBy?: string;
  };
};

type VoteHistoryItem = {
  questionIndex: number;
  direction: "left" | "right";
};

const SAMPLE_QUESTIONS: Question[] = [
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
    meta: { category: "Style", createdBy: "Anonymous" },
  },
  {
    id: "q2",
    title: "Text them?",
    prompt: "Do I double-text if they haven't replied in 24 hours?",
    left: { id: "left", label: "No (chill)" },
    right: { id: "right", label: "Yes (send it)" },
    votes: { left: 45, right: 23 },
    meta: { category: "Social", createdBy: "Anonymous" },
  },
  {
    id: "q3",
    title: "Long prompt stress test",
    prompt: "I'm picking between two internships. Option A is a bigger brand, but the team is less aligned with what I want to do long-term. Option B is smaller, but I'll get more ownership and mentorship. I'm worried Option B won't look as strong on my resume, but I also don't want to be stuck doing boring work all summer. For context: I care about learning, actual shipping, and a team that invests in me. Which should I choose?",
    left: { id: "left", label: "Option A (brand)" },
    right: { id: "right", label: "Option B (growth)" },
    votes: { left: 7, right: 15 },
    meta: { category: "Career", createdBy: "Anonymous" },
  },
  {
    id: "q4",
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
    meta: { category: "Food", createdBy: "Anonymous" },
  },
  {
    id: "q5",
    title: "Weekend plans",
    prompt: "What should I do this weekend?",
    left: { id: "left", label: "Stay home" },
    right: { id: "right", label: "Go out" },
    votes: { left: 18, right: 32 },
    meta: { category: "Social", createdBy: "Anonymous" },
  },
  {
    id: "q6",
    title: "Career move",
    prompt: "Should I take the promotion or switch companies?",
    left: { id: "left", label: "Take promotion" },
    right: { id: "right", label: "Switch companies" },
    votes: { left: 25, right: 19 },
    meta: { category: "Career", createdBy: "Anonymous" },
  },
  {
    id: "q7",
    title: "Travel destination",
    prompt: "Where should I go for my next vacation?",
    left: {
      id: "left",
      label: "Beach",
      imageUrl: "https://images.unsplash.com/photo-1507525421304-6d5d6e4a6c8b?w=400&h=400&fit=crop",
    },
    right: {
      id: "right",
      label: "Mountains",
      imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop",
    },
    votes: { left: 42, right: 28 },
    meta: { category: "Travel", createdBy: "Anonymous" },
  },
  {
    id: "q8",
    title: "Morning routine",
    prompt: "What's your ideal morning?",
    left: { id: "left", label: "Early riser" },
    right: { id: "right", label: "Sleep in" },
    votes: { left: 31, right: 44 },
    meta: { category: "Health", createdBy: "Anonymous" },
  },
];

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const LEFT_EDGE_THRESHOLD = 50;
const MAX_RECENT_SEARCHES = 10;

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

const calculateVoteData = (
  question: Question | null,
  swipeProgress: number,
  swipeDirection: "left" | "right" | null
) => {
  if (!question) {
    return {
      leftPercentage: 0,
      rightPercentage: 0,
      leftVotes: 0,
      rightVotes: 0,
      leftHighlight: 0,
      rightHighlight: 0,
    };
  }

  const currentVotes = question.votes ?? { left: 0, right: 0 };
  const currentTotal = currentVotes.left + currentVotes.right;

  const previewVotes = {
    left: swipeDirection === "left" ? currentVotes.left + 1 : currentVotes.left,
    right: swipeDirection === "right" ? currentVotes.right + 1 : currentVotes.right,
  };
  const totalPreviewVotes = previewVotes.left + previewVotes.right;

  const percentages =
    swipeProgress > 0 && swipeDirection
      ? getNormalizedPercentages(previewVotes.left, previewVotes.right, totalPreviewVotes)
      : getNormalizedPercentages(currentVotes.left, currentVotes.right, currentTotal);

  return {
    leftPercentage: percentages.left,
    rightPercentage: percentages.right,
    leftVotes: swipeProgress > 0 && swipeDirection === "left" ? previewVotes.left : currentVotes.left,
    rightVotes: swipeProgress > 0 && swipeDirection === "right" ? previewVotes.right : currentVotes.right,
    leftHighlight: swipeDirection === "left" ? swipeProgress : 0,
    rightHighlight: swipeDirection === "right" ? swipeProgress : 0,
  };
};

const ActionButton: React.FC<{
  onPress: () => void;
  icon: keyof typeof Octicons.glyphMap;
  label: string;
}> = ({ onPress, icon, label }) => (
  <Pressable
    onPress={onPress}
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
      <Octicons name={icon} size={24} color="#aaa" />
      <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4, fontWeight: "500" }}>{label}</Text>
    </View>
  </Pressable>
);

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
  choice: Choice;
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

const QuestionCard: React.FC<{ question: Question; onPress: () => void }> = ({ question, onPress }) => {
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

      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          {question.meta?.category && (
            <Text style={{ color: "#aaa", fontSize: 12, marginRight: 8 }}>{question.meta.category}</Text>
          )}
          {question.meta?.createdBy && (
            <Text style={{ color: "#666", fontSize: 12 }}>• {question.meta.createdBy}</Text>
          )}
        </View>

        <Text style={{ color: "white", fontSize: 18, fontWeight: "700", marginBottom: 8 }}>{question.title}</Text>

        <Text style={{ color: "#aaa", fontSize: 14, marginBottom: 8 }} numberOfLines={3}>
          {question.prompt}
        </Text>

        <Text style={{ color: "#666", fontSize: 12 }}>
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </Text>
      </View>
    </Pressable>
  );
};

const SearchBar = React.forwardRef<
  TextInput,
  {
    value: string;
    onChangeText: (text: string) => void;
    onClear: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onSubmitEditing: () => void;
  }
>(function SearchBar({ value, onChangeText, onClear, onFocus, onBlur, onSubmitEditing }, ref) {
  return (
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
      }}
    >
      <Octicons name="search" size={18} color="#666" style={{ marginRight: 8 }} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
        placeholder="Search questions"
        placeholderTextColor="#666"
        style={{
          flex: 1,
          color: "white",
          fontSize: 16,
        }}
      />
      {value.length > 0 && (
        <Pressable onPress={onClear}>
          <Octicons name="x" size={18} color="#666" />
        </Pressable>
      )}
    </View>
  );
});

const RecentSearchItem: React.FC<{
  query: string;
  onPress: () => void;
  onDelete: () => void;
}> = ({ query, onPress, onDelete }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#222",
    }}
  >
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Octicons name="clock" size={18} color="#666" style={{ marginRight: 12 }} />
      <Text style={{ color: "white", fontSize: 16, flex: 1 }}>{query}</Text>
    </Pressable>
    <Pressable
      onPress={onDelete}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => ({
        padding: 8,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Octicons name="x" size={18} color="#666" />
    </Pressable>
  </View>
);

const AutocompleteItem: React.FC<{
  suggestion: string;
  onPress: () => void;
}> = ({ suggestion, onPress }) => (
  <Pressable
    onPress={onPress}
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#222",
    }}
  >
    <Octicons name="search" size={18} color="#666" style={{ marginRight: 12 }} />
    <Text style={{ color: "white", fontSize: 16 }}>{suggestion}</Text>
  </Pressable>
);

export default function ExploreScreen() {
  const { registerResetCallback, unregisterResetCallback } = useExploreTabReset();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [performedSearch, setPerformedSearch] = React.useState("");
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const [questions, setQuestions] = React.useState(SAMPLE_QUESTIONS);
  const [viewMode, setViewMode] = React.useState<"list" | "card">("list");
  const [index, setIndex] = React.useState(0);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const question = questions[displayIndex] ?? null;
  const [swipeProgress, setSwipeProgress] = React.useState(0);
  const [swipeDirection, setSwipeDirection] = React.useState<"left" | "right" | null>(null);
  const [voteHistory, setVoteHistory] = React.useState<VoteHistoryItem[]>([]);
  const [cardOpacity, setCardOpacity] = React.useState(1);

  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const entryScale = React.useRef(new Animated.Value(1)).current;
  const chevronWidth = React.useRef(new Animated.Value(0)).current;
  const chevronOpacity = React.useRef(new Animated.Value(0)).current;
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedSearchInputRef = React.useRef<TextInput>(null);

  const clearBlurTimeout = React.useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  const addToRecentSearches = React.useCallback((query: string) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((q) => q !== query);
      return [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    });
  }, []);

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  const cardStyle = {
    transform: [{ translateX: position.x }, { rotate }],
  };

  const handleCardPress = React.useCallback(
    (question: Question) => {
      const foundIndex = questions.findIndex((q) => q.id === question.id);
      if (foundIndex >= 0) {
        setIndex(foundIndex);
        setDisplayIndex(foundIndex);
        setViewMode("card");
        position.setValue({ x: 0, y: 0 });
        setSwipeProgress(0);
        setSwipeDirection(null);
        setCardOpacity(1);
        entryScale.setValue(1);
      }
    },
    [questions, position, entryScale]
  );

  const handleBackToList = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    setSwipeProgress(0);
    setSwipeDirection(null);
    position.setValue({ x: 0, y: 0 });
  }, [position]);

  const resetCard = React.useCallback(() => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
    }).start(() => {
      setSwipeProgress(0);
      setSwipeDirection(null);
    });
  }, [position]);

  const recordVote = React.useCallback(
    (direction: "left" | "right") => {
      setQuestions((prev) => {
        const updated = [...prev];
        const currentQ = updated[index];
        if (currentQ) {
          const currentVotes = currentQ.votes ?? { left: 0, right: 0 };
          updated[index] = {
            ...currentQ,
            votes: {
              ...currentVotes,
              [direction]: currentVotes[direction] + 1,
            },
          };
        }
        return updated;
      });
      setVoteHistory((prev) => [...prev, { questionIndex: index, direction }]);
    },
    [index]
  );

  const advance = React.useCallback(
    (direction: "left" | "right" | null = null) => {
      if (direction) {
        recordVote(direction);
      }

      const nextIdx = (displayIndex + 1) >= questions.length ? 0 : displayIndex + 1;

      setSwipeProgress(0);
      setSwipeDirection(null);
      setCardOpacity(0);
      setDisplayIndex(nextIdx);
      setIndex(nextIdx);
    },
    [questions.length, recordVote, displayIndex]
  );

  const skip = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    advance(null);
  }, [advance]);

  const undo = React.useCallback(() => {
    if (voteHistory.length === 0) return;

    const lastVote = voteHistory[voteHistory.length - 1];
    const previousIndex = lastVote.questionIndex;

    setQuestions((prev) => {
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
    setDisplayIndex(previousIndex);
    setIndex(previousIndex);
    position.setValue({ x: 0, y: 0 });
    setSwipeProgress(0);
    setSwipeDirection(null);
    setCardOpacity(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [voteHistory, position]);

  const forceSwipe = React.useCallback(
    (direction: "left" | "right") => {
      const x = direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSwipeProgress(0);
      setSwipeDirection(null);

      Animated.timing(position, {
        toValue: { x, y: 0 },
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        advance(direction);
      });
    },
    [position, advance]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (evt, gesture) => {
          if (evt.nativeEvent.pageX < LEFT_EDGE_THRESHOLD && gesture.dx > 30) {
            return true;
          }

          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          if (dy > dx) return false;
          return dx > HORIZONTAL_ACTIVATION_DX;
        },

        onPanResponderMove: (evt, gesture) => {
          if (evt.nativeEvent.pageX < LEFT_EDGE_THRESHOLD) {
            return;
          }
          position.setValue({ x: gesture.dx, y: 0 });
        },

        onPanResponderRelease: (evt, gesture) => {
          if (evt.nativeEvent.pageX < LEFT_EDGE_THRESHOLD && gesture.dx > SWIPE_THRESHOLD) {
            handleBackToList();
            position.setValue({ x: 0, y: 0 });
            return;
          }

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
    [resetCard, forceSwipe, position, handleBackToList]
  );

  const autocompleteSuggestions = React.useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) return [];

    const query = searchQuery.toLowerCase();
    const suggestions = new Set<string>();

    questions.forEach((q) => {
      if (q.title.toLowerCase().includes(query)) {
        suggestions.add(q.title);
      }
      if (q.meta?.category?.toLowerCase().includes(query)) {
        suggestions.add(q.meta.category);
      }
      if (q.left.label.toLowerCase().includes(query)) {
        suggestions.add(q.left.label);
      }
      if (q.right.label.toLowerCase().includes(query)) {
        suggestions.add(q.right.label);
      }
    });

    return Array.from(suggestions).slice(0, 5);
  }, [searchQuery, questions]);

  const filteredQuestions = React.useMemo(() => {
    if (!performedSearch.trim()) return [];

    const query = performedSearch.toLowerCase();
    return questions.filter(
      (q) =>
        q.title.toLowerCase().includes(query) ||
        q.prompt.toLowerCase().includes(query) ||
        q.meta?.category?.toLowerCase().includes(query) ||
        q.left.label.toLowerCase().includes(query) ||
        q.right.label.toLowerCase().includes(query)
    );
  }, [performedSearch, questions]);

  const handleSearchSubmit = React.useCallback(() => {
    if (searchQuery.trim()) {
      const trimmed = searchQuery.trim();
      setPerformedSearch(trimmed);
      if (!recentSearches.includes(trimmed)) {
        addToRecentSearches(trimmed);
      }
      setSearchFocused(false);
    }
  }, [searchQuery, recentSearches, addToRecentSearches]);

  const handleSearchClose = React.useCallback(() => {
    clearBlurTimeout();

    Animated.parallel([
      Animated.timing(chevronWidth, {
        toValue: 0,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(chevronOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setSearchFocused(false);
    });
  }, [chevronWidth, chevronOpacity, clearBlurTimeout]);

  const handleSearchClear = React.useCallback(() => {
    clearBlurTimeout();
    setSearchQuery("");
    setPerformedSearch("");
    setSearchFocused(true);
  }, [clearBlurTimeout]);

  const handleSearchTextChange = React.useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (performedSearch && text.trim() !== performedSearch.trim()) {
        setPerformedSearch("");
        setSearchFocused(true);
      }
    },
    [performedSearch]
  );

  const handleSearchFocus = React.useCallback(() => {
    setSearchFocused(true);
    if (performedSearch) {
      setPerformedSearch("");
    }

    Animated.parallel([
      Animated.timing(chevronWidth, {
        toValue: 40,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(chevronOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [performedSearch, chevronWidth, chevronOpacity]);

  const handleSearchBlur = React.useCallback(() => {
    clearBlurTimeout();
    blurTimeoutRef.current = setTimeout(() => {
      if (!searchQuery.trim() && !performedSearch) {
        setSearchFocused(false);
      }
      blurTimeoutRef.current = null;
    }, 200);
  }, [searchQuery, performedSearch, clearBlurTimeout]);

  const handleRecentSearchPress = React.useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      clearBlurTimeout();
      setSearchQuery(trimmed);
      setPerformedSearch(trimmed);
      addToRecentSearches(trimmed);
      setSearchFocused(false);
    },
    [clearBlurTimeout, addToRecentSearches]
  );

  const handleRecentSearchDelete = React.useCallback(
    (query: string) => {
      clearBlurTimeout();
      setRecentSearches((prev) => prev.filter((q) => q !== query));
      setSearchFocused(true);
    },
    [clearBlurTimeout]
  );

  const handleAutocompletePress = React.useCallback(
    (suggestion: string) => {
      const trimmed = suggestion.trim();
      if (!trimmed) return;

      clearBlurTimeout();
      setSearchQuery(trimmed);
      setPerformedSearch(trimmed);
      addToRecentSearches(trimmed);
      setSearchFocused(false);
    },
    [clearBlurTimeout, addToRecentSearches]
  );

  React.useEffect(() => {
    if (viewMode === "card") {
      position.setValue({ x: 0, y: 0 });
      entryScale.setValue(0.98);
      setCardOpacity(0);

      requestAnimationFrame(() => {
        setCardOpacity(1);
        Animated.spring(entryScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [displayIndex, entryScale, viewMode, position]);

  React.useEffect(() => {
    if (viewMode !== "card") return;

    const listenerId = position.x.addListener(({ value }) => {
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
      position.x.removeListener(listenerId);
    };
  }, [displayIndex, position.x, viewMode]);

  const viewModeRef = React.useRef(viewMode);
  const searchFocusedRef = React.useRef(searchFocused);
  const performedSearchRef = React.useRef(performedSearch);
  const prevSearchFocusedRef = React.useRef(searchFocused);

  React.useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  React.useEffect(() => {
    // Focus the search input when transitioning to focused state
    if (searchFocused && !prevSearchFocusedRef.current) {
      // Use requestAnimationFrame to ensure the new component is mounted
      requestAnimationFrame(() => {
        focusedSearchInputRef.current?.focus();
      });
    }
    prevSearchFocusedRef.current = searchFocused;
    searchFocusedRef.current = searchFocused;
  }, [searchFocused]);

  React.useEffect(() => {
    performedSearchRef.current = performedSearch;
  }, [performedSearch]);

  const resetToRoot = React.useCallback(() => {
    if (viewModeRef.current === "card") {
      handleBackToList();
      return true;
    }
    if (searchFocusedRef.current || performedSearchRef.current) {
      setSearchQuery("");
      setPerformedSearch("");
      setSearchFocused(false);
      chevronWidth.setValue(0);
      chevronOpacity.setValue(0);
      return true;
    }
    return false;
  }, [handleBackToList, chevronWidth, chevronOpacity]);

  React.useEffect(() => {
    registerResetCallback(resetToRoot);
    return () => unregisterResetCallback();
  }, [registerResetCallback, unregisterResetCallback, resetToRoot]);

  if (viewMode === "card") {
    if (!question) {
      return (
        <View style={{ flex: 1, backgroundColor: "black", padding: 24, justifyContent: "center" }}>
          <Text style={{ color: "white" }}>No questions</Text>
        </View>
      );
    }

    const { leftPercentage, rightPercentage, leftVotes, rightVotes, leftHighlight, rightHighlight } =
      calculateVoteData(question, swipeProgress, swipeDirection);

    return (
      <View style={{ flex: 1, backgroundColor: "black", padding: 24 }}>
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
          <ActionButton onPress={handleBackToList} icon="arrow-left" label="Back" />

          {voteHistory.length > 0 ? (
            <ActionButton onPress={undo} icon="undo" label="Undo" />
          ) : (
            <View style={{ minWidth: 60 }} />
          )}

          <ActionButton onPress={skip} icon="arrow-right" label="Skip" />
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <Animated.View
            key={`${question.id}-${displayIndex}`}
            {...panResponder.panHandlers}
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
              { transform: [...cardStyle.transform, { scale: entryScale }] },
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

  if (searchFocused && !performedSearch) {
    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        <View
          style={{
            paddingTop: 60,
            paddingBottom: 12,
            paddingHorizontal: 16,
            backgroundColor: "black",
            borderBottomWidth: 1,
            borderBottomColor: "#333",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Animated.View
            style={{
              width: chevronWidth,
              opacity: chevronOpacity,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={handleSearchClose}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Octicons name="chevron-left" size={20} color="#aaa" />
            </Pressable>
          </Animated.View>
          <Animated.View style={{ flex: 1 }}>
            <SearchBar
              ref={focusedSearchInputRef}
              value={searchQuery}
              onChangeText={handleSearchTextChange}
              onClear={handleSearchClear}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onSubmitEditing={handleSearchSubmit}
            />
          </Animated.View>
        </View>

        <View style={{ flex: 1, backgroundColor: "#0f0f0f" }}>
          {searchQuery.trim().length === 0 ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: "#222",
                }}
              >
                <Text style={{ color: "#aaa", fontSize: 14, fontWeight: "600" }}>Recent</Text>
                {recentSearches.length > 0 && (
                  <Pressable onPress={() => setRecentSearches([])}>
                    <Text style={{ color: "#666", fontSize: 14 }}>Clear all</Text>
                  </Pressable>
                )}
              </View>
              {recentSearches.length > 0 ? (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {recentSearches.map((item, idx) => (
                    <RecentSearchItem
                      key={`${item}-${idx}`}
                      query={item}
                      onPress={() => handleRecentSearchPress(item)}
                      onDelete={() => handleRecentSearchDelete(item)}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
                  <Text style={{ color: "#666", fontSize: 14 }}>No recent searches</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#222" }}>
                <Text style={{ color: "#aaa", fontSize: 14, fontWeight: "600" }}>Suggestions</Text>
              </View>
              {autocompleteSuggestions.length > 0 ? (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {autocompleteSuggestions.map((item, idx) => (
                    <AutocompleteItem key={`${item}-${idx}`} suggestion={item} onPress={() => handleAutocompletePress(item)} />
                  ))}
                </ScrollView>
              ) : (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
                  <Text style={{ color: "#666", fontSize: 14 }}>No suggestions found</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <View
        style={{
          paddingTop: 60,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: "black",
          borderBottomWidth: 1,
          borderBottomColor: "#333",
        }}
      >
        <SearchBar
          value={searchQuery}
          onChangeText={handleSearchTextChange}
          onClear={handleSearchClear}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onSubmitEditing={handleSearchSubmit}
        />
      </View>

      {performedSearch ? (
        <FlatList
          data={filteredQuestions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <QuestionCard question={item} onPress={() => handleCardPress(item)} />}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
              <Text style={{ color: "#666", fontSize: 14 }}>
                No results found for {'"' + performedSearch + '"'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <QuestionCard question={item} onPress={() => handleCardPress(item)} />}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}