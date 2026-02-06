import { QuestionCard } from "@/components/questions";
import { UserListItem, UserProfileHeader } from "@/components/users";
import { FullScreenChoice, ProgressBar } from "@/components/voting";
import {
    useRealtimeFollows,
    useRealtimeUserQuestionVotes,
    useRealtimeVoteCounts,
    useRealtimeUserVotes,
} from "@/lib/hooks/useRealtime";
import {
    checkFollowStatus,
    followUser,
    getFollowing,
    getFollowersWithProfiles,
    getFollowingWithProfiles,
    getUserStats,
    unfollowUser,
} from "@/lib/queries/follows";
import { getProfile, getProfileByUsername } from "@/lib/queries/profiles";
import { Question as DbQuestion, getQuestions } from "@/lib/queries/questions";
import {
    createVote,
    deleteVote,
    getFriendVotesForQuestions,
    getTotalVotesOnUserQuestions,
    getUserVotes,
    getUserVotesCastCount,
    getVoteCounts,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { Question, User, VoteHistoryItem, VotingFlowState } from "@/types";
import { mapDbQuestionToQuestion as mapDbQuestion } from "@/utils/questions";
import { getNormalizedPercentages } from "@/utils/voting";
import { useSession, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  voteCounts: Map<string, { left: number; right: number }>,
  userVotes: Map<string, "left" | "right">,
  currentUserId: string | undefined,
  creatorUsername: string | undefined,
  friendVotesMap?: Map<string, { left: { userId: string; avatarUrl: string | null }[]; right: { userId: string; avatarUrl: string | null }[] }>,
): Question {
  const votes = voteCounts.get(dbQuestion.id) || { left: 0, right: 0 };
  const userVote = userVotes.get(dbQuestion.id);
  const friendVotes = friendVotesMap?.get(dbQuestion.id);

  return mapDbQuestion(
    dbQuestion,
    votes,
    dbQuestion.is_anonymous,
    dbQuestion.is_anonymous ? "Anonymous" : creatorUsername,
    userVote,
    currentUserId,
    friendVotes,
  );
}

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const LEFT_EDGE_THRESHOLD = 50;
const TAB_ANIMATION_DURATION = 250;

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ username?: string; userId?: string }>();
  const { session } = useSession();
  const { user: currentUser } = useUser();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState({
    questionsCreated: 0,
    totalVotesCast: 0,
    totalEngagement: 0,
    followers: 0,
    following: 0,
  });
  const [followers, setFollowers] = useState<User[]>([]);
  const [following, setFollowing] = useState<User[]>([]);

  const [userQuestions, setUserQuestions] = useState<Question[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [displayIndex, setDisplayIndex] = useState(0);
  const [undoneCardOverride, setUndoneCardOverride] = useState<{
    questionId: string;
    hasVoted: false;
    userVote: undefined;
    votes: { left: number; right: number };
  } | null>(null);
  const baseQuestion = userQuestions[displayIndex] ?? null;
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
  const [profileView, setProfileView] = useState<
    "profile" | "followers" | "following"
  >("profile");
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const isPerformingFollowActionRef = useRef(false);
  const [followersFollowingSearch, setFollowersFollowingSearch] = useState("");
  const [voteHistory, setVoteHistory] = useState<VoteHistoryItem[]>([]);

  const [flowState, setFlowState] = useState<VotingFlowState>("viewing");
  const [votedDirection, setVotedDirection] = useState<"left" | "right" | null>(null);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  const TIMER_DURATION = 4000;
  const REVEAL_DURATION = 400;

  const supabase = useMemo(() => {
    return session ? createClerkSupabaseClient(session) : null;
  }, [session]);

  const screenWidth = Dimensions.get("window").width;
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

  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentScale = useRef(new Animated.Value(1)).current;
  const leftBarWidth = useRef(new Animated.Value(0)).current;
  const rightBarWidth = useRef(new Animated.Value(0)).current;
  const flowStateRef = useRef(flowState);
  const pressStartTimeRef = useRef<number>(0);
  const lastUndoTimeRef = useRef<number>(0);
  const choicesLayoutRef = useRef<{ y: number; height: number } | null>(null);
  const voteAnimationTargetRef = useRef<{
    percentages: { left: number; right: number };
    votes: { left: number; right: number };
  } | null>(null);
  const initiallyVotedIdsRef = useRef<Set<string>>(new Set());
  const pendingUndoIdsRef = useRef<Set<string>>(new Set());
  const displayIndexRef = useRef(displayIndex);
  const userQuestionsRef = useRef(userQuestions);
  const voteHistoryRef = useRef(voteHistory);

  flowStateRef.current = flowState;
  displayIndexRef.current = displayIndex;
  userQuestionsRef.current = userQuestions;
  voteHistoryRef.current = voteHistory;

  useEffect(() => {
    async function fetchProfileData() {
      if (!session) return;

      setIsLoading(true);
      setError(null);

      try {
        const supabase = createClerkSupabaseClient(session);

        let targetUserId = params.userId;
        let targetProfile = null;

        if (params.username && !params.userId) {
          targetProfile = await getProfileByUsername(supabase, params.username);
          if (targetProfile) {
            targetUserId = targetProfile.user_id;
          }
        } else if (targetUserId) {
          targetProfile = await getProfile(supabase, targetUserId);
        }

        if (!targetUserId || !targetProfile) {
          setError("User not found");
          setIsLoading(false);
          return;
        }

        const stats = await getUserStats(supabase, targetUserId);

        const votesCast = await getUserVotesCastCount(supabase, targetUserId);

        const totalEngagement = await getTotalVotesOnUserQuestions(
          supabase,
          targetUserId,
        );

        setUserStats({
          questionsCreated: stats.questions_count,
          totalVotesCast: votesCast,
          totalEngagement,
          followers: stats.followers_count,
          following: stats.following_count,
        });

        setProfileUser({
          id: targetUserId,
          username:
            targetProfile.username || targetProfile.first_name || "User",
          firstName: targetProfile.first_name || undefined,
          lastName: targetProfile.last_name || undefined,
          avatarUrl: targetProfile.avatar_url || undefined,
        });

        if (currentUser?.id && currentUser.id !== targetUserId) {
          const followStatus = await checkFollowStatus(
            supabase,
            currentUser.id,
            targetUserId,
          );
          setIsFollowing(followStatus);
        }

        const dbQuestions = await getQuestions(supabase, {
          userId: targetUserId,
          limit: 50,
        });

        if (dbQuestions.length > 0) {
          const questionIds = dbQuestions.map((q) => q.id);
          const followingIds = currentUser?.id
            ? await getFollowing(supabase, currentUser.id)
            : [];
          const [voteCounts, userVotes, friendVotesMap] = await Promise.all([
            getVoteCounts(supabase, questionIds),
            currentUser?.id
              ? getUserVotes(supabase, currentUser.id, questionIds)
              : Promise.resolve(new Map<string, "left" | "right">()),
            followingIds.length > 0
              ? getFriendVotesForQuestions(supabase, questionIds, followingIds)
              : Promise.resolve(new Map()),
          ]);

          initiallyVotedIdsRef.current = new Set(userVotes.keys());
          pendingUndoIdsRef.current.clear();

          const displayQuestions = dbQuestions.map((q) =>
            mapDbQuestionToQuestion(
              q,
              voteCounts,
              userVotes,
              currentUser?.id,
              targetProfile?.username || undefined,
              friendVotesMap,
            ),
          );
          setUserQuestions(displayQuestions);
        } else {
          setUserQuestions([]);
        }

        const [followersData, followingData] = await Promise.all([
          getFollowersWithProfiles(supabase, targetUserId),
          getFollowingWithProfiles(supabase, targetUserId),
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
        setError("Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfileData();
  }, [session, params.username, params.userId, currentUser?.id]);

  const handleFollowPress = useCallback(async () => {
    if (!session || !currentUser?.id || !profileUser?.id) return;
    if (currentUser.id === profileUser.id) return;

    setIsFollowLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const currentUserData: User = {
      id: currentUser.id,
      username: currentUser.username || currentUser.firstName || "User",
      firstName: currentUser.firstName || undefined,
      lastName: currentUser.lastName || undefined,
      avatarUrl: currentUser.imageUrl || undefined,
    };

    isPerformingFollowActionRef.current = true;

    try {
      const supabase = createClerkSupabaseClient(session);

      if (isFollowing) {
        await unfollowUser(supabase, currentUser.id, profileUser.id);
        setIsFollowing(false);
        setUserStats((prev) => ({
          ...prev,
          followers: Math.max(0, prev.followers - 1),
        }));
        setFollowers((prev) => prev.filter((f) => f.id !== currentUser.id));
      } else {
        await followUser(supabase, currentUser.id, profileUser.id);
        setIsFollowing(true);
        setUserStats((prev) => ({
          ...prev,
          followers: prev.followers + 1,
        }));
        setFollowers((prev) => [currentUserData, ...prev]);
      }
    } catch (err) {
      // silently handled
    } finally {
      setIsFollowLoading(false);
      setTimeout(() => {
        isPerformingFollowActionRef.current = false;
      }, 1000);
    }
  }, [session, currentUser, profileUser?.id, isFollowing]);

  const profileQuestionIds = useMemo(
    () => userQuestions.map((q) => q.id),
    [userQuestions],
  );

  const refreshVoteCounts = useCallback(
    async (questionId: string) => {
      if (!supabase || !currentUser?.id) return;

      const [updatedVoteCounts, userVotesMap] = await Promise.all([
        getVoteCounts(supabase, [questionId]),
        getUserVotes(supabase, currentUser.id, [questionId]),
      ]);

      const newCounts = updatedVoteCounts.get(questionId) ?? {
        left: 0,
        right: 0,
      };
      const userVote = userVotesMap.get(questionId);

      setUserQuestions((prev) => {
        const currentId = userQuestionsRef.current[displayIndexRef.current]?.id;
        const isCurrentCardInVoteFlow =
          questionId === currentId &&
          (flowStateRef.current === "voting" ||
            flowStateRef.current === "revealing" ||
            flowStateRef.current === "voted");
        if (isCurrentCardInVoteFlow) return prev;

        const updated = [...prev];
        const idx = updated.findIndex((q) => q.id === questionId);
        if (idx !== -1) {
          const q = updated[idx];
          const isPendingUndo = pendingUndoIdsRef.current.has(questionId);
          updated[idx] = {
            ...q,
            votes: newCounts,
            hasVoted: isPendingUndo ? false : userVote !== undefined,
            userVote: isPendingUndo ? undefined : userVote,
          };
        }
        return updated;
      });
    },
    [supabase, currentUser?.id],
  );

  const handleVoteReceived = useCallback(
    async (questionId: string, payload: any) => {
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
    [],
  );

  useRealtimeUserQuestionVotes(
    supabase,
    profileQuestionIds,
    handleVoteReceived,
  );

  useRealtimeVoteCounts(supabase, profileQuestionIds, refreshVoteCounts);

  const handleExternalVoteCast = useCallback(
    async (voteData: any) => {
      const questionId = voteData.question_id;
      const choice = voteData.choice as "left" | "right";

      if (pendingUndoIdsRef.current.has(questionId)) return;

      setUserQuestions((prev) => {
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

  const handleExternalVoteRemoved = useCallback(
    async (voteData: any) => {
      const questionId = voteData.question_id;

      if (pendingUndoIdsRef.current.has(questionId)) {
        pendingUndoIdsRef.current.delete(questionId);
        return;
      }

      setUserQuestions((prev) => {
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
    currentUser?.id ?? null,
    handleExternalVoteCast,
    handleExternalVoteRemoved,
  );

  const handleFollowerChange = useCallback((isNewFollower: boolean) => {
    if (isPerformingFollowActionRef.current) return;
    setUserStats((prev) => ({
      ...prev,
      followers: isNewFollower
        ? prev.followers + 1
        : Math.max(0, prev.followers - 1),
    }));
  }, []);

  const handleFollowingChange = useCallback((isNewFollowing: boolean) => {
    setUserStats((prev) => ({
      ...prev,
      following: isNewFollowing
        ? prev.following + 1
        : Math.max(0, prev.following - 1),
    }));
  }, []);

  useRealtimeFollows(
    supabase,
    profileUser?.id || null,
    handleFollowerChange,
    handleFollowingChange,
  );

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

  const user: User = useMemo(() => {
    if (profileUser) {
      return profileUser;
    }
    return {
      id: params.userId || "loading",
      username: params.username || "Loading...",
      firstName: undefined,
      lastName: undefined,
      avatarUrl: undefined,
    };
  }, [profileUser, params.username, params.userId]);

  const handleQuestionPress = (q: Question) => {
    const foundIndex = userQuestions.findIndex((uq) => uq.id === q.id);
    if (foundIndex >= 0) {
      voteAnimationTargetRef.current = null;
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
      setUndoneCardOverride(null);
    }
  };

  const handleBackToList = useCallback((options?: { skipPositionReset?: boolean }) => {
    const skipPositionReset = options?.skipPositionReset ?? false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    voteAnimationTargetRef.current = null;
    setViewMode("list");
    setUndoneCardOverride(null);
    setFlowState("viewing");
    setVotedDirection(null);
    setIsTimerPaused(false);
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    contentOpacity.setValue(1);
    contentScale.setValue(1);
    if (!skipPositionReset) {
      position.setValue({ x: 0, y: 0 });
    }
  }, [position, leftBarWidth, rightBarWidth, contentOpacity, contentScale]);

  const actionsRef = useRef({
    recordVote: (_direction: "left" | "right") => {},
    advance: (_direction: "left" | "right" | null) => {},
    goToPrevious: () => {},
    undo: () => {},
    handleChoiceTap: (_direction: "left" | "right") => {},
    handleTimerComplete: () => {},
    undoCurrentQuestion: () => {},
  });

  actionsRef.current.recordVote = async (direction: "left" | "right") => {
    const currentQuestion = userQuestionsRef.current[displayIndexRef.current];

    if (!currentUser?.id || !currentQuestion) return;
    if (currentQuestion.hasVoted || currentQuestion.isOwnQuestion) return;

    const currentIndex = displayIndexRef.current;

    setUserQuestions((prev) => {
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

    if (!supabase) return;

    try {
      await createVote(supabase, currentQuestion.id, currentUser.id, direction);

      const updatedVoteCounts = await getVoteCounts(supabase, [currentQuestion.id]);
      const newCounts = updatedVoteCounts.get(currentQuestion.id) ?? { left: 0, right: 0 };

      setUserQuestions((prev) => {
        if (pendingUndoIdsRef.current.has(currentQuestion.id)) return prev;
        const isCurrentCardInVoteFlow =
          userQuestionsRef.current[displayIndexRef.current]?.id === currentQuestion.id &&
          (flowStateRef.current === "voting" ||
            flowStateRef.current === "revealing" ||
            flowStateRef.current === "voted");
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
      setUserQuestions((prev) => {
        const updated = [...prev];
        const q = updated[currentIndex];
        if (q && q.id === currentQuestion.id) {
          const votes = q.votes ?? { left: 0, right: 0 };
          updated[currentIndex] = {
            ...q,
            votes: { ...votes, [direction]: Math.max(0, votes[direction] - 1) },
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

    const currentQuestions = userQuestionsRef.current;
    const currentIndex = displayIndexRef.current;
    const nextIdx = currentIndex + 1 >= currentQuestions.length ? 0 : currentIndex + 1;

    voteAnimationTargetRef.current = null;

    contentOpacity.setValue(0);
    position.setValue({ x: 0, y: 0 });
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setVotedDirection(null);
    setIsTimerPaused(false);
    contentScale.setValue(0.97);
    setFlowState("transitioning");
    setDisplayIndex(nextIdx);
    setUndoneCardOverride(null);

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
    const currentQuestions = userQuestionsRef.current;
    const currentIndex = displayIndexRef.current;

    if (currentQuestions.length === 0) {
      position.setValue({ x: 0, y: 0 });
      return;
    }

    if (currentIndex === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      handleBackToList({ skipPositionReset: true });
      return;
    }

    const prevIdx = currentIndex - 1;
    const prevQuestion = currentQuestions[prevIdx];

    voteAnimationTargetRef.current = null;

    contentOpacity.setValue(0);
    position.setValue({ x: 0, y: 0 });
    leftBarWidth.setValue(0);
    rightBarWidth.setValue(0);
    setVotedDirection(null);
    setIsTimerPaused(false);
    contentScale.setValue(0.97);

    const prevDirection = prevQuestion?.userVote;
    if (prevQuestion && prevQuestion.hasVoted && prevDirection && currentUser?.id) {
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

      setUserQuestions((prev) => {
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

      if (supabase) {
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
          .catch(() => {
            pendingUndoIdsRef.current.delete(questionId);
            requestAnimationFrame(() => {
              setUndoneCardOverride((prev) =>
                prev?.questionId === questionId ? null : prev,
              );
            });
          });
      }
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
    const history = voteHistoryRef.current;

    if (history.length === 0 || !currentUser?.id) return;

    const lastVote = history[history.length - 1];
    const previousIndex = lastVote.questionIndex!;
    const questionId = lastVote.questionId;
    if (!questionId) return;

    const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(questionId);

    const prevQuestions = userQuestionsRef.current;
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

    setUserQuestions((prev) => {
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

    if (questionId && !wasVotedBeforeSession && supabase) {
      pendingUndoIdsRef.current.add(questionId);
      deleteVote(supabase, questionId, currentUser.id)
        .then(() => {
          refreshVoteCounts(questionId);
          pendingUndoIdsRef.current.delete(questionId);
        })
        .catch(() => {
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
    if (Date.now() - lastUndoTimeRef.current < 300) return;
    const currentState = flowStateRef.current;
    const currentQuestions = userQuestionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (currentState !== "viewing") return;
    if (!currentQuestion || currentQuestion.hasVoted || currentQuestion.isOwnQuestion) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const votes = currentQuestion.votes ?? { left: 0, right: 0 };
    const newVotes = {
      left: direction === "left" ? votes.left + 1 : votes.left,
      right: direction === "right" ? votes.right + 1 : votes.right,
    };
    const total = newVotes.left + newVotes.right;
    const targetPercentages = getNormalizedPercentages(newVotes.left, newVotes.right, total);

    voteAnimationTargetRef.current = {
      percentages: targetPercentages,
      votes: newVotes,
    };

    setFlowState("voting");
    setVotedDirection(direction);

    actionsRef.current.recordVote(direction);

    setFlowState("revealing");

    Animated.parallel([
      Animated.timing(leftBarWidth, {
        toValue: targetPercentages.left,
        duration: REVEAL_DURATION,
        useNativeDriver: false,
      }),
      Animated.timing(rightBarWidth, {
        toValue: targetPercentages.right,
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
    const currentQuestions = userQuestionsRef.current;
    const currentIndex = displayIndexRef.current;
    const currentQuestion = currentQuestions[currentIndex];

    if (!currentUser?.id || !currentQuestion) return;
    if (!currentQuestion.hasVoted || !currentQuestion.userVote) return;

    const questionId = currentQuestion.id;
    const direction = currentQuestion.userVote;

    initiallyVotedIdsRef.current.delete(questionId);

    voteAnimationTargetRef.current = null;

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

    setUserQuestions((prev) => {
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

    if (supabase) {
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
        .catch(() => {
          pendingUndoIdsRef.current.delete(questionId);
          requestAnimationFrame(() => {
            setUndoneCardOverride((prev) =>
              prev?.questionId === questionId ? null : prev,
            );
          });
        });
    }

    setIsTimerPaused(false);
    lastUndoTimeRef.current = Date.now();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleTimerComplete = useCallback(() => {
    actionsRef.current.handleTimerComplete();
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (evt, gesture) => {
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

          if (gesture.dx > SWIPE_THRESHOLD) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const isFirstCard = displayIndexRef.current === 0;
            Animated.parallel([
              Animated.timing(position, {
                toValue: { x: SCREEN_W, y: 0 },
                duration: 150,
                useNativeDriver: true,
              }),
              ...(isFirstCard ? [Animated.timing(contentOpacity, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              })] : []),
            ]).start(() => {
              actionsRef.current.goToPrevious();
            });
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
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
    [position, contentOpacity, handleBackToList],
  );

  useEffect(() => {
    if (viewMode !== "card" || !baseQuestion) return;
    if (flowState === "voting" || flowState === "revealing" || flowState === "voted") return;
    const wasVotedBefore = initiallyVotedIdsRef.current.has(baseQuestion.id);
    const isAlreadyVoted = wasVotedBefore || baseQuestion.isOwnQuestion;
    const viewingVotedQuestion = flowState === "viewing" && !!baseQuestion.hasVoted;
    if (!isAlreadyVoted && !viewingVotedQuestion) return;
    const votes = baseQuestion.votes ?? { left: 0, right: 0 };
    const total = votes.left + votes.right;
    const pct = getNormalizedPercentages(votes.left, votes.right, total);
    leftBarWidth.setValue(pct.left);
    rightBarWidth.setValue(pct.right);
  }, [viewMode, flowState, baseQuestion?.id, baseQuestion?.votes, baseQuestion?.hasVoted, baseQuestion?.isOwnQuestion, leftBarWidth, rightBarWidth]);

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

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "black",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Octicons
          name='alert'
          size={48}
          color='#ff6b6b'
          style={{ marginBottom: 16 }}
        />
        <Text
          style={{
            color: "#ff6b6b",
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 8,
          }}
        >
          {error}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
            backgroundColor: pressed ? "#333" : "#1c1c1c",
            marginTop: 16,
          })}
        >
          <Text style={{ color: "#fff", fontSize: 16 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (viewMode === "card") {
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
              style={{ padding: 8 }}
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
            <Text style={{ color: "#aaa", fontSize: 14, marginTop: 8, textAlign: "center" }}>
              Check back later!
            </Text>
          </View>
        </View>
      );
    }

    const wasVotedBeforeSession = initiallyVotedIdsRef.current.has(question.id);
    const isResultsMode = wasVotedBeforeSession || question.isOwnQuestion;

    const stateVotes = question?.votes ?? { left: 0, right: 0 };
    const stateTotal = stateVotes.left + stateVotes.right;
    const statePercentages = getNormalizedPercentages(
      stateVotes.left,
      stateVotes.right,
      stateTotal,
    );

    const isInVoteAnimation = (flowState === "revealing" || flowState === "voted") && voteAnimationTargetRef.current;
    const displayVotes = isInVoteAnimation ? voteAnimationTargetRef.current!.votes : stateVotes;
    const percentages = isInVoteAnimation ? voteAnimationTargetRef.current!.percentages : statePercentages;

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
            style={{ padding: 8 }}
          >
            <Octicons name="chevron-left" size={24} color="white" />
          </Pressable>
        </View>

        <Animated.View
          {...panResponder.panHandlers}
          onTouchStart={() => {
            const currentFlowState = flowStateRef.current;
            const currentQ = userQuestionsRef.current[displayIndexRef.current];
            const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
            if (currentFlowState === "voted" || currentFlowState === "revealing" || questionHasVote) {
              pressStartTimeRef.current = Date.now();
              setIsTimerPaused(true);
            }
          }}
          onTouchEnd={(e) => {
            const currentFlowState = flowStateRef.current;
            const currentQ = userQuestionsRef.current[displayIndexRef.current];
            const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
            const canInteract = currentFlowState === "voted" || currentFlowState === "revealing" || questionHasVote;

            if (canInteract) {
              setIsTimerPaused(false);
              const pressDuration = Date.now() - pressStartTimeRef.current;
              const touchX = e.nativeEvent.pageX;
              const touchY = e.nativeEvent.pageY;
              const layout = choicesLayoutRef.current;
              const isOnChoices = layout && touchY >= layout.y && touchY <= layout.y + layout.height;

              if (pressDuration < 300 && !isOnChoices) {
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
                  const currentFlowState = flowStateRef.current;
                  const currentQ = userQuestionsRef.current[displayIndexRef.current];
                  const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
                  const canUndo = currentFlowState === "voted" || currentFlowState === "revealing" ||
                    (currentFlowState === "viewing" && questionHasVote);
                  if (canUndo) {
                    actionsRef.current.undoCurrentQuestion();
                  } else if (currentFlowState === "viewing" && !questionHasVote) {
                    actionsRef.current.handleChoiceTap("left");
                  }
                }}
                onPressIn={() => {
                  const currentFlowState = flowStateRef.current;
                  const currentQ = userQuestionsRef.current[displayIndexRef.current];
                  const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
                  if (currentFlowState === "voted" || currentFlowState === "revealing" || questionHasVote) {
                    pressStartTimeRef.current = Date.now();
                    setIsTimerPaused(true);
                  }
                }}
                onPressOut={() => {
                  const currentFlowState = flowStateRef.current;
                  const currentQ = userQuestionsRef.current[displayIndexRef.current];
                  const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
                  if (currentFlowState === "voted" || currentFlowState === "revealing" || questionHasVote) {
                    setIsTimerPaused(false);
                  }
                }}
                disabled={!canTapChoices && !isVotedOrResultsView}
                showResults={showResults}
                percentage={showResults ? percentages.left : 0}
                votes={displayVotes.left}
                animatedWidth={leftBarWidth}
                friendVotes={question.friendVotes?.left?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
                isSelected={!hideChoiceHighlight && (votedDirection === "left" || question.userVote === "left")}
              />
              <FullScreenChoice
                choice={question.right}
                direction="right"
                onPress={() => {
                  const currentFlowState = flowStateRef.current;
                  const currentQ = userQuestionsRef.current[displayIndexRef.current];
                  const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
                  const canUndo = currentFlowState === "voted" || currentFlowState === "revealing" ||
                    (currentFlowState === "viewing" && questionHasVote);
                  if (canUndo) {
                    actionsRef.current.undoCurrentQuestion();
                  } else if (currentFlowState === "viewing" && !questionHasVote) {
                    actionsRef.current.handleChoiceTap("right");
                  }
                }}
                onPressIn={() => {
                  const currentFlowState = flowStateRef.current;
                  const currentQ = userQuestionsRef.current[displayIndexRef.current];
                  const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
                  if (currentFlowState === "voted" || currentFlowState === "revealing" || questionHasVote) {
                    pressStartTimeRef.current = Date.now();
                    setIsTimerPaused(true);
                  }
                }}
                onPressOut={() => {
                  const currentFlowState = flowStateRef.current;
                  const currentQ = userQuestionsRef.current[displayIndexRef.current];
                  const questionHasVote = currentQ?.hasVoted && currentQ?.userVote;
                  if (currentFlowState === "voted" || currentFlowState === "revealing" || questionHasVote) {
                    setIsTimerPaused(false);
                  }
                }}
                disabled={!canTapChoices && !isVotedOrResultsView}
                showResults={showResults}
                percentage={showResults ? percentages.right : 0}
                votes={displayVotes.right}
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

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {profileView === "followers" || profileView === "following" ? (
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
            <Octicons name='chevron-left' size={20} color='#aaa' />
          </Pressable>
          <Text
            style={{ color: "white", fontSize: 20, fontWeight: "700", flex: 1 }}
          >
            People
          </Text>
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
            <Octicons name='chevron-left' size={20} color='#aaa' />
          </Pressable>
          <Text
            style={{ color: "white", fontSize: 20, fontWeight: "700", flex: 1 }}
          >
            {user.username}
          </Text>
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
          <View style={{ paddingTop: 108 }}>
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
              {(() => {
                const currentTab =
                  profileView === "followers" ? "followers" : "following";
                const allUsers =
                  currentTab === "followers" ? followers : following;

                const filteredUsers = allUsers.filter((u) => {
                  if (!followersFollowingSearch.trim()) return true;
                  const searchLower = followersFollowingSearch.toLowerCase();
                  const fullName =
                    u.firstName && u.lastName
                      ? `${u.firstName} ${u.lastName}`.toLowerCase()
                      : (u.firstName || u.username || "").toLowerCase();
                  const username = u.username.toLowerCase();
                  return (
                    fullName.includes(searchLower) ||
                    username.includes(searchLower)
                  );
                });

                return filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => <UserListItem key={u.id} user={u} />)
                ) : (
                  <View style={{ alignItems: "center", padding: 32 }}>
                    <Octicons
                      name='search'
                      size={48}
                      color='#666'
                      style={{ marginBottom: 16 }}
                    />
                    <Text style={{ color: "#666", fontSize: 16 }}>
                      No{" "}
                      {currentTab === "followers" ? "followers" : "following"}{" "}
                      found
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
          keyboardShouldPersistTaps='always'
        >
          <UserProfileHeader
            user={user}
            stats={userStats}
            onFollowersPress={() => {
              setProfileView("followers");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onFollowingPress={() => {
              setProfileView("following");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            isFollowing={isFollowing}
            onFollowPress={handleFollowPress}
            isOwnProfile={currentUser?.id === profileUser?.id}
          />

          <View style={{ paddingHorizontal: 24 }}>
            {userQuestions.length > 0 ? (
              userQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  onPress={() => handleQuestionPress(q)}
                />
              ))
            ) : (
              <View style={{ alignItems: "center", padding: 32 }}>
                <Octicons
                  name='question'
                  size={48}
                  color='#666'
                  style={{ marginBottom: 16 }}
                />
                <Text style={{ color: "#666", fontSize: 16 }}>
                  No questions yet
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
