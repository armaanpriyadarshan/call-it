import { QuestionCard } from "@/components/questions";
import {
  AutocompleteItem,
  RecentSearchItem,
  SearchBar,
  SearchFilterTab,
} from "@/components/search";
import { UserListItem } from "@/components/users";
import { ActionButton, ChoiceOption } from "@/components/voting";
import { SUGGESTED_CATEGORIES } from "@/constants/categories";
import { useExploreTabReset } from "@/contexts/explore-tab-context";
import {
  useRealtimeQuestions,
  useRealtimeUserVotes,
  useRealtimeVoteCounts,
} from "@/lib/hooks/useRealtime";
import { getProfile, Profile } from "@/lib/queries/profiles";
import { Question as DbQuestion, getQuestions } from "@/lib/queries/questions";
import {
  autocompleteSearch,
  AutocompleteSuggestion,
  searchAll,
  searchQuestions,
  searchProfiles,
} from "@/lib/queries/search";
import {
  createVote,
  deleteVote,
  getUserVotes,
  getVoteCounts,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { Question, User, VoteHistoryItem } from "@/types";
import { calculateVoteData } from "@/utils/voting";
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

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const LEFT_EDGE_THRESHOLD = 50;
const MAX_RECENT_SEARCHES = 10;
const SEARCH_BAR_HEIGHT = 112; // paddingTop 60 + paddingBottom 12 + search bar ~40
const CATEGORIES_HEIGHT = 60;
const HEADER_HEIGHT = SEARCH_BAR_HEIGHT + CATEGORIES_HEIGHT;

export default function ExploreScreen() {
  const router = useRouter();
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
  const [refreshing, setRefreshing] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"list" | "card">("list");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const question = questions[displayIndex] ?? null;
  const [swipeProgress, setSwipeProgress] = React.useState(0);
  const [swipeDirection, setSwipeDirection] = React.useState<
    "left" | "right" | null
  >(null);
  const [voteHistory, setVoteHistory] = React.useState<VoteHistoryItem[]>([]);
  const [cardOpacity, setCardOpacity] = React.useState(1);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = React.useState<
    AutocompleteSuggestion[]
  >([]);
  const [autocompleteLoading, setAutocompleteLoading] = React.useState(false);

  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const entryScale = React.useRef(new Animated.Value(1)).current;
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

  getTokenRef.current = getToken;
  userRef.current = user;
  questionsRef.current = questions;
  displayIndexRef.current = displayIndex;
  voteHistoryRef.current = voteHistory;

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

        initiallyVotedIdsRef.current = new Set(userVotesMap.keys());
        pendingUndoIdsRef.current.clear();

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

        // Map question results with vote counts and creator profiles
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
  }, [user, fetchQuestions]);

  React.useEffect(() => {
    if (user && hasFetchedRef.current) {
      // Reset header position when switching categories
      headerOffset.current = 0;
      lastScrollY.current = 0;
      scrollY.setValue(0);
      setLoading(true);
      fetchQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const supabase = React.useMemo(() => {
    if (!user) return null;
    return getSupabase();
  }, [user, getSupabase]);

  const refreshVoteCounts = React.useCallback(
    async (questionId: string) => {
      const currentUser = userRef.current;
      if (!currentUser) return;

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
            hasVoted: isPendingUndo
              ? question.hasVoted
              : userVote !== undefined,
            userVote: isPendingUndo ? question.userVote : userVote,
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

  // Handle votes cast/removed from other screens (profile, home)
  const handleExternalVoteCast = React.useCallback(
    async (voteData: any) => {
      const questionId = voteData.question_id;
      const choice = voteData.choice as "left" | "right";

      // Skip if this is a pending undo (local action)
      if (pendingUndoIdsRef.current.has(questionId)) return;

      // Update the question's vote state
      setQuestions((prev) => {
        const idx = prev.findIndex((q) => q.id === questionId);
        if (idx === -1) return prev;

        const updated = [...prev];
        const q = updated[idx];
        // Only update if not already marked as voted
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

      // Skip if this is a pending undo (local action)
      if (pendingUndoIdsRef.current.has(questionId)) {
        pendingUndoIdsRef.current.delete(questionId);
        return;
      }

      // Update the question's vote state
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

      // Remove from initially voted set since the vote no longer exists
      initiallyVotedIdsRef.current.delete(questionId);

      // Also remove from vote history if present
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
    // Reset header position when refreshing
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

      // Determine scroll direction
      if (diff > 0) {
        scrollDirection.current = 'down';
      } else if (diff < 0) {
        scrollDirection.current = 'up';
      }

      // Calculate new header offset based on scroll
      if (scrollDirection.current === 'down') {
        // Scrolling down - increase offset (hide header)
        headerOffset.current = Math.min(
          headerOffset.current + diff,
          HEADER_HEIGHT
        );
      } else {
        // Scrolling up - decrease offset (show header)
        headerOffset.current = Math.max(
          headerOffset.current + diff,
          0
        );
      }

      // Ensure we're fully visible at top
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
        setDisplayIndex(foundIndex);
        setViewMode("card");
        position.setValue({ x: 0, y: 0 });
        setSwipeProgress(0);
        setSwipeDirection(null);
        setCardOpacity(1);
        entryScale.setValue(1);
      }
    },
    [questions, position, entryScale],
  );

  const handleBackToList = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    setSwipeProgress(0);
    setSwipeDirection(null);
    position.setValue({ x: 0, y: 0 });
  }, [position]);

  const actionsRef = React.useRef({
    recordVote: (_direction: "left" | "right") => {},
    advance: (_direction: "left" | "right" | null) => {},
    resetCard: () => {},
    forceSwipe: (_direction: "left" | "right") => {},
    skip: () => {},
    undo: () => {},
  });

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

  actionsRef.current.recordVote = async (direction: "left" | "right") => {
    const currentUser = userRef.current;
    const currentQuestions = questionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser || !currentQuestion) return;

    const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(
      currentQuestion.id,
    );
    if (wasVotedBeforeSession || currentQuestion.isOwnQuestion) return;

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
        if (pendingUndoIdsRef.current.has(currentQuestion.id)) {
          return prev;
        }
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

    setSwipeProgress(0);
    setSwipeDirection(null);
    setCardOpacity(0);
    setDisplayIndex(nextIdx);
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
    const questionId = lastVote.questionId;

    const wasVotedBeforeSession = Boolean(
      questionId && initiallyVotedIdsRef.current.has(questionId),
    );

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
      deleteVote(supabase, questionId, currentUser.id).catch((err) => {
        console.error("Failed to delete vote:", err);
      });
    }

    setVoteHistory((prev) => prev.slice(0, -1));
    setDisplayIndex(previousIndex);
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
          if (
            evt.nativeEvent.pageX < LEFT_EDGE_THRESHOLD &&
            gesture.dx > SWIPE_THRESHOLD
          ) {
            handleBackToList();
            position.setValue({ x: 0, y: 0 });
            return;
          }

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
    [position, handleBackToList],
  );

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
    if (!question) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "black",
            padding: 24,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 18 }}>
            No questions available
          </Text>
          <Text style={{ color: "#aaa", fontSize: 14, marginTop: 8 }}>
            Check back later!
          </Text>
        </View>
      );
    }

    const isResultsMode = question.hasVoted || question.isOwnQuestion;

    const {
      leftPercentage,
      rightPercentage,
      leftVotes,
      rightVotes,
      leftHighlight,
      rightHighlight,
    } = calculateVoteData(
      question,
      isResultsMode ? 0 : swipeProgress,
      isResultsMode ? null : swipeDirection,
    );

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
          <ActionButton
            onPress={handleBackToList}
            icon='arrow-left'
            label='Back'
          />

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
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
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
                              textDecorationLine: pressed
                                ? "underline"
                                : "none",
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
                percentage={leftPercentage}
                votes={leftVotes}
                swipeProgress={isResultsMode ? 0 : swipeProgress}
                swipeDirection={isResultsMode ? null : swipeDirection}
                isSelected={
                  isResultsMode
                    ? question.userVote === "left"
                    : swipeDirection === "left"
                }
                highlight={isResultsMode ? 0 : leftHighlight}
                resultsMode={isResultsMode}
              />

              <ChoiceOption
                choice={question.right}
                direction='right'
                percentage={rightPercentage}
                votes={rightVotes}
                swipeProgress={isResultsMode ? 0 : swipeProgress}
                swipeDirection={isResultsMode ? null : swipeDirection}
                isSelected={
                  isResultsMode
                    ? question.userVote === "right"
                    : swipeDirection === "right"
                }
                highlight={isResultsMode ? 0 : rightHighlight}
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

  // Interpolate scroll position for separate header sections
  // Categories collapse first (0 to CATEGORIES_HEIGHT), then search bar (CATEGORIES_HEIGHT to HEADER_HEIGHT)
  // Categories must also move when search bar moves, so total movement is -CATEGORIES_HEIGHT + -SEARCH_BAR_HEIGHT
  const categoriesTranslateY = performedSearch ? 0 : scrollY.interpolate({
    inputRange: [0, CATEGORIES_HEIGHT, HEADER_HEIGHT],
    outputRange: [0, -CATEGORIES_HEIGHT, -CATEGORIES_HEIGHT - SEARCH_BAR_HEIGHT],
    extrapolate: 'clamp',
  });

  const searchBarTranslateY = performedSearch ? 0 : scrollY.interpolate({
    inputRange: [CATEGORIES_HEIGHT, HEADER_HEIGHT],
    outputRange: [0, -SEARCH_BAR_HEIGHT],
    extrapolate: 'clamp',
  });

  // Show search bar border when categories have collapsed
  const searchBarBorderOpacity = performedSearch ? 1 : scrollY.interpolate({
    inputRange: [CATEGORIES_HEIGHT - 10, CATEGORIES_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* Animated Search Bar */}
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
        {/* Animated border that appears when categories collapse */}
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

      {/* Animated Categories Row */}
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
              {SUGGESTED_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  style={{
                    height: 36,
                    paddingHorizontal: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    backgroundColor: selectedCategory === category ? "white" : "transparent",
                    borderColor: selectedCategory === category ? "white" : "#333",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: selectedCategory === category ? "black" : "#aaa",
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    {category}
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
              {/* All tab - show both questions and users */}
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

              {/* Questions tab */}
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

              {/* Users tab */}
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
            />
          }
        />
      )}
    </View>
  );
}
