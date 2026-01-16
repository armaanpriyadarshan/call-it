import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
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
];

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;

const calculatePercentage = (votes: number, total: number) => (total > 0 ? (votes / total) * 100 : 0);

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
      borderWidth: pressed ? 1 : 0,
      borderColor: "#333",
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
  showProgress: boolean;
  align: "left" | "right";
}> = ({ percentage, votes, isSelected, showProgress, align }) => (
  <View
    style={{
      alignItems: align === "right" ? "flex-end" : "flex-start",
      minWidth: 65,
      opacity: showProgress ? 1 : 0,
    }}
  >
    <Text
      style={{
        color: isSelected ? "#ddd" : "#aaa",
        fontSize: 14,
        fontWeight: "600",
      }}
    >
      {showProgress ? `${Math.round(percentage)}%` : "0%"}
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
              showProgress={swipeProgress > 0}
              align={isRight ? "left" : "right"}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const [index, setIndex] = React.useState(0);
  const [questions, setQuestions] = React.useState(SAMPLE_QUESTIONS);
  const question = questions[index] ?? null;
  const [swipeProgress, setSwipeProgress] = React.useState(0);
  const [swipeDirection, setSwipeDirection] = React.useState<"left" | "right" | null>(null);
  const [voteHistory, setVoteHistory] = React.useState<VoteHistoryItem[]>([]);

  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const entryScale = React.useRef(new Animated.Value(1)).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  const cardStyle = {
    transform: [{ translateX: position.x }, { rotate }],
  };

  const resetCard = React.useCallback(() => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
    }).start();
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

      position.setValue({ x: 0, y: 0 });
      setIndex((i) => {
        const nextIdx = i + 1;
        return nextIdx >= questions.length ? 0 : nextIdx;
      });
    },
    [position, questions.length, recordVote]
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
    setIndex(previousIndex);
    position.setValue({ x: 0, y: 0 });
    setSwipeProgress(0);
    setSwipeDirection(null);
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
      }).start(() => advance(direction));
    },
    [position, advance]
  );

  const panResponder = React.useMemo(
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
          position.setValue({ x: gesture.dx, y: 0 });
        },

        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            forceSwipe("right");
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            forceSwipe("left");
          } else {
            resetCard();
            setSwipeProgress(0);
            setSwipeDirection(null);
          }
        },

        onPanResponderTerminate: () => {
          resetCard();
          setSwipeProgress(0);
          setSwipeDirection(null);
        },
      }),
    [resetCard, forceSwipe, position]
  );

  React.useEffect(() => {
    entryScale.setValue(0.98);
    Animated.spring(entryScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: false,
    }).start();
  }, [index, entryScale]);

  React.useEffect(() => {
    const listenerId = position.x.addListener(({ value }) => {
      const absDx = Math.abs(value);
      const progress = Math.min(absDx / SWIPE_THRESHOLD, 1);
      setSwipeProgress(progress);

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
  }, [index, position.x]);

  if (!question) {
    return (
      <View style={{ flex: 1, backgroundColor: "black", padding: 24, justifyContent: "center" }}>
        <Text style={{ color: "white" }}>No questions</Text>
      </View>
    );
  }

  const currentVotes = question.votes ?? { left: 0, right: 0 };
  const totalVotes = currentVotes.left + currentVotes.right;
  const leftPercentage = calculatePercentage(currentVotes.left, totalVotes);
  const rightPercentage = calculatePercentage(currentVotes.right, totalVotes);
  const leftHighlight = swipeDirection === "left" ? swipeProgress : 0;
  const rightHighlight = swipeDirection === "right" ? swipeProgress : 0;

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
        {voteHistory.length > 0 ? (
          <ActionButton onPress={undo} icon="undo" label="Undo" />
        ) : (
          <View style={{ minWidth: 60 }} />
        )}

        <ActionButton onPress={skip} icon="arrow-right" label="Skip" />
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            {
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#333",
              backgroundColor: "#0f0f0f",
              overflow: "hidden",
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
              votes={currentVotes.left}
              swipeProgress={swipeProgress}
              swipeDirection={swipeDirection}
              isSelected={swipeDirection === "left"}
              highlight={leftHighlight}
            />

            <ChoiceOption
              choice={question.right}
              direction="right"
              percentage={rightPercentage}
              votes={currentVotes.right}
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