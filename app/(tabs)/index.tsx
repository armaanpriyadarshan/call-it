import { ActionButton, ChoiceOption } from "@/components/voting";
import { useRealtimeVoteCounts } from "@/lib/hooks/useRealtime";
import { getProfile } from "@/lib/queries/profiles";
import { Question as DbQuestion, getQuestions } from "@/lib/queries/questions";
import {
    createVote,
    deleteVote,
    getUserVotes,
    getVoteCounts,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { Question, VoteHistoryItem } from "@/types";
import { getNormalizedPercentages } from "@/utils/voting";
import { useAuth, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
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

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;

function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  votes: { left: number; right: number },
  creatorUsername: string | null,
  isAnonymous: boolean,
  currentUserId: string | null,
  userVote: "left" | "right" | undefined,
): Question {
  const isOwnQuestion =
    currentUserId !== null && dbQuestion.user_id === currentUserId;
  return {
    id: dbQuestion.id,
    visibleUserId: dbQuestion.user_id,
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
    hasVoted: userVote !== undefined,
    userVote,
    isOwnQuestion,
  };
}

const FEED_TABS = [
  { id: "foryou", icon: "star-fill" as const },
  { id: "trending", icon: "flame" as const },
  { id: "friends", icon: "people" as const },
];

export default function HomeScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [selectedTab, setSelectedTab] = React.useState(0);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const [swipeProgress, setSwipeProgress] = React.useState(0);
  const [swipeDirection, setSwipeDirection] = React.useState<
    "left" | "right" | null
  >(null);
  const [voteHistory, setVoteHistory] = React.useState<VoteHistoryItem[]>([]);
  const [cardOpacity, setCardOpacity] = React.useState(1);

  const question = questions[displayIndex] ?? null;

  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const entryScale = React.useRef(new Animated.Value(1)).current;
  const hasFetchedRef = React.useRef(false);
  const supabaseRef = React.useRef<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);
  const questionsRef = React.useRef(questions);
  const displayIndexRef = React.useRef(displayIndex);
  const voteHistoryRef = React.useRef(voteHistory);
  const userRef = React.useRef(user);
  const getTokenRef = React.useRef(getToken);
  const initiallyVotedIdsRef = React.useRef<Set<string>>(new Set());
  const localVoteIdsRef = React.useRef<Set<string>>(new Set());

  questionsRef.current = questions;
  displayIndexRef.current = displayIndex;
  voteHistoryRef.current = voteHistory;
  userRef.current = user;
  getTokenRef.current = getToken;

  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClerkSupabaseClient({
        getToken: getTokenRef.current,
      });
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
        const [voteCounts, userVotesMap] = await Promise.all([
          getVoteCounts(supabase, questionIds),
          getUserVotes(supabase, user.id, questionIds),
        ]);

        const eligibleQuestions = dbQuestions.filter(
          (q) => !userVotesMap.has(q.id) && q.user_id !== user.id,
        );
        const creatorIds = [
          ...new Set(eligibleQuestions.map((q) => q.user_id)),
        ];
        const profiles = await Promise.all(
          creatorIds.map((id) => getProfile(supabase, id).catch(() => null)),
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

        initiallyVotedIdsRef.current = new Set();

        const mappedQuestions = eligibleQuestions.map((dbQ) => {
          const votes = voteCounts.get(dbQ.id) ?? { left: 0, right: 0 };
          const displayName = profileMap.get(dbQ.user_id) ?? null;
          const userVote = userVotesMap.get(dbQ.id);
          return mapDbQuestionToQuestion(
            dbQ,
            votes,
            displayName,
            dbQ.is_anonymous,
            user.id,
            userVote,
          );
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

  const supabase = React.useMemo(() => {
    if (!user) return null;
    return getSupabase();
  }, [user]);

  const refreshVoteCounts = React.useCallback(
    async (questionId: string) => {
      if (!user || !supabase) return;

      const [updatedVoteCounts, userVotesMap] = await Promise.all([
        getVoteCounts(supabase, [questionId]),
        getUserVotes(supabase, user.id, [questionId]),
      ]);

      const newCounts = updatedVoteCounts.get(questionId) ?? {
        left: 0,
        right: 0,
      };
      const userVote = userVotesMap.get(questionId);

      setQuestions((prev) => {
        const updated = [...prev];
        const index = updated.findIndex((q) => q.id === questionId);
        if (index !== -1) {
          const question = updated[index];
          updated[index] = {
            ...question,
            votes: newCounts,
            hasVoted: userVote !== undefined,
            userVote,
          };
        }
        return updated;
      });
    },
    [user, supabase],
  );

  const questionIds = React.useMemo(() => {
    return questions.map((q) => q.id);
  }, [questions]);

  // Re-enabled - was not the cause of skipping
  useRealtimeVoteCounts(supabase, questionIds, refreshVoteCounts);


  // Remove questions that were voted on in other tabs (runs on tab focus)
  const syncAndRemoveVotedQuestions = React.useCallback(async () => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    if (!currentUser || currentQuestions.length === 0) return;

    const supabase = getSupabase();
    const ids = currentQuestions.map((q) => q.id);
    const userVotesMap = await getUserVotes(supabase, currentUser.id, ids);

    const votedIds = new Set(userVotesMap.keys());
    // Only consider external votes (not local ones we're tracking)
    const externalVotedIds = new Set(
      [...votedIds].filter((id) => !localVoteIdsRef.current.has(id))
    );

    if (externalVotedIds.size === 0) return;

    setQuestions((prev) => {
      const filtered = prev.filter((q) => !externalVotedIds.has(q.id));
      return filtered;
    });

    // Reset display index if needed
    setDisplayIndex((prev) => {
      const newLength = currentQuestions.length - externalVotedIds.size;
      if (prev >= newLength) {
        return Math.max(0, newLength - 1);
      }
      return prev;
    });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      syncAndRemoveVotedQuestions();
    }, [syncAndRemoveVotedQuestions]),
  );

  const actionsRef = React.useRef({
    recordVote: (_direction: "left" | "right") => {},
    advance: (_direction: "left" | "right" | null) => {},
    resetCard: () => {},
    forceSwipe: (_direction: "left" | "right") => {},
    skip: () => {},
    undo: () => {},
  });

  actionsRef.current.recordVote = async (direction: "left" | "right") => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser || !currentQuestion) return;

    if (currentQuestion.hasVoted || currentQuestion.isOwnQuestion) return;

    // Track this as a local vote so realtime handler doesn't remove it
    localVoteIdsRef.current.add(currentQuestion.id);

    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[currentIndex];
      if (q) {
        const votes = q.votes ?? { left: 0, right: 0 };
        updated[currentIndex] = {
          ...q,
          votes: { ...votes, [direction]: votes[direction] + 1 },
          hasVoted: true,
          userVote: direction,
        };
      }
      return updated;
    });

    setVoteHistory((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        questionIndex: currentIndex,
        direction,
      },
    ]);

    const supabase = getSupabase();
    try {
      await createVote(supabase, currentQuestion.id, currentUser.id, direction);

      const updatedVoteCounts = await getVoteCounts(supabase, [
        currentQuestion.id,
      ]);
      const newCounts = updatedVoteCounts.get(currentQuestion.id) ?? {
        left: 0,
        right: 0,
      };

      setQuestions((prev) => {
        const updated = [...prev];
        const q = updated[currentIndex];
        if (q && q.id === currentQuestion.id) {
          updated[currentIndex] = {
            ...q,
            votes: newCounts,
            hasVoted: true,
            userVote: direction,
          };
        }
        return updated;
      });
    } catch (err) {
      console.error("Failed to record vote:", err);
      setQuestions((prev) => {
        const updated = [...prev];
        const q = updated[currentIndex];
        if (q && q.id === currentQuestion.id) {
          const votes = q.votes ?? { left: 0, right: 0 };
          updated[currentIndex] = {
            ...q,
            votes: {
              ...votes,
              [direction]: Math.max(0, votes[direction] - 1),
            },
            hasVoted: false,
            userVote: undefined,
          };
        }
        return updated;
      });
      setVoteHistory((prev) => prev.slice(0, -1));
    }
  };

  actionsRef.current.advance = (direction: "left" | "right" | null) => {
    if (direction) {
      actionsRef.current.recordVote(direction);
    }

    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;

    // Don't advance if there are no questions or only one question
    if (currentQuestions.length <= 1) {
      setSwipeProgress(0);
      setSwipeDirection(null);
      return;
    }

    const nextIdx =
      currentIndex + 1 >= currentQuestions.length ? 0 : currentIndex + 1;

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
    const currentQuestions = questionsRef.current;

    if (history.length === 0 || !currentUser) return;

    const lastVote = history[history.length - 1];
    const questionId = lastVote.questionId;

    if (!questionId) return;

    // Find the question by ID (index may have changed if array was modified)
    const actualIndex = currentQuestions.findIndex((q) => q.id === questionId);
    if (actualIndex === -1) {
      // Question was removed from array, can't undo
      console.warn("Cannot undo: question no longer in list");
      setVoteHistory((prev) => prev.slice(0, -1));
      return;
    }

    // Remove from local vote tracking
    localVoteIdsRef.current.delete(questionId);

    const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(questionId);

    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[actualIndex];
      if (q) {
        const votes = q.votes ?? { left: 0, right: 0 };
        updated[actualIndex] = {
          ...q,
          votes: {
            ...votes,
            [lastVote.direction]: Math.max(0, votes[lastVote.direction] - 1),
          },
          hasVoted: wasVotedBeforeSession,
          userVote: wasVotedBeforeSession ? q.userVote : undefined,
        };
      }
      return updated;
    });

    if (!wasVotedBeforeSession) {
      const supabase = getSupabase();
      deleteVote(supabase, questionId, currentUser.id)
        .then(() => {
          refreshVoteCounts(questionId);
        })
        .catch((err) => {
          console.error("Failed to delete vote:", err);
        });
    }

    setVoteHistory((prev) => prev.slice(0, -1));
    setDisplayIndex(actualIndex);
    position.setValue({ x: 0, y: 0 });
    setSwipeProgress(0);
    setSwipeDirection(null);
    setCardOpacity(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
    [position],
  );

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
      <View style={{ flex: 1, backgroundColor: "black", paddingHorizontal: 24 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 32,
            paddingTop: insets.top + 8,
            paddingBottom: 8,
            marginBottom: 8,
          }}
        >
          {FEED_TABS.map((tab, index) => (
            <Pressable
              key={tab.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTab(index);
              }}
              style={{
                padding: 8,
              }}
            >
              <Octicons
                name={tab.icon}
                size={24}
                color={selectedTab === index ? "white" : "#555"}
              />
            </Pressable>
          ))}
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size='large' color='white' />
        </View>
      </View>
    );
  }

  if (!question || questions.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "black", paddingHorizontal: 24 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 32,
            paddingTop: insets.top + 8,
            paddingBottom: 8,
            marginBottom: 8,
          }}
        >
          {FEED_TABS.map((tab, index) => (
            <Pressable
              key={tab.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTab(index);
              }}
              style={{
                padding: 8,
              }}
            >
              <Octicons
                name={tab.icon}
                size={24}
                color={selectedTab === index ? "white" : "#555"}
              />
            </Pressable>
          ))}
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 18, textAlign: "center" }}>
            No questions to vote on
          </Text>
          <Text
            style={{
              color: "#aaa",
              fontSize: 14,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Check back later or create your own!
          </Text>
        </View>
      </View>
    );
  }

  const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(question.id);
  const isResultsMode = wasVotedBeforeSession || question.isOwnQuestion;

  const currentVotes = question.votes ?? { left: 0, right: 0 };
  const currentTotal = currentVotes.left + currentVotes.right;

  const previewVotes = {
    left: swipeDirection === "left" ? currentVotes.left + 1 : currentVotes.left,
    right:
      swipeDirection === "right" ? currentVotes.right + 1 : currentVotes.right,
  };
  const totalPreviewVotes = previewVotes.left + previewVotes.right;

  const percentages = isResultsMode
    ? getNormalizedPercentages(
        currentVotes.left,
        currentVotes.right,
        currentTotal,
      )
    : swipeProgress > 0 && swipeDirection
      ? getNormalizedPercentages(
          previewVotes.left,
          previewVotes.right,
          totalPreviewVotes,
        )
      : getNormalizedPercentages(
          currentVotes.left,
          currentVotes.right,
          currentTotal,
        );

  const leftVotes = isResultsMode
    ? currentVotes.left
    : swipeProgress > 0 && swipeDirection === "left"
      ? previewVotes.left
      : currentVotes.left;
  const rightVotes = isResultsMode
    ? currentVotes.right
    : swipeProgress > 0 && swipeDirection === "right"
      ? previewVotes.right
      : currentVotes.right;

  return (
    <View style={{ flex: 1, backgroundColor: "black", paddingHorizontal: 24 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 32,
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          marginBottom: 8,
        }}
      >
        {FEED_TABS.map((tab, index) => (
          <Pressable
            key={tab.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedTab(index);
            }}
            style={{
              padding: 8,
            }}
          >
            <Octicons
              name={tab.icon}
              size={24}
              color={selectedTab === index ? "white" : "#555"}
            />
          </Pressable>
        ))}
      </View>

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
          <ActionButton
            onPress={() => actionsRef.current.undo()}
            icon='undo'
            label='Undo'
          />
        ) : (
          <View style={{ minWidth: 60 }} />
        )}
        <ActionButton
          onPress={() => actionsRef.current.skip()}
          icon='arrow-right'
          label={isResultsMode ? "Next" : "Skip"}
        />
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
          <View
            style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#222",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta?.category ?? "General"}
              </Text>
              {question.meta?.createdBy && (
                <>
                  <Text style={{ color: "#aaa", fontSize: 12 }}> • </Text>
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
            <Text
              style={{
                color: "white",
                fontSize: 20,
                fontWeight: "800",
                marginTop: 6,
              }}
            >
              {question.title}
            </Text>
          </View>

          <ScrollView
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            nestedScrollEnabled
          >
            <Text style={{ color: "white", fontSize: 16, lineHeight: 22 }}>
              {question.prompt}
            </Text>
            {question.promptImageUrl && (
              <Image
                source={{ uri: question.promptImageUrl }}
                style={{ width: "100%", height: 180, borderRadius: 16 }}
              />
            )}
          </ScrollView>

          <View
            style={{
              padding: 16,
              gap: 12,
              borderTopWidth: 1,
              borderTopColor: "#222",
            }}
          >
            <ChoiceOption
              choice={question.left}
              direction='left'
              percentage={percentages.left}
              votes={leftVotes}
              swipeProgress={isResultsMode ? 0 : swipeProgress}
              swipeDirection={isResultsMode ? null : swipeDirection}
              isSelected={
                isResultsMode
                  ? question.userVote === "left"
                  : swipeDirection === "left"
              }
              highlight={
                isResultsMode
                  ? 0
                  : swipeDirection === "left"
                    ? swipeProgress
                    : 0
              }
              resultsMode={isResultsMode}
            />
            <ChoiceOption
              choice={question.right}
              direction='right'
              percentage={percentages.right}
              votes={rightVotes}
              swipeProgress={isResultsMode ? 0 : swipeProgress}
              swipeDirection={isResultsMode ? null : swipeDirection}
              isSelected={
                isResultsMode
                  ? question.userVote === "right"
                  : swipeDirection === "right"
              }
              highlight={
                isResultsMode
                  ? 0
                  : swipeDirection === "right"
                    ? swipeProgress
                    : 0
              }
              resultsMode={isResultsMode}
            />
            <Text style={{ color: "#777", fontSize: 12 }}>
              {isResultsMode
                ? question.isOwnQuestion
                  ? "This is your question. Swipe to see the next one."
                  : "You've already voted. Swipe to see the next one."
                : "Tip: Scroll vertically in the prompt. Swipe left or right to pick."}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
