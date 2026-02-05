import { QuestionCard } from "@/components/questions";
import {
    AutocompleteItem,
    RecentSearchItem,
    SearchBar,
    SearchFilterTab,
} from "@/components/search";
import { UserListItem } from "@/components/users";
import { FullScreenChoice, ProgressBar } from "@/components/voting";
import { useExploreTabReset } from "@/contexts/explore-tab-context";
import {
    useRealtimeQuestions,
    useRealtimeUserVotes,
    useRealtimeVoteCounts,
} from "@/lib/hooks/useRealtime";
import { getFollowing } from "@/lib/queries/follows";
import { getProfile, Profile } from "@/lib/queries/profiles";
import { CategoryWithCount, Question as DbQuestion, getPopularCategories, getQuestions } from "@/lib/queries/questions";
import {
    autocompleteSearch,
    AutocompleteSuggestion,
    searchAll,
    searchProfiles,
    searchQuestions,
} from "@/lib/queries/search";
import {
    createVote,
    deleteVote,
    getFriendVotesForQuestions,
    getUserVotes,
    getVoteCounts,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { Question, User, VoteHistoryItem, VotingFlowState } from "@/types";
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
    FlatList,
    Image,
    PanResponder,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const LEFT_EDGE_THRESHOLD = 50;
const MAX_RECENT_SEARCHES = 10;
const SEARCH_BAR_HEIGHT = 112;
const CATEGORIES_HEIGHT = 60;
const HEADER_HEIGHT = SEARCH_BAR_HEIGHT + CATEGORIES_HEIGHT;

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { registerResetCallback, unregisterResetCallback } =
    useExploreTabReset();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [performedSearch, setPerformedSearch] = React.useState("");
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const [activeSearchTab, setActiveSearchTab] = React.useState<
    "all" | "questions" | "users"
  >("all");
  const [searchResults, setSearchResults] = React.useState<{
    questions: Question[];
    users: User[];
    questionsTotal: number;
    usersTotal: number;
    questionsHasMore: boolean;
    usersHasMore: boolean;
  }>({
    questions: [],
    users: [],
    questionsTotal: 0,
    usersTotal: 0,
    questionsHasMore: false,
    usersHasMore: false,
  });
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [loadingMoreQuestions, setLoadingMoreQuestions] = React.useState(false);
  const [loadingMoreUsers, setLoadingMoreUsers] = React.useState(false);
  const [questionsOffset, setQuestionsOffset] = React.useState(0);
  const [usersOffset, setUsersOffset] = React.useState(0);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [categories, setCategories] = React.useState<CategoryWithCount[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"list" | "card">("list");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const [undoneCardOverride, setUndoneCardOverride] = React.useState<{
    questionId: string;
    hasVoted: false;
    userVote: undefined;
    votes: { left: number; right: number };
  } | null>(null);
  const baseQuestion = questions[displayIndex] ?? null;
  const question =
    baseQuestion &&
    undoneCardOverride &&
    undoneCardOverride.questionId === baseQuestion.id
      ? {
          ...baseQuestion,
          hasVoted: undoneCardOverride.hasVoted,
          userVote: undoneCardOverride.userVote,
          votes: undoneCardOverride.votes,
        }
      : baseQuestion;
  const [voteHistory, setVoteHistory] = React.useState<VoteHistoryItem[]>([]);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = React.useState<
    AutocompleteSuggestion[]
  >([]);
  const [autocompleteLoading, setAutocompleteLoading] = React.useState(false);

  // Voting flow state for tap-to-vote UI
  const [flowState, setFlowState] = React.useState<VotingFlowState>("viewing");
  const [votedDirection, setVotedDirection] = React.useState<"left" | "right" | null>(null);
  const [isTimerPaused, setIsTimerPaused] = React.useState(false);

  const TIMER_DURATION = 4000;
  const REVEAL_DURATION = 400;

  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const contentOpacity = React.useRef(new Animated.Value(1)).current;
  const contentScale = React.useRef(new Animated.Value(1)).current;
  const leftBarWidth = React.useRef(new Animated.Value(0)).current;
  const rightBarWidth = React.useRef(new Animated.Value(0)).current;
  const chevronWidth = React.useRef(new Animated.Value(0)).current;
  const chevronOpacity = React.useRef(new Animated.Value(0)).current;
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const lastScrollY = React.useRef(0);
  const scrollDirection = React.useRef<'up' | 'down'>('up');
  const headerOffset = React.useRef(0);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedSearchInputRef = React.useRef<TextInput>(null);
  const hasFetchedRef = React.useRef(false);
  const supabaseRef = React.useRef<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);
  const getTokenRef = React.useRef(getToken);
  const userRef = React.useRef(user);
  const questionsRef = React.useRef(questions);
  const displayIndexRef = React.useRef(displayIndex);
  const voteHistoryRef = React.useRef(voteHistory);
  const initiallyVotedIdsRef = React.useRef<Set<string>>(new Set());
  const pendingUndoIdsRef = React.useRef<Set<string>>(new Set());
  const flowStateRef = React.useRef(flowState);
  const pressStartTimeRef = React.useRef<number>(0);
  const lastUndoTimeRef = React.useRef<number>(0);
  const choicesLayoutRef = React.useRef<{ y: number; height: number } | null>(null);

  getTokenRef.current = getToken;
  userRef.current = user;
  questionsRef.current = questions;
  displayIndexRef.current = displayIndex;
  voteHistoryRef.current = voteHistory;
  flowStateRef.current = flowState;

  const getSupabase = React.useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClerkSupabaseClient({
        getToken: getTokenRef.current,
      });
    }
    return supabaseRef.current;
  }, []);

  const fetchQuestions = React.useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
        pendingUndoIdsRef.current.clear();
      }

      try {
        const supabase = getSupabase();
        const currentUser = userRef.current;
        const dbQuestions = await getQuestions(supabase, {
          limit: 100,
          category: selectedCategory ?? undefined,
        });

        if (dbQuestions.length === 0) {
          setQuestions([]);
          return;
        }

        const questionIds = dbQuestions.map((q) => q.id);

        const followingIds = currentUser
          ? await getFollowing(supabase, currentUser.id)
          : [];

        const [voteCounts, userVotesMap, friendVotesMap] = await Promise.all([
          getVoteCounts(supabase, questionIds),
          currentUser
            ? getUserVotes(supabase, currentUser.id, questionIds)
            : Promise.resolve(new Map<string, "left" | "right">()),
          followingIds.length > 0
            ? getFriendVotesForQuestions(supabase, questionIds, followingIds)
            : Promise.resolve(new Map()),
        ]);

        const creatorIds = [...new Set(dbQuestions.map((q) => q.user_id))];
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

        initiallyVotedIdsRef.current = new Set(userVotesMap.keys());
        pendingUndoIdsRef.current.clear();

        const mappedQuestions = dbQuestions.map((dbQ) => {
          const votes = voteCounts.get(dbQ.id) ?? { left: 0, right: 0 };
          const displayName = profileMap.get(dbQ.user_id) ?? null;
          const userVote = userVotesMap.get(dbQ.id);
          const friendVotes = friendVotesMap.get(dbQ.id);
          return mapDbQuestionToQuestion(
            dbQ,
            votes,
            displayName,
            dbQ.is_anonymous,
            currentUser?.id ?? null,
            userVote,
            friendVotes,
          );
        });

        setQuestions(mappedQuestions);
      } catch (err) {
        console.error("Failed to fetch questions:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getSupabase, selectedCategory],
  );

  const fetchCategories = React.useCallback(async () => {
    try {
      const supabase = getSupabase();
      const popularCategories = await getPopularCategories(supabase, { limit: 12 });
      setCategories(popularCategories);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  }, [getSupabase]);

  const mapProfileToUser = React.useCallback((profile: Profile): User => {
    return {
      id: profile.user_id,
      username: profile.username || "",
      firstName: profile.first_name || undefined,
      lastName: profile.last_name || undefined,
      avatarUrl: profile.avatar_url || undefined,
    };
  }, []);

  const performSearch = React.useCallback(
    async (query: string) => {
      if (!query.trim()) return;

      setSearchLoading(true);
      setQuestionsOffset(0);
      setUsersOffset(0);

      try {
        const supabase = getSupabase();
        const currentUser = userRef.current;
        const results = await searchAll(supabase, query, {
          questionsLimit: 20,
          profilesLimit: 10,
        });

        const dbQuestions = results.questions.questions;
        if (dbQuestions.length > 0) {
          const questionIds = dbQuestions.map((q) => q.id);
          const [voteCounts, userVotesMap] = await Promise.all([
            getVoteCounts(supabase, questionIds),
            currentUser
              ? getUserVotes(supabase, currentUser.id, questionIds)
              : Promise.resolve(new Map<string, "left" | "right">()),
          ]);

          const creatorIds = [...new Set(dbQuestions.map((q) => q.user_id))];
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

          const mappedQuestions = dbQuestions.map((dbQ) => {
            const votes = voteCounts.get(dbQ.id) ?? { left: 0, right: 0 };
            const displayName = profileMap.get(dbQ.user_id) ?? null;
            const userVote = userVotesMap.get(dbQ.id);
            return mapDbQuestionToQuestion(
              dbQ,
              votes,
              displayName,
              dbQ.is_anonymous,
              currentUser?.id ?? null,
              userVote,
            );
          });

          const mappedUsers = results.profiles.profiles.map(mapProfileToUser);

          setSearchResults({
            questions: mappedQuestions,
            users: mappedUsers,
            questionsTotal: results.questions.total,
            usersTotal: results.profiles.total,
            questionsHasMore: results.questions.hasMore,
            usersHasMore: results.profiles.hasMore,
          });
        } else {
          const mappedUsers = results.profiles.profiles.map(mapProfileToUser);
          setSearchResults({
            questions: [],
            users: mappedUsers,
            questionsTotal: 0,
            usersTotal: results.profiles.total,
            questionsHasMore: false,
            usersHasMore: results.profiles.hasMore,
          });
        }
      } catch (err) {
        console.error("Failed to perform search:", err);
        setSearchResults({
          questions: [],
          users: [],
          questionsTotal: 0,
          usersTotal: 0,
          questionsHasMore: false,
          usersHasMore: false,
        });
      } finally {
        setSearchLoading(false);
      }
    },
    [getSupabase, mapProfileToUser],
  );

  const loadMoreQuestions = React.useCallback(async () => {
    if (!performedSearch.trim() || loadingMoreQuestions || !searchResults.questionsHasMore)
      return;

    setLoadingMoreQuestions(true);
    const newOffset = questionsOffset + 20;

    try {
      const supabase = getSupabase();
      const currentUser = userRef.current;
      const results = await searchQuestions(supabase, performedSearch, {
        limit: 20,
        offset: newOffset,
      });

      if (results.questions.length > 0) {
        const questionIds = results.questions.map((q) => q.id);
        const [voteCounts, userVotesMap] = await Promise.all([
          getVoteCounts(supabase, questionIds),
          currentUser
            ? getUserVotes(supabase, currentUser.id, questionIds)
            : Promise.resolve(new Map<string, "left" | "right">()),
        ]);

        const creatorIds = [...new Set(results.questions.map((q) => q.user_id))];
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

        const mappedQuestions = results.questions.map((dbQ) => {
          const votes = voteCounts.get(dbQ.id) ?? { left: 0, right: 0 };
          const displayName = profileMap.get(dbQ.user_id) ?? null;
          const userVote = userVotesMap.get(dbQ.id);
          return mapDbQuestionToQuestion(
            dbQ,
            votes,
            displayName,
            dbQ.is_anonymous,
            currentUser?.id ?? null,
            userVote,
          );
        });

        setSearchResults((prev) => ({
          ...prev,
          questions: [...prev.questions, ...mappedQuestions],
          questionsHasMore: results.hasMore,
        }));
        setQuestionsOffset(newOffset);
      }
    } catch (err) {
      console.error("Failed to load more questions:", err);
    } finally {
      setLoadingMoreQuestions(false);
    }
  }, [performedSearch, loadingMoreQuestions, searchResults.questionsHasMore, questionsOffset, getSupabase]);

  const loadMoreUsers = React.useCallback(async () => {
    if (!performedSearch.trim() || loadingMoreUsers || !searchResults.usersHasMore)
      return;

    setLoadingMoreUsers(true);
    const newOffset = usersOffset + 10;

    try {
      const supabase = getSupabase();
      const results = await searchProfiles(supabase, performedSearch, {
        limit: 10,
        offset: newOffset,
      });

      if (results.profiles.length > 0) {
        const mappedUsers = results.profiles.map(mapProfileToUser);

        setSearchResults((prev) => ({
          ...prev,
          users: [...prev.users, ...mappedUsers],
          usersHasMore: results.hasMore,
        }));
        setUsersOffset(newOffset);
      }
    } catch (err) {
      console.error("Failed to load more users:", err);
    } finally {
      setLoadingMoreUsers(false);
    }
  }, [performedSearch, loadingMoreUsers, searchResults.usersHasMore, usersOffset, getSupabase, mapProfileToUser]);

  React.useEffect(() => {
    if (!user || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchQuestions();
    fetchCategories();
  }, [user, fetchQuestions, fetchCategories]);

  React.useEffect(() => {
    if (user && hasFetchedRef.current) {
      headerOffset.current = 0;
      lastScrollY.current = 0;
      scrollY.setValue(0);
      setDisplayIndex(0);
      setLoading(true);
      fetchQuestions();
    }
  }, [selectedCategory]);

  const supabase = React.useMemo(() => {
    if (!user) return null;
    return getSupabase();
  }, [user, getSupabase]);

  const refreshVoteCounts = React.useCallback(
    async (questionId: string) => {
      const currentUser = userRef.current;
      if (!currentUser) return;

      const currentId = questionsRef.current[displayIndexRef.current]?.id;
      const isCurrentCardInVoteFlow =
        questionId === currentId &&
        (flowStateRef.current === "voting" ||
          flowStateRef.current === "revealing" ||
          flowStateRef.current === "voted");
      if (isCurrentCardInVoteFlow) return;

      const supabase = getSupabase();
      const [updatedVoteCounts, userVotesMap] = await Promise.all([
        getVoteCounts(supabase, [questionId]),
        getUserVotes(supabase, currentUser.id, [questionId]),
      ]);

      const newCounts = updatedVoteCounts.get(questionId) ?? {
        left: 0,
        right: 0,
      };
      const userVote = userVotesMap.get(questionId);

      setQuestions((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((q) => q.id === questionId);
        if (idx !== -1) {
          const question = updated[idx];
          const isPendingUndo = pendingUndoIdsRef.current.has(questionId);
          updated[idx] = {
            ...question,
            votes: newCounts,
            hasVoted: isPendingUndo ? false : userVote !== undefined,
            userVote: isPendingUndo ? undefined : userVote,
          };
        }
        return updated;
      });
    },
    [getSupabase],
  );

  const questionIds = React.useMemo(() => {
    return questions.map((q) => q.id);
  }, [questions]);

  useRealtimeVoteCounts(supabase, questionIds, refreshVoteCounts);

  const handleExternalVoteCast = React.useCallback(
    async (voteData: any) => {
      const questionId = voteData.question_id;
      const choice = voteData.choice as "left" | "right";

      if (pendingUndoIdsRef.current.has(questionId)) return;

      setQuestions((prev) => {
        const idx = prev.findIndex((q) => q.id === questionId);
        if (idx === -1) return prev;

        const updated = [...prev];
        const q = updated[idx];
        if (!q.hasVoted) {
          updated[idx] = {
            ...q,
            hasVoted: true,
            userVote: choice,
          };
        }
        return updated;
      });
    },
    [],
  );

  const handleExternalVoteRemoved = React.useCallback(
    async (voteData: any) => {
      const questionId = voteData.question_id;

      if (pendingUndoIdsRef.current.has(questionId)) {
        pendingUndoIdsRef.current.delete(questionId);
        return;
      }

      setQuestions((prev) => {
        const idx = prev.findIndex((q) => q.id === questionId);
        if (idx === -1) return prev;

        const updated = [...prev];
        const q = updated[idx];
        updated[idx] = {
          ...q,
          hasVoted: false,
          userVote: undefined,
        };
        return updated;
      });

      initiallyVotedIdsRef.current.delete(questionId);

      setVoteHistory((prev) =>
        prev.filter((v) => v.questionId !== questionId),
      );
    },
    [],
  );

  useRealtimeUserVotes(
    supabase,
    user?.id ?? null,
    handleExternalVoteCast,
    handleExternalVoteRemoved,
  );

  const handleQuestionInsert = React.useCallback(
    async (dbQuestion: any) => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      const isOwnQuestion = dbQuestion.user_id === currentUser.id;
      const sb = getSupabase();
      const voteCounts = await getVoteCounts(sb, [dbQuestion.id]);
      let createdBy: string | undefined;
      if (dbQuestion.is_anonymous) {
        createdBy = "Anonymous";
      } else {
        const profile = await getProfile(sb, dbQuestion.user_id).catch(
          () => null,
        );
        createdBy = profile?.username?.toLowerCase() || undefined;
      }
      const newQuestion: Question = {
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
        votes: voteCounts.get(dbQuestion.id) || { left: 0, right: 0 },
        meta: {
          category: dbQuestion.category || undefined,
          createdBy,
        },
        createdAt: dbQuestion.created_at,
        hasVoted: false,
        isOwnQuestion,
      };
      setQuestions((prev) => {
        if (prev.some((q) => q.id === dbQuestion.id)) return prev;
        return [newQuestion, ...prev];
      });
    },
    [getSupabase],
  );

  const handleQuestionUpdate = React.useCallback((dbQuestion: any) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === dbQuestion.id
          ? {
              ...q,
              title: dbQuestion.title,
              prompt: dbQuestion.prompt,
              promptImageUrl: dbQuestion.prompt_image_url || undefined,
              left: {
                ...q.left,
                label: dbQuestion.left_choice_label,
                imageUrl: dbQuestion.left_choice_image_url || undefined,
              },
              right: {
                ...q.right,
                label: dbQuestion.right_choice_label,
                imageUrl: dbQuestion.right_choice_image_url || undefined,
              },
              meta: {
                ...q.meta,
                category: dbQuestion.category || undefined,
              },
            }
          : q,
      ),
    );
  }, []);

  const handleQuestionDelete = React.useCallback((questionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  }, []);

  useRealtimeQuestions(
    supabase,
    handleQuestionInsert,
    handleQuestionUpdate,
    handleQuestionDelete,
  );

  const syncUserVotes = React.useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || questions.length === 0) return;

    pendingUndoIdsRef.current.clear();

    const supabase = getSupabase();
    const ids = questions.map((q) => q.id);
    const [userVotesMap, voteCounts] = await Promise.all([
      getUserVotes(supabase, currentUser.id, ids),
      getVoteCounts(supabase, ids),
    ]);

    setQuestions((prev) =>
      prev.map((q) => {
        const userVote = userVotesMap.get(q.id);
        const hasVoted = userVote !== undefined;
        const currentVotes = q.votes ?? { left: 0, right: 0 };
        const newVotes = voteCounts.get(q.id) ?? currentVotes;
        if (
          q.hasVoted === hasVoted &&
          q.userVote === userVote &&
          currentVotes.left === newVotes.left &&
          currentVotes.right === newVotes.right
        ) {
          return q;
        }
        return { ...q, hasVoted, userVote, votes: newVotes };
      }),
    );
  }, [questions, getSupabase]);

  useFocusEffect(
    React.useCallback(() => {
      syncUserVotes();
    }, [syncUserVotes]),
  );

  const handleRefresh = React.useCallback(() => {
    headerOffset.current = 0;
    lastScrollY.current = 0;
    scrollY.setValue(0);
    fetchQuestions(true);
  }, [fetchQuestions, scrollY]);

  const handleScroll = React.useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const currentY = event.nativeEvent.contentOffset.y;
      const diff = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (diff > 0) {
        scrollDirection.current = 'down';
      } else if (diff < 0) {
        scrollDirection.current = 'up';
      }

      if (scrollDirection.current === 'down') {
        headerOffset.current = Math.min(
          headerOffset.current + diff,
          HEADER_HEIGHT
        );
      } else {
        headerOffset.current = Math.max(
          headerOffset.current + diff,
          0
        );
      }

      if (currentY <= 0) {
        headerOffset.current = 0;
      }

      scrollY.setValue(headerOffset.current);
    },
    [scrollY],
  );

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

  const handleCardPress = React.useCallback(
    (question: Question) => {
      const foundIndex = questions.findIndex((q) => q.id === question.id);
      if (foundIndex >= 0) {
        setDisplayIndex(foundIndex);
        setViewMode("card");
        position.setValue({ x: 0, y: 0 });
        contentOpacity.setValue(1);
        contentScale.setValue(1);
        setFlowState("viewing");
        setVotedDirection(null);
        setIsTimerPaused(false);
        leftBarWidth.setValue(0);
        rightBarWidth.setValue(0);
      }
    },
    [questions, position, contentOpacity, contentScale, leftBarWidth, rightBarWidth],
  );

  const handleBackToList = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    setUndoneCardOverride(null);
    setFlowState("viewing");
    setVotedDirection(null);
    setIsTimerPaused(false);
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    contentOpacity.setValue(1);
    contentScale.setValue(1);
    position.setValue({ x: 0, y: 0 });
  }, [position, leftBarWidth, rightBarWidth, contentOpacity, contentScale]);

  const actionsRef = React.useRef({
    recordVote: (_direction: "left" | "right") => {},
    advance: (_direction: "left" | "right" | null) => {},
    goToPrevious: () => {},
    undo: () => {},
    handleChoiceTap: (_direction: "left" | "right") => {},
    handleTimerComplete: () => {},
    undoCurrentQuestion: () => {},
  });

  actionsRef.current.recordVote = async (direction: "left" | "right") => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser || !currentQuestion) return;

    if (currentQuestion.hasVoted || currentQuestion.isOwnQuestion) return;

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

      const isCurrentCardInVoteFlow =
        questionsRef.current[displayIndexRef.current]?.id === currentQuestion.id &&
        (flowStateRef.current === "voting" ||
          flowStateRef.current === "revealing" ||
          flowStateRef.current === "voted");

      setQuestions((prev) => {
        if (pendingUndoIdsRef.current.has(currentQuestion.id)) {
          return prev;
        }
        if (isCurrentCardInVoteFlow) return prev;
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
    const nextIdx =
      currentIndex + 1 >= currentQuestions.length ? 0 : currentIndex + 1;

    contentOpacity.setValue(0);
    position.setValue({ x: 0, y: 0 });
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setVotedDirection(null);
    setIsTimerPaused(false);
    contentScale.setValue(0.97);
    setFlowState("transitioning");
    setDisplayIndex(nextIdx);

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
    const currentUser = userRef.current;

    if (currentQuestions.length === 0) {
      position.setValue({ x: 0, y: 0 });
      return;
    }

    // If on first question, go back to list
    if (currentIndex === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      handleBackToList();
      return;
    }

    const prevIdx = currentIndex - 1;
    const prevQuestion = currentQuestions[prevIdx];

    contentOpacity.setValue(0);
    position.setValue({ x: 0, y: 0 });
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setVotedDirection(null);
    setIsTimerPaused(false);
    contentScale.setValue(0.97);

    // If the previous question was voted, undo it (so it shows as normal again)
    const prevDirection = prevQuestion?.userVote;
    if (prevQuestion && prevQuestion.hasVoted && prevDirection && currentUser) {
      const questionId = prevQuestion.id;

      initiallyVotedIdsRef.current.delete(questionId);

      const votes = prevQuestion.votes ?? { left: 0, right: 0 };
      const undoneVotes = {
        ...votes,
        [prevDirection]: Math.max(0, votes[prevDirection] - 1),
      };
      setUndoneCardOverride({
        questionId,
        hasVoted: false,
        userVote: undefined,
        votes: undoneVotes,
      });

      pendingUndoIdsRef.current.add(questionId);

      setQuestions((prev) => {
        const updated = [...prev];
        const q = updated[prevIdx];
        if (q && q.id === questionId) {
          const votes = q.votes ?? { left: 0, right: 0 };
          updated[prevIdx] = {
            ...q,
            votes: {
              ...votes,
              [prevDirection]: Math.max(0, votes[prevDirection] - 1),
            },
            hasVoted: false,
            userVote: undefined,
          };
        }
        return updated;
      });

      setVoteHistory((prev) => prev.filter((h) => h.questionId !== questionId));

      const supabase = getSupabase();
      deleteVote(supabase, questionId, currentUser.id)
        .then(() =>
          refreshVoteCounts(questionId).then(() => {
            requestAnimationFrame(() => {
              pendingUndoIdsRef.current.delete(questionId);
              setUndoneCardOverride((prev) =>
                prev?.questionId === questionId ? null : prev,
              );
            });
          }),
        )
        .catch((err) => {
          console.error("Failed to delete vote:", err);
          pendingUndoIdsRef.current.delete(questionId);
          requestAnimationFrame(() => {
            setUndoneCardOverride((prev) =>
              prev?.questionId === questionId ? null : prev,
            );
          });
        });
    }

    setFlowState("transitioning");
    setDisplayIndex(prevIdx);

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

  actionsRef.current.undo = () => {
    const currentUser = userRef.current;
    const history = voteHistoryRef.current;

    if (history.length === 0 || !currentUser) return;

    const lastVote = history[history.length - 1];
    const previousIndex = lastVote.questionIndex!;
    const questionId = lastVote.questionId;
    if (!questionId) return;

    const wasVotedBeforeSession = Boolean(
      initiallyVotedIdsRef.current.has(questionId),
    );

    const prevQuestions = questionsRef.current;
    const prevQ = prevQuestions[previousIndex];
    const prevVotes = prevQ?.votes ?? { left: 0, right: 0 };
    const undoneVotes = {
      ...prevVotes,
      [lastVote.direction]: Math.max(0, prevVotes[lastVote.direction] - 1),
    };
    setUndoneCardOverride({
      questionId,
      hasVoted: false,
      userVote: undefined,
      votes: undoneVotes,
    });

    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[previousIndex];
      if (q && q.id === questionId) {
        const votes = q.votes ?? { left: 0, right: 0 };
        updated[previousIndex] = {
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

    if (questionId && !wasVotedBeforeSession) {
      pendingUndoIdsRef.current.add(questionId);
      const supabase = getSupabase();
      deleteVote(supabase, questionId, currentUser.id)
        .then(() => {
          refreshVoteCounts(questionId);
          pendingUndoIdsRef.current.delete(questionId);
        })
        .catch((err) => {
          console.error("Failed to delete vote:", err);
          pendingUndoIdsRef.current.delete(questionId);
        });
    }

    setVoteHistory((prev) => prev.slice(0, -1));
    setDisplayIndex(previousIndex);
    position.setValue({ x: 0, y: 0 });
    contentOpacity.setValue(1);
    contentScale.setValue(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  actionsRef.current.handleChoiceTap = (direction: "left" | "right") => {
    // Don't allow voting immediately after an undo (prevent accidental double-tap)
    if (Date.now() - lastUndoTimeRef.current < 300) return;
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

    // Start reveal immediately for seamless animation
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
        useNativeDriver: false,
      }),
    ]).start(() => {
      setFlowState("voted");
    });
  };

  actionsRef.current.handleTimerComplete = () => {
    const currentState = flowStateRef.current;
    if (currentState === "voted") {
      actionsRef.current.advance(null);
    }
  };

  actionsRef.current.undoCurrentQuestion = () => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser || !currentQuestion) return;
    if (!currentQuestion.hasVoted || !currentQuestion.userVote) return;

    const questionId = currentQuestion.id;
    const direction = currentQuestion.userVote;

    initiallyVotedIdsRef.current.delete(questionId);

    setFlowState("viewing");
    setVotedDirection(null);
    flowStateRef.current = "viewing";
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);

    const votes = currentQuestion.votes ?? { left: 0, right: 0 };
    const undoneVotes = {
      ...votes,
      [direction]: Math.max(0, votes[direction] - 1),
    };
    setUndoneCardOverride({
      questionId,
      hasVoted: false,
      userVote: undefined,
      votes: undoneVotes,
    });

    pendingUndoIdsRef.current.add(questionId);

    setQuestions((prev) => {
      const updated = [...prev];
      const q = updated[currentIndex];
      if (q && q.id === questionId) {
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

    setVoteHistory((prev) => prev.filter((h) => h.questionId !== questionId));

    const supabase = getSupabase();
    deleteVote(supabase, questionId, currentUser.id)
      .then(() =>
        refreshVoteCounts(questionId).then(() => {
          requestAnimationFrame(() => {
            pendingUndoIdsRef.current.delete(questionId);
            setUndoneCardOverride((prev) =>
              prev?.questionId === questionId ? null : prev,
            );
          });
        }),
      )
      .catch((err) => {
        console.error("Failed to delete vote:", err);
        pendingUndoIdsRef.current.delete(questionId);
        requestAnimationFrame(() => {
          setUndoneCardOverride((prev) =>
            prev?.questionId === questionId ? null : prev,
          );
        });
      });

    setIsTimerPaused(false);
    lastUndoTimeRef.current = Date.now();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleTimerComplete = React.useCallback(() => {
    actionsRef.current.handleTimerComplete();
  }, []);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (evt, gesture) => {
          // Only allow navigation swipes, not during voting flow
          if (flowStateRef.current !== "viewing" && flowStateRef.current !== "voted") return false;

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
          if (
            evt.nativeEvent.pageX < LEFT_EDGE_THRESHOLD &&
            gesture.dx > SWIPE_THRESHOLD
          ) {
            handleBackToList();
            position.setValue({ x: 0, y: 0 });
            return;
          }

          // Swipe navigation
          if (gesture.dx > SWIPE_THRESHOLD) {
            // Swipe right = go to previous question (or back to list if at first)
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Animated.timing(position, {
              toValue: { x: SCREEN_W, y: 0 },
              duration: 150,
              useNativeDriver: true,
            }).start(() => {
              actionsRef.current.goToPrevious();
            });
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            // Swipe left = skip to next
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Animated.timing(position, {
              toValue: { x: -SCREEN_W, y: 0 },
              duration: 150,
              useNativeDriver: true,
            }).start(() => {
              actionsRef.current.advance(null);
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
    [position, handleBackToList],
  );

  React.useEffect(() => {
    if (viewMode !== "card" || !baseQuestion) return;
    // Don't interfere with ongoing vote animation
    if (flowState === "voting" || flowState === "revealing") return;
    const wasVotedBefore = initiallyVotedIdsRef.current.has(baseQuestion.id);
    const isAlreadyVoted = wasVotedBefore || baseQuestion.isOwnQuestion;
    const justVoted = flowState === "voted" && baseQuestion.hasVoted;
    const viewingVotedQuestion =
      flowState === "viewing" && !!baseQuestion.hasVoted;
    if (!isAlreadyVoted && !justVoted && !viewingVotedQuestion) return;
    const votes = baseQuestion.votes ?? { left: 0, right: 0 };
    const total = votes.left + votes.right;
    const pct = getNormalizedPercentages(votes.left, votes.right, total);
    leftBarWidth.setValue(pct.left);
    rightBarWidth.setValue(pct.right);
  }, [viewMode, flowState, baseQuestion?.id, baseQuestion?.votes, baseQuestion?.hasVoted, baseQuestion?.isOwnQuestion, leftBarWidth, rightBarWidth]);

  React.useEffect(() => {
    if (searchQuery.length < 2) {
      setAutocompleteSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setAutocompleteLoading(true);
      try {
        const supabase = getSupabase();
        const results = await autocompleteSearch(supabase, searchQuery, {
          questionsLimit: 5,
          profilesLimit: 3,
        });
        setAutocompleteSuggestions(results);
      } catch (err) {
        console.error("Autocomplete search failed:", err);
        setAutocompleteSuggestions([]);
      } finally {
        setAutocompleteLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, getSupabase]);

  const handleSearchSubmit = React.useCallback(() => {
    if (searchQuery.trim()) {
      const trimmed = searchQuery.trim();
      setPerformedSearch(trimmed);
      setActiveSearchTab("all");
      performSearch(trimmed);
      if (!recentSearches.includes(trimmed)) {
        addToRecentSearches(trimmed);
      }
      setSearchFocused(false);
    }
  }, [searchQuery, recentSearches, addToRecentSearches, performSearch]);

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
    setSearchResults({
      questions: [],
      users: [],
      questionsTotal: 0,
      usersTotal: 0,
      questionsHasMore: false,
      usersHasMore: false,
    });
    setActiveSearchTab("all");
  }, [clearBlurTimeout]);

  const handleSearchTextChange = React.useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (performedSearch && text.trim() !== performedSearch.trim()) {
        setPerformedSearch("");
        setSearchFocused(true);
      }
    },
    [performedSearch],
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
      setActiveSearchTab("all");
      performSearch(trimmed);
      addToRecentSearches(trimmed);
      setSearchFocused(false);
    },
    [clearBlurTimeout, addToRecentSearches, performSearch],
  );

  const handleRecentSearchDelete = React.useCallback(
    (query: string) => {
      clearBlurTimeout();
      setRecentSearches((prev) => prev.filter((q) => q !== query));
      setSearchFocused(true);
    },
    [clearBlurTimeout],
  );

  const handleAutocompletePress = React.useCallback(
    (suggestion: AutocompleteSuggestion) => {
      clearBlurTimeout();

      if (suggestion.type === "user") {
        setSearchFocused(false);
        setSearchQuery("");
        router.push({
          pathname: "/user-profile",
          params: {
            username: suggestion.label,
            userId: suggestion.id,
          },
        });
      } else {
        const trimmed = suggestion.label.trim();
        if (!trimmed) return;

        setSearchQuery(trimmed);
        setPerformedSearch(trimmed);
        setActiveSearchTab("all");
        performSearch(trimmed);
        addToRecentSearches(trimmed);
        setSearchFocused(false);
      }
    },
    [clearBlurTimeout, addToRecentSearches, performSearch, router],
  );


  const viewModeRef = React.useRef(viewMode);
  const searchFocusedRef = React.useRef(searchFocused);
  const performedSearchRef = React.useRef(performedSearch);
  const prevSearchFocusedRef = React.useRef(searchFocused);

  React.useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  React.useEffect(() => {
    if (searchFocused && !prevSearchFocusedRef.current) {
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
      setSearchResults({
        questions: [],
        users: [],
        questionsTotal: 0,
        usersTotal: 0,
        questionsHasMore: false,
        usersHasMore: false,
      });
      setActiveSearchTab("all");
      chevronWidth.setValue(0);
      chevronOpacity.setValue(0);
      return true;
    }
    handleRefresh();
    return true;
  }, [handleBackToList, chevronWidth, chevronOpacity, handleRefresh]);

  React.useEffect(() => {
    registerResetCallback(resetToRoot);
    return () => unregisterResetCallback();
  }, [registerResetCallback, unregisterResetCallback, resetToRoot]);

  if (viewMode === "card") {
    if (loading) {
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
              onPress={handleBackToList}
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
            }}
          >
            <ActivityIndicator size="large" color="white" />
          </View>
        </View>
      );
    }

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
              onPress={handleBackToList}
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
              {selectedCategory
                ? `No more questions in ${selectedCategory}`
                : "No questions available"}
            </Text>
            <Text style={{ color: "#aaa", fontSize: 14, marginTop: 8, textAlign: "center" }}>
              {selectedCategory
                ? "Try another category or check back later!"
                : "Check back later!"}
            </Text>
            {selectedCategory && (
              <Pressable
                onPress={() => {
                  setSelectedCategory(null);
                  handleBackToList();
                }}
                style={{
                  marginTop: 20,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor: "#222",
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "white", fontSize: 14 }}>
                  Browse all categories
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    }

    // Pre-voted questions show results immediately
    const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(question.id);
    const isResultsMode = wasVotedBeforeSession || question.isOwnQuestion;

    // Calculate percentages
    const currentVotes = question?.votes ?? { left: 0, right: 0 };
    const currentTotal = currentVotes.left + currentVotes.right;
    const percentages = getNormalizedPercentages(
      currentVotes.left,
      currentVotes.right,
      currentTotal,
    );

    const showResults =
      flowState === "revealing" ||
      flowState === "voted" ||
      isResultsMode === true ||
      !!question?.hasVoted;
    const isTimerRunning = flowState === "voted" && !isResultsMode;
    const canTapChoices = flowState === "viewing" && !isResultsMode;
    const isVotedOrResultsView =
      flowState === "voted" || isResultsMode || !!question?.hasVoted;
    const hideChoiceHighlight =
      (flowState === "viewing" && !question?.hasVoted) ||
      undoneCardOverride?.questionId === question?.id;

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
            onPress={handleBackToList}
            style={{
              padding: 8,
            }}
          >
            <Octicons name="chevron-left" size={24} color="white" />
          </Pressable>
        </View>

        <Animated.View
          {...panResponder.panHandlers}
          onTouchStart={() => {
            if (isVotedOrResultsView) {
              pressStartTimeRef.current = Date.now();
              setIsTimerPaused(true);
            }
          }}
          onTouchEnd={(e) => {
            if (isVotedOrResultsView) {
              setIsTimerPaused(false);
              const pressDuration = Date.now() - pressStartTimeRef.current;
              const touchX = e.nativeEvent.pageX;
              const touchY = e.nativeEvent.pageY;
              const layout = choicesLayoutRef.current;
              const isOnChoices = layout && touchY >= layout.y && touchY <= layout.y + layout.height;

              if (pressDuration < 150 && !isOnChoices) {
                if (touchX > SCREEN_W / 2) {
                  actionsRef.current.advance(null);
                } else {
                  actionsRef.current.undoCurrentQuestion();
                }
              }
            }
          }}
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 20,
            opacity: contentOpacity,
            transform: [
              { translateX: position.x },
              { scale: contentScale },
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

            <View
              style={{ gap: 12, marginTop: 8 }}
              onLayout={(e) => {
                e.target.measure((_x, _y, _width, height, _pageX, pageY) => {
                  choicesLayoutRef.current = { y: pageY, height };
                });
              }}
            >
              <FullScreenChoice
                choice={question.left}
                direction="left"
                onPress={() => {
                  if (isVotedOrResultsView) {
                    const pressDuration = Date.now() - pressStartTimeRef.current;
                    if (pressDuration < 150) {
                      actionsRef.current.undoCurrentQuestion();
                    }
                  } else {
                    actionsRef.current.handleChoiceTap("left");
                  }
                }}
                onPressIn={() => {
                  if (isVotedOrResultsView) {
                    pressStartTimeRef.current = Date.now();
                    setIsTimerPaused(true);
                  }
                }}
                onPressOut={() => {
                  if (isVotedOrResultsView) {
                    setIsTimerPaused(false);
                  }
                }}
                disabled={!canTapChoices && !isVotedOrResultsView}
                showResults={showResults}
                percentage={showResults ? percentages.left : 0}
                votes={currentVotes.left}
                animatedWidth={leftBarWidth}
                friendVotes={question.friendVotes?.left?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
                isSelected={!hideChoiceHighlight && (votedDirection === "left" || question.userVote === "left")}
              />
              <FullScreenChoice
                choice={question.right}
                direction="right"
                onPress={() => {
                  if (isVotedOrResultsView) {
                    const pressDuration = Date.now() - pressStartTimeRef.current;
                    if (pressDuration < 150) {
                      actionsRef.current.undoCurrentQuestion();
                    }
                  } else {
                    actionsRef.current.handleChoiceTap("right");
                  }
                }}
                onPressIn={() => {
                  if (isVotedOrResultsView) {
                    pressStartTimeRef.current = Date.now();
                    setIsTimerPaused(true);
                  }
                }}
                onPressOut={() => {
                  if (isVotedOrResultsView) {
                    setIsTimerPaused(false);
                  }
                }}
                disabled={!canTapChoices && !isVotedOrResultsView}
                showResults={showResults}
                percentage={showResults ? percentages.right : 0}
                votes={currentVotes.right}
                animatedWidth={rightBarWidth}
                friendVotes={question.friendVotes?.right?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
                isSelected={!hideChoiceHighlight && (votedDirection === "right" || question.userVote === "right")}
              />
              <View style={{ marginTop: 8, opacity: isTimerRunning ? 1 : 0 }}>
                <ProgressBar
                  duration={TIMER_DURATION}
                  isRunning={isTimerRunning}
                  isPaused={isTimerPaused}
                  onComplete={handleTimerComplete}
                />
              </View>
            </View>
          </View>
        </Animated.View>
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
              <Octicons name='chevron-left' size={20} color='#aaa' />
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
                <Text
                  style={{ color: "#aaa", fontSize: 14, fontWeight: "600" }}
                >
                  Recent
                </Text>
                {recentSearches.length > 0 && (
                  <Pressable onPress={() => setRecentSearches([])}>
                    <Text style={{ color: "#666", fontSize: 14 }}>
                      Clear all
                    </Text>
                  </Pressable>
                )}
              </View>
              {recentSearches.length > 0 ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps='handled'
                >
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
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 24,
                  }}
                >
                  <Text style={{ color: "#666", fontSize: 14 }}>
                    No recent searches
                  </Text>
                </View>
              )}
            </>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps='handled'
            >
              {autocompleteLoading ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 24,
                  }}
                >
                  <ActivityIndicator size='small' color='white' />
                </View>
              ) : autocompleteSuggestions.length > 0 ? (
                <>
                  {autocompleteSuggestions.some((s) => s.type === "user") && (
                    <>
                      <View
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          backgroundColor: "#0f0f0f",
                        }}
                      >
                        <Text
                          style={{
                            color: "#888",
                            fontSize: 12,
                            fontWeight: "600",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          Users
                        </Text>
                      </View>
                      {autocompleteSuggestions
                        .filter((s) => s.type === "user")
                        .map((item) => (
                          <AutocompleteItem
                            key={`${item.type}-${item.id}`}
                            suggestion={item}
                            onPress={() => handleAutocompletePress(item)}
                          />
                        ))}
                    </>
                  )}
                  {autocompleteSuggestions.some(
                    (s) => s.type === "question",
                  ) && (
                    <>
                      <View
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          backgroundColor: "#0f0f0f",
                          borderTopWidth:
                            autocompleteSuggestions.some(
                              (s) => s.type === "user",
                            )
                              ? 1
                              : 0,
                          borderTopColor: "#333",
                        }}
                      >
                        <Text
                          style={{
                            color: "#888",
                            fontSize: 12,
                            fontWeight: "600",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          Suggestions
                        </Text>
                      </View>
                      {autocompleteSuggestions
                        .filter((s) => s.type === "question")
                        .map((item) => (
                          <AutocompleteItem
                            key={`${item.type}-${item.id}`}
                            suggestion={item}
                            onPress={() => handleAutocompletePress(item)}
                          />
                        ))}
                    </>
                  )}
                </>
              ) : (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 24,
                  }}
                >
                  <Text style={{ color: "#666", fontSize: 14 }}>
                    No suggestions found
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    );
  }

  const categoriesTranslateY = performedSearch ? 0 : scrollY.interpolate({
    inputRange: [0, CATEGORIES_HEIGHT],
    outputRange: [0, -CATEGORIES_HEIGHT],
    extrapolate: 'clamp',
  });

  const searchBarTranslateY = 0;

  const searchBarBorderOpacity = performedSearch ? 1 : scrollY.interpolate({
    inputRange: [CATEGORIES_HEIGHT - 10, CATEGORIES_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 11,
          backgroundColor: "black",
          transform: [{ translateY: searchBarTranslateY }],
        }}
      >
        <View
          style={{
            paddingTop: 60,
            paddingBottom: 12,
            paddingHorizontal: 16,
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
        <Animated.View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: "#333",
            opacity: searchBarBorderOpacity,
          }}
        />
      </Animated.View>

      {!performedSearch && (
        <Animated.View
          style={{
            position: "absolute",
            top: SEARCH_BAR_HEIGHT,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: "black",
            transform: [{ translateY: categoriesTranslateY }],
          }}
        >
          <View
            style={{
              height: 60,
              borderBottomWidth: 1,
              borderBottomColor: "#222",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 8,
              }}
            >
              <Pressable
                onPress={() => setSelectedCategory(null)}
                style={{
                  height: 36,
                  paddingHorizontal: 16,
                  borderRadius: 18,
                  borderWidth: 1,
                  backgroundColor: selectedCategory === null ? "white" : "transparent",
                  borderColor: selectedCategory === null ? "white" : "#333",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: selectedCategory === null ? "black" : "#aaa",
                    fontSize: 14,
                    fontWeight: "500",
                  }}
                >
                  All
                </Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.category}
                  onPress={() => setSelectedCategory(cat.category)}
                  style={{
                    height: 36,
                    paddingHorizontal: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    backgroundColor: selectedCategory === cat.category ? "white" : "transparent",
                    borderColor: selectedCategory === cat.category ? "white" : "#333",
                    justifyContent: "center",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      color: selectedCategory === cat.category ? "black" : "#aaa",
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    {cat.category}
                  </Text>
                  <Text
                    style={{
                      color: selectedCategory === cat.category ? "rgba(0,0,0,0.5)" : "#666",
                      fontSize: 12,
                    }}
                  >
                    {cat.count}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      )}

      {performedSearch ? (
        <View style={{ flex: 1, paddingTop: SEARCH_BAR_HEIGHT }}>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#222",
            }}
          >
            <SearchFilterTab
              label='All'
              isActive={activeSearchTab === "all"}
              onPress={() => setActiveSearchTab("all")}
              count={searchResults.questionsTotal + searchResults.usersTotal}
            />
            <SearchFilterTab
              label='Questions'
              isActive={activeSearchTab === "questions"}
              onPress={() => setActiveSearchTab("questions")}
              count={searchResults.questionsTotal}
            />
            <SearchFilterTab
              label='Users'
              isActive={activeSearchTab === "users"}
              onPress={() => setActiveSearchTab("users")}
              count={searchResults.usersTotal}
            />
          </View>

          {searchLoading ? (
            <View
              style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
            >
              <ActivityIndicator size='large' color='white' />
            </View>
          ) : searchResults.questions.length === 0 && searchResults.users.length === 0 ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                padding: 24,
              }}
            >
              <Text style={{ color: "#666", fontSize: 14 }}>
                No results found for {'"' + performedSearch + '"'}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {activeSearchTab === "all" && (
                <>
                  {searchResults.questions.length > 0 && (
                    <View>
                      <Text
                        style={{
                          color: "#aaa",
                          fontSize: 14,
                          fontWeight: "600",
                          paddingHorizontal: 16,
                          paddingTop: 16,
                          paddingBottom: 8,
                        }}
                      >
                        Questions
                      </Text>
                      <View style={{ paddingHorizontal: 16 }}>
                        {searchResults.questions.map((question) => (
                          <QuestionCard
                            key={question.id}
                            question={question}
                            onPress={() => handleCardPress(question)}
                          />
                        ))}
                      </View>
                      {searchResults.questionsHasMore && (
                        <Pressable
                          onPress={loadMoreQuestions}
                          disabled={loadingMoreQuestions}
                          style={({ pressed }) => ({
                            marginHorizontal: 16,
                            marginTop: 8,
                            paddingVertical: 12,
                            borderRadius: 8,
                            backgroundColor: pressed ? "#222" : "#1a1a1a",
                            alignItems: "center",
                          })}
                        >
                          {loadingMoreQuestions ? (
                            <ActivityIndicator size='small' color='white' />
                          ) : (
                            <Text style={{ color: "white", fontSize: 14 }}>
                              Load more questions
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  )}

                  {searchResults.users.length > 0 && (
                    <View>
                      <Text
                        style={{
                          color: "#aaa",
                          fontSize: 14,
                          fontWeight: "600",
                          paddingHorizontal: 16,
                          paddingTop: 16,
                          paddingBottom: 8,
                        }}
                      >
                        Users
                      </Text>
                      {searchResults.users.map((user) => (
                        <UserListItem key={user.id} user={user} />
                      ))}
                      {searchResults.usersHasMore && (
                        <Pressable
                          onPress={loadMoreUsers}
                          disabled={loadingMoreUsers}
                          style={({ pressed }) => ({
                            marginHorizontal: 16,
                            marginTop: 8,
                            paddingVertical: 12,
                            borderRadius: 8,
                            backgroundColor: pressed ? "#222" : "#1a1a1a",
                            alignItems: "center",
                          })}
                        >
                          {loadingMoreUsers ? (
                            <ActivityIndicator size='small' color='white' />
                          ) : (
                            <Text style={{ color: "white", fontSize: 14 }}>
                              Load more users
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  )}
                </>
              )}

              {activeSearchTab === "questions" && (
                <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                  {searchResults.questions.length > 0 ? (
                    <>
                      {searchResults.questions.map((question) => (
                        <QuestionCard
                          key={question.id}
                          question={question}
                          onPress={() => handleCardPress(question)}
                        />
                      ))}
                      {searchResults.questionsHasMore && (
                        <Pressable
                          onPress={loadMoreQuestions}
                          disabled={loadingMoreQuestions}
                          style={({ pressed }) => ({
                            marginTop: 8,
                            paddingVertical: 12,
                            borderRadius: 8,
                            backgroundColor: pressed ? "#222" : "#1a1a1a",
                            alignItems: "center",
                          })}
                        >
                          {loadingMoreQuestions ? (
                            <ActivityIndicator size='small' color='white' />
                          ) : (
                            <Text style={{ color: "white", fontSize: 14 }}>
                              Load more questions
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <View
                      style={{
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 24,
                      }}
                    >
                      <Text style={{ color: "#666", fontSize: 14 }}>
                        No questions found
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {activeSearchTab === "users" && (
                <View style={{ paddingTop: 8 }}>
                  {searchResults.users.length > 0 ? (
                    <>
                      {searchResults.users.map((user) => (
                        <UserListItem key={user.id} user={user} />
                      ))}
                      {searchResults.usersHasMore && (
                        <Pressable
                          onPress={loadMoreUsers}
                          disabled={loadingMoreUsers}
                          style={({ pressed }) => ({
                            marginHorizontal: 16,
                            marginTop: 8,
                            paddingVertical: 12,
                            borderRadius: 8,
                            backgroundColor: pressed ? "#222" : "#1a1a1a",
                            alignItems: "center",
                          })}
                        >
                          {loadingMoreUsers ? (
                            <ActivityIndicator size='small' color='white' />
                          ) : (
                            <Text style={{ color: "white", fontSize: 14 }}>
                              Load more users
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </>
                  ) : (
                    <View
                      style={{
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 24,
                      }}
                    >
                      <Text style={{ color: "#666", fontSize: 14 }}>
                        No users found
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      ) : loading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: HEADER_HEIGHT }}
        >
          <ActivityIndicator size='large' color='white' />
        </View>
      ) : questions.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            paddingTop: HEADER_HEIGHT,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, textAlign: "center" }}>
            No questions yet
          </Text>
          <Text
            style={{
              color: "#aaa",
              fontSize: 14,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Be the first to create one!
          </Text>
        </View>
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <QuestionCard
              question={item}
              onPress={() => handleCardPress(item)}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingTop: HEADER_HEIGHT + 16 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor='#fff'
              colors={["#fff"]}
              progressViewOffset={HEADER_HEIGHT}
              style={{ zIndex: 20 }}
              progressBackgroundColor='#222'
            />
          }
        />
      )}
    </View>
  );
}
