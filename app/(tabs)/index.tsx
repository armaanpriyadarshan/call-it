import { useAuth, useUser } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { Question, VoteHistoryItem } from "@/types";
import { ActionButton, ChoiceOption } from "@/components/voting";
import { getNormalizedPercentages } from "@/utils/voting";
import { createClerkSupabaseClient } from "@/lib/supabase";
import { getQuestions, Question as DbQuestion } from "@/lib/queries/questions";
import { getVoteCounts, getUserVotedQuestionIds, createVote, deleteVote } from "@/lib/queries/votes";
import { getProfile } from "@/lib/queries/profiles";

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;

function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  votes: { left: number; right: number },
  creatorUsername: string | null,
  isAnonymous: boolean
): Question {
  return {
    id: dbQuestion.id,
    title: dbQuestion.title,
    prompt: dbQuestion.prompt,
    promptImageUrl: dbQuestion.prompt_image_url ?? undefined,
    left: {
      id: "left",
      label: dbQuestion.left_choice_label,
      imageUrl: dbQuestion.left_choice_image_url ?? undefined,
    },
    right: {
      id: "right",
      label: dbQuestion.right_choice_label,
      imageUrl: dbQuestion.right_choice_image_url ?? undefined,
    },
    votes,
    meta: {
      category: dbQuestion.category ?? undefined,
      createdBy: isAnonymous ? "Anonymous" : (creatorUsername ?? "Unknown"),
    },
    createdAt: dbQuestion.created_at,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const [swipeProgress, setSwipeProgress] = React.useState(0);
  const [swipeDirection, setSwipeDirection] = React.useState<"left" | "right" | null>(null);
  const [voteHistory, setVoteHistory] = React.useState<VoteHistoryItem[]>([]);
  const [cardOpacity, setCardOpacity] = React.useState(1);

  const question = questions[displayIndex] ?? null;

  // Refs for stable callback access
  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const entryScale = React.useRef(new Animated.Value(1)).current;
  const hasFetchedRef = React.useRef(false);
  const supabaseRef = React.useRef<ReturnType<typeof createClerkSupabaseClient> | null>(null);
  const questionsRef = React.useRef(questions);
  const displayIndexRef = React.useRef(displayIndex);
  const voteHistoryRef = React.useRef(voteHistory);
  const userRef = React.useRef(user);
  const getTokenRef = React.useRef(getToken);

  // Keep refs in sync
  questionsRef.current = questions;
  displayIndexRef.current = displayIndex;
  voteHistoryRef.current = voteHistory;
  userRef.current = user;
  getTokenRef.current = getToken;

  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClerkSupabaseClient({ getToken: getTokenRef.current });
    }
    return supabaseRef.current;
  };

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  const cardStyle = {
    transform: [{ translateX: position.x }, { rotate }],
  };

  // Fetch questions on mount
  React.useEffect(() => {
    if (!user || hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchQuestions = async () => {
      try {
        const supabase = getSupabase();
        const dbQuestions = await getQuestions(supabase, { limit: 50 });

        if (dbQuestions.length === 0) {
          setQuestions([]);
          setLoading(false);
          return;
        }

        const questionIds = dbQuestions.map((q) => q.id);
        const [voteCounts, votedIds] = await Promise.all([
          getVoteCounts(supabase, questionIds),
          getUserVotedQuestionIds(supabase, user.id),
        ]);

        const unvotedQuestions = dbQuestions.filter((q) => !votedIds.has(q.id));
        const creatorIds = [...new Set(unvotedQuestions.map((q) => q.user_id))];
        const profiles = await Promise.all(
          creatorIds.map((id) => getProfile(supabase, id).catch(() => null))
        );
        const profileMap = new Map<string, string | null>();
        creatorIds.forEach((id, i) => {
          const profile = profiles[i];
          let displayName: string | null = null;
          if (profile?.username) {
            displayName = profile.username.toLowerCase();
          } else if (profile?.first_name) {
            displayName = profile.first_name.toLowerCase();
          }
          profileMap.set(id, displayName);
        });

        const mappedQuestions = unvotedQuestions.map((dbQ) => {
          const votes = voteCounts.get(dbQ.id) ?? { left: 0, right: 0 };
          const displayName = profileMap.get(dbQ.user_id) ?? null;
          return mapDbQuestionToQuestion(dbQ, votes, displayName, dbQ.is_anonymous);
        });

        setQuestions(mappedQuestions);
      } catch (err) {
        console.error("Failed to fetch questions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [user]);

  // Action handlers stored in ref so panResponder can access latest versions
  const actionsRef = React.useRef({
    recordVote: (_direction: "left" | "right") => {},
    advance: (_direction: "left" | "right" | null) => {},
    resetCard: () => {},
    forceSwipe: (_direction: "left" | "right") => {},
    skip: () => {},
    undo: () => {},
  });

  actionsRef.current.recordVote = (direction: "left" | "right") => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser || !currentQuestion) return;

    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[currentIndex];
      if (q) {
        const votes = q.votes ?? { left: 0, right: 0 };
        updated[currentIndex] = {
          ...q,
          votes: { ...votes, [direction]: votes[direction] + 1 },
        };
      }
      return updated;
    });

    setVoteHistory((prev) => [
      ...prev,
      { questionId: currentQuestion.id, questionIndex: currentIndex, direction },
    ]);

    const supabase = getSupabase();
    createVote(supabase, currentQuestion.id, currentUser.id, direction).catch((err) => {
      console.error("Failed to record vote:", err);
    });
  };

  actionsRef.current.advance = (direction: "left" | "right" | null) => {
    if (direction) {
      actionsRef.current.recordVote(direction);
    }

    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const nextIdx = (currentIndex + 1) >= currentQuestions.length ? 0 : currentIndex + 1;

    setSwipeProgress(0);
    setSwipeDirection(null);
    setCardOpacity(0);
    setDisplayIndex(nextIdx);
  };

  actionsRef.current.resetCard = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
    }).start(() => {
      setSwipeProgress(0);
      setSwipeDirection(null);
    });
  };

  actionsRef.current.forceSwipe = (direction: "left" | "right") => {
    const x = direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSwipeProgress(0);
    setSwipeDirection(null);

    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      actionsRef.current.advance(direction);
    });
  };

  actionsRef.current.skip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    actionsRef.current.advance(null);
  };

  actionsRef.current.undo = () => {
    const currentUser = userRef.current;
    const history = voteHistoryRef.current;

    if (history.length === 0 || !currentUser) return;

    const lastVote = history[history.length - 1];
    const previousIndex = lastVote.questionIndex!;

    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[previousIndex];
      if (q) {
        const votes = q.votes ?? { left: 0, right: 0 };
        updated[previousIndex] = {
          ...q,
          votes: {
            ...votes,
            [lastVote.direction]: Math.max(0, votes[lastVote.direction] - 1),
          },
        };
      }
      return updated;
    });

    setVoteHistory((prev) => prev.slice(0, -1));
    setDisplayIndex(previousIndex);
    position.setValue({ x: 0, y: 0 });
    setSwipeProgress(0);
    setSwipeDirection(null);
    setCardOpacity(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (lastVote.questionId) {
      const supabase = getSupabase();
      deleteVote(supabase, lastVote.questionId, currentUser.id).catch((err) => {
        console.error("Failed to delete vote:", err);
      });
    }
  };

  // Stable pan responder - created once, uses actionsRef for latest handlers
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
            actionsRef.current.forceSwipe("right");
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            actionsRef.current.forceSwipe("left");
          } else {
            actionsRef.current.resetCard();
          }
        },
        onPanResponderTerminate: () => {
          actionsRef.current.resetCard();
        },
      }),
    [position]
  );

  // Card entry animation
  React.useEffect(() => {
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
  }, [displayIndex, entryScale, position]);

  // Track swipe progress
  React.useEffect(() => {
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

    return () => position.x.removeListener(listenerId);
  }, [position.x]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "black", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  if (!question || questions.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "black", padding: 24, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "white", fontSize: 18, textAlign: "center" }}>No questions to vote on</Text>
        <Text style={{ color: "#aaa", fontSize: 14, marginTop: 8, textAlign: "center" }}>
          Check back later or create your own!
        </Text>
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

  const percentages = swipeProgress > 0 && swipeDirection
    ? getNormalizedPercentages(previewVotes.left, previewVotes.right, totalPreviewVotes)
    : getNormalizedPercentages(currentVotes.left, currentVotes.right, currentTotal);

  const leftVotes = swipeProgress > 0 && swipeDirection === "left" ? previewVotes.left : currentVotes.left;
  const rightVotes = swipeProgress > 0 && swipeDirection === "right" ? previewVotes.right : currentVotes.right;

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
          <ActionButton onPress={() => actionsRef.current.undo()} icon="undo" label="Undo" />
        ) : (
          <View style={{ minWidth: 60 }} />
        )}
        <ActionButton onPress={() => actionsRef.current.skip()} icon="arrow-right" label="Skip" />
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
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta?.category ?? "General"}
              </Text>
              {question.meta?.createdBy && (
                <>
                  <Text style={{ color: "#aaa", fontSize: 12 }}> • </Text>
                  {question.meta.createdBy !== "Anonymous" ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({
                          pathname: "/user-profile",
                          params: { username: question.meta?.createdBy },
                        });
                      }}
                    >
                      {({ pressed }) => (
                        <Text style={{ color: "#aaa", fontSize: 12, textDecorationLine: pressed ? "underline" : "none" }}>
                          {question.meta?.createdBy}
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <Text style={{ color: "#aaa", fontSize: 12 }}>{question.meta.createdBy}</Text>
                  )}
                </>
              )}
            </View>
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
              percentage={percentages.left}
              votes={leftVotes}
              swipeProgress={swipeProgress}
              swipeDirection={swipeDirection}
              isSelected={swipeDirection === "left"}
              highlight={swipeDirection === "left" ? swipeProgress : 0}
            />
            <ChoiceOption
              choice={question.right}
              direction="right"
              percentage={percentages.right}
              votes={rightVotes}
              swipeProgress={swipeProgress}
              swipeDirection={swipeDirection}
              isSelected={swipeDirection === "right"}
              highlight={swipeDirection === "right" ? swipeProgress : 0}
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
