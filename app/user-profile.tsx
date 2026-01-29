import { QuestionCard } from "@/components/questions";
import { UserListItem, UserProfileHeader } from "@/components/users";
import { ChoiceOption } from "@/components/voting";
import {
    useRealtimeFollows,
    useRealtimeUserQuestionVotes,
} from "@/lib/hooks/useRealtime";
import {
    checkFollowStatus,
    followUser,
    getFollowersWithProfiles,
    getFollowingWithProfiles,
    getUserStats,
    unfollowUser,
} from "@/lib/queries/follows";
import { getProfile, getProfileByUsername } from "@/lib/queries/profiles";
import { Question as DbQuestion, getQuestions } from "@/lib/queries/questions";
import {
    getTotalVotesOnUserQuestions,
    getUserVotes,
    getUserVotesCastCount,
    getVoteCounts,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { Question, User } from "@/types";
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

// Helper to convert DB question to display Question type
function mapDbQuestionToQuestion(
  dbQuestion: DbQuestion,
  voteCounts: Map<string, { left: number; right: number }>,
  userVotes: Map<string, "left" | "right">,
  currentUserId: string | undefined,
  creatorUsername: string | undefined,
): Question {
  const votes = voteCounts.get(dbQuestion.id) || { left: 0, right: 0 };
  const userVote = userVotes.get(dbQuestion.id);

  return {
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
    votes,
    meta: {
      category: dbQuestion.category || undefined,
      createdBy: dbQuestion.is_anonymous ? "Anonymous" : creatorUsername,
    },
    createdAt: dbQuestion.created_at,
    hasVoted: !!userVote,
    userVote,
    isOwnQuestion: currentUserId === dbQuestion.user_id,
  };
}

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const ANIMATION_DURATION = 200;
const TAB_ANIMATION_DURATION = 250;

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string; userId?: string }>();
  const { session } = useSession();
  const { user: currentUser } = useUser();

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile data
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
  const [cardDisplayIndex, setCardDisplayIndex] = useState(0);
  const [cardOpacity, setCardOpacity] = useState(1);
  const [profileView, setProfileView] = useState<
    "profile" | "followers" | "following"
  >("profile");
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const isPerformingFollowActionRef = useRef(false);
  const [followersFollowingSearch, setFollowersFollowingSearch] = useState("");
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(
    null,
  );
  const [voteHistory, setVoteHistory] = useState<
    { questionIndex: number; direction: "left" | "right" }[]
  >([]);

  // Supabase client for real-time
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

  const cardPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardEntryScale = useRef(new Animated.Value(1)).current;

  // Fetch profile data
  useEffect(() => {
    async function fetchProfileData() {
      if (!session) return;

      setIsLoading(true);
      setError(null);

      try {
        const supabase = createClerkSupabaseClient(session);

        // Determine the target user ID
        let targetUserId = params.userId;
        let targetProfile = null;

        // If we have a username but no userId, look up by username
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

        // Fetch user stats (questions count, followers count, following count)
        const stats = await getUserStats(supabase, targetUserId);

        // Fetch votes cast by this user
        const votesCast = await getUserVotesCastCount(supabase, targetUserId);

        // Fetch total engagement (votes received on their questions)
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

        // Set the profile user
        setProfileUser({
          id: targetUserId,
          username:
            targetProfile.username || targetProfile.first_name || "User",
          firstName: targetProfile.first_name || undefined,
          lastName: targetProfile.last_name || undefined,
          avatarUrl: targetProfile.avatar_url || undefined,
        });

        // Check if current user is following this user
        if (currentUser?.id && currentUser.id !== targetUserId) {
          const followStatus = await checkFollowStatus(
            supabase,
            currentUser.id,
            targetUserId,
          );
          setIsFollowing(followStatus);
        }

        // Fetch user's questions
        const dbQuestions = await getQuestions(supabase, {
          userId: targetUserId,
          limit: 50,
        });

        if (dbQuestions.length > 0) {
          const questionIds = dbQuestions.map((q) => q.id);
          const voteCounts = await getVoteCounts(supabase, questionIds);
          const userVotes = currentUser?.id
            ? await getUserVotes(supabase, currentUser.id, questionIds)
            : new Map();

          const displayQuestions = dbQuestions.map((q) =>
            mapDbQuestionToQuestion(
              q,
              voteCounts,
              userVotes,
              currentUser?.id,
              targetProfile?.username || undefined,
            ),
          );
          setUserQuestions(displayQuestions);
        } else {
          setUserQuestions([]);
        }

        // Fetch followers and following with profiles
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
        console.error("Error fetching profile data:", err);
        setError("Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfileData();
  }, [session, params.username, params.userId, currentUser?.id]);

  // Handle follow/unfollow
  const handleFollowPress = useCallback(async () => {
    if (!session || !currentUser?.id || !profileUser?.id) return;
    if (currentUser.id === profileUser.id) return; // Can't follow yourself

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
      console.error("Error toggling follow:", err);
    } finally {
      setIsFollowLoading(false);
      setTimeout(() => {
        isPerformingFollowActionRef.current = false;
      }, 1000);
    }
  }, [session, currentUser, profileUser?.id, isFollowing]);

  // Get question IDs for real-time subscription
  const profileQuestionIds = useMemo(
    () => userQuestions.map((q) => q.id),
    [userQuestions],
  );

  // Real-time: votes on this user's questions (updates engagement count and vote counts)
  const handleVoteReceived = useCallback(
    async (questionId: string, payload: any) => {
      if (!supabase) return;

      // Update the vote count for this question
      const counts = await getVoteCounts(supabase, [questionId]);
      const newCounts = counts.get(questionId);

      if (newCounts) {
        setUserQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId ? { ...q, votes: newCounts } : q,
          ),
        );
      }

      // Update engagement stat
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
    [supabase],
  );

  useRealtimeUserQuestionVotes(
    supabase,
    profileQuestionIds,
    handleVoteReceived,
  );

  // Real-time: follows for this user (updates follower/following counts)
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
    // Fallback while loading
    return {
      id: params.userId || "loading",
      username: params.username || "Loading...",
      firstName: undefined,
      lastName: undefined,
      avatarUrl: undefined,
    };
  }, [profileUser, params.username, params.userId]);

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
      setVoteHistory((prev) => [
        ...prev,
        { questionIndex: cardDisplayIndex, direction },
      ]);
    },
    [cardDisplayIndex],
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

      const nextIdx =
        cardDisplayIndex + 1 >= userQuestions.length ? 0 : cardDisplayIndex + 1;

      setSwipeProgress(0);
      setSwipeDirection(null);
      setCardOpacity(0);
      setCardDisplayIndex(nextIdx);
    },
    [userQuestions.length, recordVote, cardDisplayIndex],
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
            [lastVote.direction]: Math.max(
              0,
              currentVotes[lastVote.direction] - 1,
            ),
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
      const x =
        direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
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
    [cardPosition, advance],
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
    [resetCard, forceSwipe, cardPosition],
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

  // Loading state
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

  // Error state
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
    const question = userQuestions[cardDisplayIndex] ?? null;

    if (!question) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "black",
            padding: 24,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "white" }}>No question found</Text>
        </View>
      );
    }

    // Check if this question should be in results mode (already voted or own question)
    const isResultsMode = question.hasVoted || question.isOwnQuestion;

    const currentVotes = question.votes ?? { left: 0, right: 0 };
    const currentTotal = currentVotes.left + currentVotes.right;

    const previewVotes = {
      left:
        swipeDirection === "left" ? currentVotes.left + 1 : currentVotes.left,
      right:
        swipeDirection === "right"
          ? currentVotes.right + 1
          : currentVotes.right,
    };

    const totalPreviewVotes = previewVotes.left + previewVotes.right;

    let leftPercentage: number;
    let rightPercentage: number;

    if (isResultsMode) {
      const percentages = getNormalizedPercentages(
        currentVotes.left,
        currentVotes.right,
        currentTotal,
      );
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    } else if (swipeProgress > 0 && swipeDirection === "left") {
      const percentages = getNormalizedPercentages(
        previewVotes.left,
        previewVotes.right,
        totalPreviewVotes,
      );
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    } else if (swipeProgress > 0 && swipeDirection === "right") {
      const percentages = getNormalizedPercentages(
        previewVotes.left,
        previewVotes.right,
        totalPreviewVotes,
      );
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    } else {
      const percentages = getNormalizedPercentages(
        currentVotes.left,
        currentVotes.right,
        currentTotal,
      );
      leftPercentage = percentages.left;
      rightPercentage = percentages.right;
    }

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

    const leftHighlight = isResultsMode
      ? 0
      : swipeDirection === "left"
        ? swipeProgress
        : 0;
    const rightHighlight = isResultsMode
      ? 0
      : swipeDirection === "right"
        ? swipeProgress
        : 0;

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
              <Octicons name='arrow-left' size={24} color='#aaa' />
              <Text
                style={{
                  color: "#aaa",
                  fontSize: 12,
                  marginTop: 4,
                  fontWeight: "500",
                }}
              >
                Back
              </Text>
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
                <Octicons name='undo' size={24} color='#aaa' />
                <Text
                  style={{
                    color: "#aaa",
                    fontSize: 12,
                    marginTop: 4,
                    fontWeight: "500",
                  }}
                >
                  Undo
                </Text>
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
              <Octicons name='arrow-right' size={24} color='#aaa' />
              <Text
                style={{
                  color: "#aaa",
                  fontSize: 12,
                  marginTop: 4,
                  fontWeight: "500",
                }}
              >
                Skip
              </Text>
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
              {
                transform: [...cardStyle.transform, { scale: cardEntryScale }],
              },
            ]}
          >
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#222",
              }}
            >
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta?.category ?? "General"}
                {question.meta?.createdBy
                  ? ` • ${question.meta.createdBy}`
                  : ""}
              </Text>
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
                isSelected={swipeDirection === "left"}
                highlight={leftHighlight}
                resultsMode={isResultsMode}
              />

              <ChoiceOption
                choice={question.right}
                direction='right'
                percentage={rightPercentage}
                votes={rightVotes}
                swipeProgress={isResultsMode ? 0 : swipeProgress}
                swipeDirection={isResultsMode ? null : swipeDirection}
                isSelected={swipeDirection === "right"}
                highlight={rightHighlight}
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
              userQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  onPress={() => handleQuestionPress(question)}
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
