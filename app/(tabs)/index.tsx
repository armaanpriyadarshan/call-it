import { FullScreenChoice, ProgressBar } from "@/components/voting";
import { useHomeTabReset } from "@/contexts/home-tab-context";
import { useRealtimeVoteCounts } from "@/lib/hooks/useRealtime";
import { getFollowing } from "@/lib/queries/follows";
import { getProfile } from "@/lib/queries/profiles";
import {
    Question as DbQuestion,
    getForYouQuestions,
    getQuestions,
    getTrendingQuestions,
    ScoredQuestion,
} from "@/lib/queries/questions";
import {
    createVote,
    deleteVote,
    getFriendVotesForQuestions,
    getQuestionIdsVotedByUsers,
    getUserVotes,
    getVoteCounts,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { Question, VoteHistoryItem, VotingFlowState } from "@/types";
import { getNormalizedPercentages } from "@/utils/voting";
import { useAuth, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
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
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const TIMER_DURATION = 4000;
const REVEAL_DURATION = 400;

function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  votes: { left: number; right: number },
  creatorUsername: string | null,
  isAnonymous: boolean,
  currentUserId: string | null,
  userVote: "left" | "right" | undefined,
  friendVotes?: { left: { userId: string; avatarUrl: string | null }[]; right: { userId: string; avatarUrl: string | null }[] },
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
    friendVotes: friendVotes ? {
      left: friendVotes.left.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl })),
      right: friendVotes.right.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl })),
    } : undefined,
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
  const { registerResetCallback, unregisterResetCallback } = useHomeTabReset();

  const [selectedTab, setSelectedTab] = React.useState(0);
  const [questionsByTab, setQuestionsByTab] = React.useState<{ [key: number]: Question[] }>({ 0: [], 1: [], 2: [] });
  const [loadedTabs, setLoadedTabs] = React.useState<Set<number>>(new Set());
  const [friendsVotedQuestionIds, setFriendsVotedQuestionIds] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [displayIndices, setDisplayIndices] = React.useState<{ [key: number]: number }>({ 0: 0, 1: 0, 2: 0 });
  const [voteHistories, setVoteHistories] = React.useState<{ [key: number]: VoteHistoryItem[] }>({ 0: [], 1: [], 2: [] });

  const [flowState, setFlowState] = React.useState<VotingFlowState>("viewing");
  const [votedDirection, setVotedDirection] = React.useState<"left" | "right" | null>(null);

  const contentOpacity = React.useRef(new Animated.Value(1)).current;
  const contentScale = React.useRef(new Animated.Value(1)).current;
  const leftBarWidth = React.useRef(new Animated.Value(0)).current;
  const rightBarWidth = React.useRef(new Animated.Value(0)).current;
  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const displayIndex = displayIndices[selectedTab] ?? 0;
  const voteHistory = voteHistories[selectedTab] ?? [];
  const questions = React.useMemo(() => questionsByTab[selectedTab] ?? [], [questionsByTab, selectedTab]);

  const filteredQuestions = React.useMemo(() => {
    if (selectedTab === 2) {
      return questions.filter((q) => friendsVotedQuestionIds.has(q.id));
    }
    return questions;
  }, [questions, selectedTab, friendsVotedQuestionIds]);

  const question = filteredQuestions[displayIndex] ?? null;

  const hasFetchedRef = React.useRef(false);
  const supabaseRef = React.useRef<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);
  const questionsRef = React.useRef(filteredQuestions);
  const displayIndexRef = React.useRef(displayIndex);
  const voteHistoryRef = React.useRef(voteHistory);
  const userRef = React.useRef(user);
  const getTokenRef = React.useRef(getToken);
  const initiallyVotedIdsRef = React.useRef<Set<string>>(new Set());
  const localVoteIdsRef = React.useRef<Set<string>>(new Set());
  const sessionInteractedIdsRef = React.useRef<Set<string>>(new Set());
  const flowStateRef = React.useRef(flowState);

  questionsRef.current = filteredQuestions;
  displayIndexRef.current = displayIndex;
  voteHistoryRef.current = voteHistory;
  userRef.current = user;
  getTokenRef.current = getToken;
  flowStateRef.current = flowState;

  const selectedTabRef = React.useRef(selectedTab);
  const prevSelectedTabRef = React.useRef(selectedTab);
  const questionsByTabRef = React.useRef(questionsByTab);
  const displayIndicesRef = React.useRef(displayIndices);

  questionsByTabRef.current = questionsByTab;
  displayIndicesRef.current = displayIndices;

  React.useEffect(() => {
    const prevTab = prevSelectedTabRef.current;
    const currentFlowState = flowStateRef.current;

    // If we switched tabs while in "voted" state, advance to next question on the previous tab
    if (prevTab !== selectedTab && (currentFlowState === "voted" || currentFlowState === "revealing")) {
      const prevQuestions = questionsByTabRef.current[prevTab] ?? [];
      const prevIndex = displayIndicesRef.current[prevTab] ?? 0;
      if (prevQuestions.length > 0) {
        const nextIdx = prevIndex + 1 >= prevQuestions.length ? 0 : prevIndex + 1;
        setDisplayIndices((prev) => ({ ...prev, [prevTab]: nextIdx }));
      }
    }

    prevSelectedTabRef.current = selectedTab;
    selectedTabRef.current = selectedTab;

    position.stopAnimation();
    position.setValue({ x: 0, y: 0 });
    contentOpacity.setValue(1);
    contentScale.setValue(1);
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setFlowState("viewing");
    setVotedDirection(null);
  }, [selectedTab, loading, position, contentOpacity, contentScale, leftBarWidth, rightBarWidth]);

  React.useEffect(() => {
    if (filteredQuestions.length > 0 && displayIndex >= filteredQuestions.length) {
      setDisplayIndices((prev) => ({ ...prev, [selectedTab]: 0 }));
    }
  }, [filteredQuestions.length, displayIndex, selectedTab]);

  // Skip past already-voted questions (unless interacted with in this session)
  React.useEffect(() => {
    if (filteredQuestions.length === 0) return;
    if (flowState !== "viewing") return;

    const currentQuestion = filteredQuestions[displayIndex];
    if (!currentQuestion) return;

    // If this question was voted on (but not interacted with this session), find the next unvoted question
    const wasInteractedThisSession = sessionInteractedIdsRef.current.has(currentQuestion.id);
    if (currentQuestion.hasVoted && !wasInteractedThisSession && !currentQuestion.isOwnQuestion) {
      let nextIdx = displayIndex;
      let found = false;

      // Search forward for an unvoted question or one we've interacted with
      for (let i = 0; i < filteredQuestions.length; i++) {
        const idx = (displayIndex + i) % filteredQuestions.length;
        const q = filteredQuestions[idx];
        const qInteracted = sessionInteractedIdsRef.current.has(q.id);
        if (!q.hasVoted || qInteracted || q.isOwnQuestion) {
          nextIdx = idx;
          found = true;
          break;
        }
      }

      if (found && nextIdx !== displayIndex) {
        setDisplayIndices((prev) => ({ ...prev, [selectedTab]: nextIdx }));
      }
    }
  }, [filteredQuestions, displayIndex, selectedTab, flowState]);

  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClerkSupabaseClient({
        getToken: getTokenRef.current,
      });
    }
    return supabaseRef.current;
  };

  const fetchQuestionsForTab = React.useCallback(async (tab: number) => {
    const currentUser = userRef.current;
    if (!currentUser) return;

    setLoading(true);
    try {
      const supabase = getSupabase();

      const followingIds = await getFollowing(supabase, currentUser.id);

      if (followingIds.length > 0) {
        const friendsVoted = await getQuestionIdsVotedByUsers(supabase, followingIds);
        setFriendsVotedQuestionIds(friendsVoted);
      } else {
        setFriendsVotedQuestionIds(new Set());
      }

      let dbQuestions: (DbQuestion | ScoredQuestion)[];

      if (tab === 0) {
        dbQuestions = await getForYouQuestions(supabase, currentUser.id, { limit: 50 });
      } else if (tab === 1) {
        dbQuestions = await getTrendingQuestions(supabase, currentUser.id, { limit: 50 });
      } else {
        dbQuestions = await getQuestions(supabase, { limit: 50 });
      }

      if (dbQuestions.length === 0) {
        setQuestionsByTab(prev => ({ ...prev, [tab]: [] }));
        setLoadedTabs(prev => new Set(prev).add(tab));
        setLoading(false);
        return;
      }

      const questionIds = dbQuestions.map((q) => q.id);

      const [voteCounts, userVotesMap, friendVotesMap] = await Promise.all([
        getVoteCounts(supabase, questionIds),
        getUserVotes(supabase, currentUser.id, questionIds),
        followingIds.length > 0
          ? getFriendVotesForQuestions(supabase, questionIds, followingIds)
          : Promise.resolve(new Map()),
      ]);

      const eligibleQuestions = tab === 2
        ? dbQuestions.filter((q) => !userVotesMap.has(q.id) && q.user_id !== currentUser.id)
        : dbQuestions;

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
      localVoteIdsRef.current = new Set();
      sessionInteractedIdsRef.current = new Set();

      const mappedQuestions = eligibleQuestions.map((dbQ) => {
        const scoredQ = dbQ as ScoredQuestion;
        const votes = scoredQ.total_votes !== undefined
          ? { left: voteCounts.get(dbQ.id)?.left ?? 0, right: voteCounts.get(dbQ.id)?.right ?? 0 }
          : voteCounts.get(dbQ.id) ?? { left: 0, right: 0 };
        const displayName = profileMap.get(dbQ.user_id) ?? null;
        const userVote = userVotesMap.get(dbQ.id);
        const friendVotes = friendVotesMap.get(dbQ.id);
        return mapDbQuestionToQuestion(
          dbQ,
          votes,
          displayName,
          dbQ.is_anonymous,
          currentUser.id,
          userVote,
          friendVotes,
        );
      });

      setQuestionsByTab(prev => ({ ...prev, [tab]: mappedQuestions }));
      setLoadedTabs(prev => new Set(prev).add(tab));
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!user || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchQuestionsForTab(0);
  }, [user, fetchQuestionsForTab]);

  React.useEffect(() => {
    if (!user || !hasFetchedRef.current) return;
    if (!loadedTabs.has(selectedTab)) {
      fetchQuestionsForTab(selectedTab);
    }
  }, [selectedTab, user, loadedTabs, fetchQuestionsForTab]);

  const resetToTop = React.useCallback(() => {
    setDisplayIndices({ 0: 0, 1: 0, 2: 0 });
    setSelectedTab(0);
    setVoteHistories({ 0: [], 1: [], 2: [] });
    setQuestionsByTab({ 0: [], 1: [], 2: [] });
    setLoadedTabs(new Set());
    localVoteIdsRef.current = new Set();
    sessionInteractedIdsRef.current = new Set();
    position.setValue({ x: 0, y: 0 });
    contentOpacity.setValue(1);
    contentScale.setValue(1);
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setFlowState("viewing");
    setVotedDirection(null);
    fetchQuestionsForTab(0);
    return true;
  }, [fetchQuestionsForTab, position, contentOpacity, contentScale, leftBarWidth, rightBarWidth]);

  React.useEffect(() => {
    registerResetCallback(resetToTop);
    return () => unregisterResetCallback();
  }, [registerResetCallback, unregisterResetCallback, resetToTop]);

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

      setQuestionsByTab((prev) => {
        const updated = { ...prev };
        for (const tabKey of Object.keys(updated)) {
          const tab = Number(tabKey);
          const tabQuestions = updated[tab] ?? [];
          const index = tabQuestions.findIndex((q) => q.id === questionId);
          if (index !== -1) {
            const newTabQuestions = [...tabQuestions];
            newTabQuestions[index] = {
              ...newTabQuestions[index],
              votes: newCounts,
              hasVoted: userVote !== undefined,
              userVote,
            };
            updated[tab] = newTabQuestions;
          }
        }
        return updated;
      });
    },
    [user, supabase],
  );

  const questionIds = React.useMemo(() => {
    return questions.map((q) => q.id);
  }, [questions]);

  useRealtimeVoteCounts(supabase, questionIds, refreshVoteCounts);

  const syncAndRemoveVotedQuestions = React.useCallback(async () => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentTab = selectedTabRef.current;
    if (!currentUser || currentQuestions.length === 0) return;

    const supabase = getSupabase();
    const ids = currentQuestions.map((q) => q.id);
    const userVotesMap = await getUserVotes(supabase, currentUser.id, ids);

    const votedIds = new Set(userVotesMap.keys());
    const externalVotedIds = new Set(
      [...votedIds].filter((id) => !localVoteIdsRef.current.has(id))
    );

    if (externalVotedIds.size === 0) return;

    setQuestionsByTab((prev) => {
      const tabQuestions = prev[currentTab] ?? [];
      const filtered = tabQuestions.filter((q) => !externalVotedIds.has(q.id));
      return { ...prev, [currentTab]: filtered };
    });

    setDisplayIndices((prev) => {
      const currentIndex = prev[currentTab] ?? 0;
      const newLength = currentQuestions.length - externalVotedIds.size;
      if (currentIndex >= newLength) {
        return { ...prev, [currentTab]: Math.max(0, newLength - 1) };
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
    advanceToNext: () => {},
    goToPrevious: () => {},
    undoCurrentQuestion: () => {},
    handleChoiceTap: (_direction: "left" | "right") => {},
    handleTimerComplete: () => {},
    handleTapZone: (_zone: "left" | "right") => {},
  });

  actionsRef.current.recordVote = async (direction: "left" | "right") => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];
    const currentTab = selectedTabRef.current;

    if (!currentUser || !currentQuestion) return;

    if (currentQuestion.hasVoted || currentQuestion.isOwnQuestion) return;

    const questionId = currentQuestion.id;

    localVoteIdsRef.current.add(questionId);
    sessionInteractedIdsRef.current.add(questionId);

    setQuestionsByTab((prev) => {
      const tabQuestions = prev[currentTab] ?? [];
      const updated = tabQuestions.map((q) => {
        if (q.id === questionId) {
          const votes = q.votes ?? { left: 0, right: 0 };
          return {
            ...q,
            votes: { ...votes, [direction]: votes[direction] + 1 },
            hasVoted: true,
            userVote: direction,
          };
        }
        return q;
      });
      return { ...prev, [currentTab]: updated };
    });

    setVoteHistories((prev) => ({
      ...prev,
      [currentTab]: [
        ...(prev[currentTab] ?? []),
        {
          questionId,
          questionIndex: currentIndex,
          direction,
        },
      ],
    }));

    const supabase = getSupabase();
    try {
      await createVote(supabase, questionId, currentUser.id, direction);

      const updatedVoteCounts = await getVoteCounts(supabase, [questionId]);
      const newCounts = updatedVoteCounts.get(questionId) ?? {
        left: 0,
        right: 0,
      };

      setQuestionsByTab((prev) => {
        const tabQuestions = prev[currentTab] ?? [];
        const updated = tabQuestions.map((q) => {
          if (q.id === questionId) {
            return {
              ...q,
              votes: newCounts,
              hasVoted: true,
              userVote: direction,
            };
          }
          return q;
        });
        return { ...prev, [currentTab]: updated };
      });
    } catch (err) {
      console.error("Failed to record vote:", err);
      setQuestionsByTab((prev) => {
        const tabQuestions = prev[currentTab] ?? [];
        const updated = tabQuestions.map((q) => {
          if (q.id === questionId) {
            const votes = q.votes ?? { left: 0, right: 0 };
            return {
              ...q,
              votes: {
                ...votes,
                [direction]: Math.max(0, votes[direction] - 1),
              },
              hasVoted: false,
              userVote: undefined,
            };
          }
          return q;
        });
        return { ...prev, [currentTab]: updated };
      });
      setVoteHistories((prev) => ({
        ...prev,
        [currentTab]: (prev[currentTab] ?? []).slice(0, -1),
      }));
    }
  };

  actionsRef.current.advanceToNext = () => {
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentTab = selectedTabRef.current;

    if (currentQuestions.length === 0) {
      setFlowState("viewing");
      setVotedDirection(null);
      leftBarWidth.setValue(0);
      rightBarWidth.setValue(0);
      position.setValue({ x: 0, y: 0 });
      return;
    }

    const nextIdx = currentIndex + 1 >= currentQuestions.length ? 0 : currentIndex + 1;

    contentOpacity.setValue(0);
    position.setValue({ x: 0, y: 0 });
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setVotedDirection(null);
    contentScale.setValue(0.97);
    setFlowState("transitioning");
    setDisplayIndices((prev) => ({ ...prev, [currentTab]: nextIdx }));

    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(contentScale, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setFlowState("viewing");
      });
    });
  };

  actionsRef.current.goToPrevious = () => {
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentTab = selectedTabRef.current;
    const currentUser = userRef.current;

    if (currentQuestions.length === 0 || currentIndex === 0) {
      position.setValue({ x: 0, y: 0 });
      return;
    }

    const prevIdx = currentIndex - 1;
    const prevQuestion = currentQuestions[prevIdx];

    contentOpacity.setValue(0);
    position.setValue({ x: 0, y: 0 });
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setVotedDirection(null);
    contentScale.setValue(0.97);

    // Always mark the previous question as interacted so it won't be skipped
    if (prevQuestion) {
      sessionInteractedIdsRef.current.add(prevQuestion.id);
    }

    if (prevQuestion && prevQuestion.hasVoted && localVoteIdsRef.current.has(prevQuestion.id) && currentUser) {
      const questionId = prevQuestion.id;
      const direction = prevQuestion.userVote;

      localVoteIdsRef.current.delete(questionId);

      setQuestionsByTab((prev) => {
        const tabQuestions = prev[currentTab] ?? [];
        const updated = tabQuestions.map((q) => {
          if (q.id === questionId && direction) {
            const votes = q.votes ?? { left: 0, right: 0 };
            return {
              ...q,
              votes: {
                ...votes,
                [direction]: Math.max(0, votes[direction] - 1),
              },
              hasVoted: false,
              userVote: undefined,
            };
          }
          return q;
        });
        return { ...prev, [currentTab]: updated };
      });

      setVoteHistories((prev) => {
        const history = prev[currentTab] ?? [];
        const filtered = history.filter((h) => h.questionId !== questionId);
        return { ...prev, [currentTab]: filtered };
      });

      const supabase = getSupabase();
      deleteVote(supabase, questionId, currentUser.id).catch((err) => {
        console.error("Failed to delete vote:", err);
      });
    }

    setFlowState("transitioning");
    setDisplayIndices((prev) => ({ ...prev, [currentTab]: prevIdx }));

    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(contentScale, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setFlowState("viewing");
      });
    });
  };

  actionsRef.current.undoCurrentQuestion = () => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentTab = selectedTabRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser || !currentQuestion) return;
    if (!currentQuestion.hasVoted || !currentQuestion.userVote) return;
    if (!localVoteIdsRef.current.has(currentQuestion.id)) return;

    const questionId = currentQuestion.id;
    const direction = currentQuestion.userVote;

    localVoteIdsRef.current.delete(questionId);
    // Keep in sessionInteractedIdsRef so it won't be auto-skipped
    sessionInteractedIdsRef.current.add(questionId);

    setQuestionsByTab((prev) => {
      const tabQuestions = prev[currentTab] ?? [];
      const updated = tabQuestions.map((q) => {
        if (q.id === questionId) {
          const votes = q.votes ?? { left: 0, right: 0 };
          return {
            ...q,
            votes: {
              ...votes,
              [direction]: Math.max(0, votes[direction] - 1),
            },
            hasVoted: false,
            userVote: undefined,
          };
        }
        return q;
      });
      return { ...prev, [currentTab]: updated };
    });

    setVoteHistories((prev) => {
      const history = prev[currentTab] ?? [];
      const filtered = history.filter((h) => h.questionId !== questionId);
      return { ...prev, [currentTab]: filtered };
    });

    const supabase = getSupabase();
    deleteVote(supabase, questionId, currentUser.id)
      .then(() => {
        refreshVoteCounts(questionId);
      })
      .catch((err) => {
        console.error("Failed to delete vote:", err);
      });

    setFlowState("viewing");
    setVotedDirection(null);
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  actionsRef.current.handleChoiceTap = (direction: "left" | "right") => {
    const currentState = flowStateRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (currentState !== "viewing") return;
    if (!currentQuestion || currentQuestion.hasVoted || currentQuestion.isOwnQuestion) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setFlowState("voting");
    setVotedDirection(direction);

    actionsRef.current.recordVote(direction);

    setTimeout(() => {
      setFlowState("revealing");

      const votes = currentQuestion.votes ?? { left: 0, right: 0 };
      const newVotes = {
        left: direction === "left" ? votes.left + 1 : votes.left,
        right: direction === "right" ? votes.right + 1 : votes.right,
      };
      const total = newVotes.left + newVotes.right;
      const percentages = getNormalizedPercentages(newVotes.left, newVotes.right, total);

      Animated.parallel([
        Animated.timing(leftBarWidth, {
          toValue: percentages.left,
          duration: REVEAL_DURATION,
          useNativeDriver: false,
        }),
        Animated.timing(rightBarWidth, {
          toValue: percentages.right,
          duration: REVEAL_DURATION,
          delay: 100,
          useNativeDriver: false,
        }),
      ]).start(() => {
        setFlowState("voted");
      });
    }, 100);
  };

  actionsRef.current.handleTimerComplete = () => {
    const currentState = flowStateRef.current;
    if (currentState === "voted") {
      actionsRef.current.advanceToNext();
    }
  };

  actionsRef.current.handleTapZone = (zone: "left" | "right") => {
    const currentState = flowStateRef.current;
    if (currentState !== "voted") return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (zone === "right") {
      actionsRef.current.advanceToNext();
    } else {
      actionsRef.current.undoCurrentQuestion();
    }
  };

  const hasQuestion = question !== null;
  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (flowStateRef.current !== "viewing") return false;
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Animated.timing(position, {
              toValue: { x: SCREEN_W, y: 0 },
              duration: 150,
              useNativeDriver: true,
            }).start(() => {
              actionsRef.current.goToPrevious();
            });
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Animated.timing(position, {
              toValue: { x: -SCREEN_W, y: 0 },
              duration: 150,
              useNativeDriver: true,
            }).start(() => {
              actionsRef.current.advanceToNext();
            });
          } else {
            Animated.spring(position, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: true,
              friction: 6,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 6,
          }).start();
        },
      }),
    [selectedTab, hasQuestion, loading, position],
  );

  const handleTimerComplete = React.useCallback(() => {
    actionsRef.current.handleTimerComplete();
  }, []);

  const renderHeader = () => (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        paddingTop: insets.top + 4,
        paddingBottom: 8,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 32,
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
            padding: 6,
          }}
        >
          <Octicons
            name={tab.icon}
            size={22}
            color={selectedTab === index ? "white" : "#555"}
          />
        </Pressable>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        {renderHeader()}
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

  if (!question || filteredQuestions.length === 0) {
    const emptyMessage = selectedTab === 2
      ? { title: "No questions from friends", subtitle: "Questions your friends vote on will appear here" }
      : { title: "No questions to vote on", subtitle: "Check back later or create your own!" };

    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        {renderHeader()}
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, textAlign: "center" }}>
            {emptyMessage.title}
          </Text>
          <Text
            style={{
              color: "#aaa",
              fontSize: 14,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {emptyMessage.subtitle}
          </Text>
        </View>
      </View>
    );
  }

  const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(question.id);
  const isResultsMode = wasVotedBeforeSession || question.isOwnQuestion;

  const currentVotes = question?.votes ?? { left: 0, right: 0 };
  const currentTotal = currentVotes.left + currentVotes.right;
  const percentages = getNormalizedPercentages(
    currentVotes.left,
    currentVotes.right,
    currentTotal,
  );

  const showResults = flowState === "revealing" || flowState === "voted" || isResultsMode === true;
  const isTimerRunning = flowState === "voted" && !isResultsMode;
  const canTapChoices = flowState === "viewing" && !isResultsMode;

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {renderHeader()}

      {flowState === "voted" && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            top: insets.top + 60,
            flexDirection: "row",
            zIndex: 15,
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => actionsRef.current.handleTapZone("left")}
          />
          <Pressable
            style={{ flex: 1 }}
            onPress={() => actionsRef.current.handleTapZone("right")}
          />
        </View>
      )}


      <Animated.View
        {...panResponder.panHandlers}
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          opacity: contentOpacity,
          transform: [
            { translateX: position.x },
            { scale: contentScale },
          ],
        }}
      >
        <View
          style={{
            gap: 16,
          }}
        >
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
              onPress={() => actionsRef.current.handleChoiceTap("left")}
              disabled={!canTapChoices}
              showResults={showResults}
              percentage={showResults ? percentages.left : 0}
              votes={currentVotes.left}
              animatedWidth={leftBarWidth}
              friendVotes={question.friendVotes?.left?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
              isSelected={votedDirection === "left" || question.userVote === "left"}
            />
            <FullScreenChoice
              choice={question.right}
              direction="right"
              onPress={() => actionsRef.current.handleChoiceTap("right")}
              disabled={!canTapChoices}
              showResults={showResults}
              percentage={showResults ? percentages.right : 0}
              votes={currentVotes.right}
              animatedWidth={rightBarWidth}
              friendVotes={question.friendVotes?.right?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
              isSelected={votedDirection === "right" || question.userVote === "right"}
            />
            <View style={{ marginTop: 8, opacity: isTimerRunning ? 1 : 0 }}>
              <ProgressBar
                duration={TIMER_DURATION}
                isRunning={isTimerRunning}
                onComplete={handleTimerComplete}
              />
            </View>
          </View>

        </View>
      </Animated.View>
    </View>
  );
}
