import { AutocompleteInput } from "@/components/forms";
import { MyQuestionCard, VoteHistoryItemCard } from "@/components/profile";
import { ProfileHeader, UserListItem } from "@/components/users";
import { FullScreenChoice } from "@/components/voting";
import { SUGGESTED_CATEGORIES } from "@/constants/categories";
import { useProfileTabReset } from "@/contexts/profile-tab-context";
import {
    useRealtimeFollows,
    useRealtimeUserQuestions,
    useRealtimeUserQuestionVotes,
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
import { ensureProfile, getProfile } from "@/lib/queries/profiles";
import {
    Question as DbQuestion,
    deleteQuestion,
    getQuestion,
    getQuestions,
    updateQuestion,
} from "@/lib/queries/questions";
import {
    deleteVote,
    FriendVote,
    getFriendVotesForQuestions,
    getQuestionVoters,
    getTotalVotesOnUserQuestions,
    getUserVotesCastCount,
    getUserVotingHistory,
    getVoteCounts,
    VoterProfile,
} from "@/lib/queries/votes";
import { createClerkSupabaseClient } from "@/lib/supabase";
import type { ImageInfo, Question, User, VoteHistoryItem } from "@/types";
import { mapDbQuestionToQuestion, mapVoteHistoryItem } from "@/utils/questions";
import { getNormalizedPercentages } from "@/utils/voting";
import { useAuth, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Image,
    KeyboardAvoidingView,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;
const ANIMATION_DURATION = 200;
const TAB_ANIMATION_DURATION = 250;

export default function ProfileScreen() {
  const { signOut, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    registerResetCallback,
    unregisterResetCallback,
    registerRefreshCallback,
    unregisterRefreshCallback,
  } = useProfileTabReset();

  const getTokenRef = useRef(getToken);
  const clerkUserRef = useRef(clerkUser);
  const supabaseRef = useRef<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);

  getTokenRef.current = getToken;
  clerkUserRef.current = clerkUser;

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClerkSupabaseClient({
        getToken: getTokenRef.current,
      });
    }
    return supabaseRef.current;
  }, []);

  const [supabase, setSupabase] = useState<ReturnType<
    typeof createClerkSupabaseClient
  > | null>(null);

  useEffect(() => {
    if (clerkUser && !supabase) {
      setSupabase(getSupabase());
    }
  }, [clerkUser, supabase, getSupabase]);

  const [isLoading, setIsLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    questionsCreated: 0,
    totalVotesCast: 0,
    totalEngagement: 0,
    followers: 0,
    following: 0,
  });
  const [followers, setFollowers] = useState<User[]>([]);
  const [following, setFollowing] = useState<User[]>([]);
  const [voteHistory, setVoteHistory] = useState<VoteHistoryItem[]>([]);
  const [votedQuestions, setVotedQuestions] = useState<Question[]>([]);

  const [activeTab, setActiveTab] = useState<"questions" | "history">(
    "questions",
  );
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editLeftChoice, setEditLeftChoice] = useState("");
  const [editRightChoice, setEditRightChoice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [editPromptImage, setEditPromptImage] = useState<ImageInfo | null>(
    null,
  );
  const [editLeftImage, setEditLeftImage] = useState<ImageInfo | null>(null);
  const [editRightImage, setEditRightImage] = useState<ImageInfo | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [cardDisplayIndex, setCardDisplayIndex] = useState(0);
  const [profileView, setProfileView] = useState<
    "profile" | "followers" | "following"
  >("profile");
  const [followersFollowingSearch, setFollowersFollowingSearch] = useState("");

  const [votersSheetVisible, setVotersSheetVisible] = useState(false);
  const [votersSheetChoiceLabel, setVotersSheetChoiceLabel] = useState("");
  const [voters, setVoters] = useState<VoterProfile[]>([]);
  const [votersLoading, setVotersLoading] = useState(false);
  const [voterFollowStatus, setVoterFollowStatus] = useState<Map<string, boolean>>(new Map());
  const [followingInProgress, setFollowingInProgress] = useState<Set<string>>(new Set());
  const votersSheetTranslateY = useRef(new Animated.Value(1000)).current;

  const votersSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          votersSheetTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(votersSheetTranslateY, {
            toValue: 1000,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            setVotersSheetVisible(false);
            setVoters([]);
            setVoterFollowStatus(new Map());
          });
        } else {
          Animated.spring(votersSheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const cardPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardEntryScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardDisplayIndexRef = useRef(cardDisplayIndex);
  cardDisplayIndexRef.current = cardDisplayIndex;
  const leftBarWidth = useRef(new Animated.Value(0)).current;
  const rightBarWidth = useRef(new Animated.Value(0)).current;

  const screenWidth = Dimensions.get("window").width;
  const tabIndicatorPosition = useRef(
    new Animated.Value(activeTab === "questions" ? 0 : 1),
  ).current;
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

  useEffect(() => {
    Animated.timing(tabIndicatorPosition, {
      toValue: activeTab === "questions" ? 0 : 1,
      useNativeDriver: false,
      duration: TAB_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [activeTab, tabIndicatorPosition]);

  const fetchProfileData = useCallback(
    async (showLoading = true) => {
      const currentUser = clerkUserRef.current;
      if (!currentUser?.id) return;

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const supabase = getSupabase();

        await ensureProfile(supabase, {
          user_id: currentUser.id,
          username: currentUser.username || undefined,
          first_name: currentUser.firstName || undefined,
          last_name: currentUser.lastName || undefined,
          avatar_url: currentUser.imageUrl || undefined,
        });

        const stats = await getUserStats(supabase, currentUser.id);
        const votesCast = await getUserVotesCastCount(supabase, currentUser.id);
        const totalEngagement = await getTotalVotesOnUserQuestions(
          supabase,
          currentUser.id,
        );

        setUserStats({
          questionsCreated: stats.questions_count,
          totalVotesCast: votesCast,
          totalEngagement,
          followers: stats.followers_count,
          following: stats.following_count,
        });

        const dbQuestions = await getQuestions(supabase, {
          userId: currentUser.id,
          limit: 50,
        });

        if (dbQuestions.length > 0) {
          const questionIds = dbQuestions.map((q) => q.id);
          const voteCounts = await getVoteCounts(supabase, questionIds);

          const displayQuestions = dbQuestions.map((q) => {
            const votes = voteCounts.get(q.id) || { left: 0, right: 0 };
            return mapDbQuestionToQuestion(
              q,
              votes,
              q.is_anonymous,
              q.is_anonymous ? "Anonymous" : "You",
              undefined,
              currentUser.id,
            );
          });
          setMyQuestions(displayQuestions);
        } else {
          setMyQuestions([]);
        }

        const votingHistory = await getUserVotingHistory(
          supabase,
          currentUser.id,
          { limit: 50 },
        );
        setVoteHistory(votingHistory.map(mapVoteHistoryItem));

        const creatorIds = [
          ...new Set(
            votingHistory
              .filter((v) => v.question && !v.question.is_anonymous)
              .map((v) => v.question.user_id),
          ),
        ];
        const creatorProfiles = await Promise.all(
          creatorIds.map((id) => getProfile(supabase, id).catch(() => null)),
        );
        const creatorProfileMap = new Map<string, string | null>();
        creatorIds.forEach((id, i) => {
          const profile = creatorProfiles[i];
          let displayName: string | null = null;
          if (profile?.username) {
            displayName = profile.username.toLowerCase();
          } else if (profile?.first_name) {
            displayName = profile.first_name.toLowerCase();
          }
          creatorProfileMap.set(id, displayName);
        });

        const votedQuestionsFromHistory: Question[] = votingHistory
          .filter((v) => v.question)
          .map((v) => {
            let createdBy: string | undefined;
            if (v.question.is_anonymous) {
              createdBy = "Anonymous";
            } else {
              createdBy =
                creatorProfileMap.get(v.question.user_id) || undefined;
            }
            return {
              id: v.question_id,
              visibleUserId: v.question.is_anonymous
                ? undefined
                : v.question.user_id,
              title: v.question.title,
              prompt: v.question.prompt,
              promptImageUrl: v.question.prompt_image_url || undefined,
              left: {
                id: "left" as const,
                label: v.question.left_choice_label,
                imageUrl: v.question.left_choice_image_url || undefined,
              },
              right: {
                id: "right" as const,
                label: v.question.right_choice_label,
                imageUrl: v.question.right_choice_image_url || undefined,
              },
              votes: { left: 0, right: 0 },
              meta: {
                category: v.question.category || undefined,
                createdBy,
              },
              createdAt: v.created_at,
              hasVoted: true,
              userVote: v.choice,
            };
          });

        if (votedQuestionsFromHistory.length > 0) {
          const votedQuestionIds = votedQuestionsFromHistory.map((q) => q.id);
          const followingIds = await getFollowing(supabase, currentUser.id);

          const [votedVoteCounts, friendVotesMap] = await Promise.all([
            getVoteCounts(supabase, votedQuestionIds),
            followingIds.length > 0
              ? getFriendVotesForQuestions(supabase, votedQuestionIds, followingIds)
              : Promise.resolve(new Map()),
          ]);

          votedQuestionsFromHistory.forEach((q) => {
            const counts = votedVoteCounts.get(q.id);
            if (counts) {
              q.votes = counts;
            }
            const friendVotes = friendVotesMap.get(q.id);
            if (friendVotes) {
              q.friendVotes = {
                left: friendVotes.left.map((f: FriendVote) => ({ userId: f.userId, avatarUrl: f.avatarUrl })),
                right: friendVotes.right.map((f: FriendVote) => ({ userId: f.userId, avatarUrl: f.avatarUrl })),
              };
            }
          });
        }
        setVotedQuestions(votedQuestionsFromHistory);

        const [followersData, followingData] = await Promise.all([
          getFollowersWithProfiles(supabase, currentUser.id),
          getFollowingWithProfiles(supabase, currentUser.id),
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
      } catch {
        // TODO: show user-facing error
      } finally {
        setIsLoading(false);
      }
    },
    [getSupabase],
  );

  useEffect(() => {
    if (clerkUser?.id) {
      fetchProfileData(true);
    }
  }, [clerkUser?.id, fetchProfileData]);

  const myQuestionIds = useMemo(
    () => myQuestions.map((q) => q.id),
    [myQuestions],
  );

  const handleVoteReceived = useCallback(
    async (questionId: string, payload: { eventType: string }) => {
      const sb = getSupabase();
      const counts = await getVoteCounts(sb, [questionId]);
      const newCounts = counts.get(questionId);

      if (newCounts) {
        setMyQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId ? { ...q, votes: newCounts } : q,
          ),
        );
      }

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
    [getSupabase],
  );

  useRealtimeUserQuestionVotes(supabase, myQuestionIds, handleVoteReceived);

  const handleQuestionCreated = useCallback(
    async (questionData: DbQuestion) => {
      const sb = getSupabase();
      const counts = await getVoteCounts(sb, [questionData.id]);

      const newQuestion: Question = {
        id: questionData.id,
        visibleUserId: questionData.is_anonymous
          ? undefined
          : questionData.user_id,
        title: questionData.title,
        prompt: questionData.prompt,
        promptImageUrl: questionData.prompt_image_url || undefined,
        left: {
          id: "left",
          label: questionData.left_choice_label,
          imageUrl: questionData.left_choice_image_url || undefined,
        },
        right: {
          id: "right",
          label: questionData.right_choice_label,
          imageUrl: questionData.right_choice_image_url || undefined,
        },
        votes: counts.get(questionData.id) || { left: 0, right: 0 },
        meta: {
          category: questionData.category || undefined,
          createdBy: questionData.is_anonymous ? "Anonymous" : "You",
        },
        createdAt: questionData.created_at,
        isOwnQuestion: true,
      };

      setMyQuestions((prev) => [newQuestion, ...prev]);
      setUserStats((prev) => ({
        ...prev,
        questionsCreated: prev.questionsCreated + 1,
      }));
    },
    [getSupabase],
  );

  const handleQuestionDeleted = useCallback((questionId: string) => {
    setMyQuestions((prev) => prev.filter((q) => q.id !== questionId));
    setUserStats((prev) => ({
      ...prev,
      questionsCreated: Math.max(0, prev.questionsCreated - 1),
    }));
  }, []);

  useRealtimeUserQuestions(
    supabase,
    clerkUser?.id || null,
    handleQuestionCreated,
    handleQuestionDeleted,
  );

  const handleVoteCast = useCallback(
    async (voteData: { question_id: string; choice: "left" | "right"; created_at: string }) => {
      const sb = getSupabase();
      const question = await getQuestion(sb, voteData.question_id);
      if (!question) return;

      const counts = await getVoteCounts(sb, [question.id]);
      const voteCounts = counts.get(question.id) || { left: 0, right: 0 };

      const newHistoryItem: VoteHistoryItem = {
        questionId: voteData.question_id,
        questionTitle: question.title,
        direction: voteData.choice,
        votedAt: voteData.created_at,
      };

      setVoteHistory((prev) => [newHistoryItem, ...prev]);

      const newVotedQuestion: Question = {
        id: question.id,
        visibleUserId: question.is_anonymous ? undefined : question.user_id,
        title: question.title,
        prompt: question.prompt,
        promptImageUrl: question.prompt_image_url || undefined,
        left: {
          id: "left",
          label: question.left_choice_label,
          imageUrl: question.left_choice_image_url || undefined,
        },
        right: {
          id: "right",
          label: question.right_choice_label,
          imageUrl: question.right_choice_image_url || undefined,
        },
        votes: voteCounts,
        meta: {
          category: question.category || undefined,
          createdBy: question.is_anonymous ? "Anonymous" : undefined,
        },
        createdAt: voteData.created_at,
        hasVoted: true,
        userVote: voteData.choice,
      };

      setVotedQuestions((prev) => [newVotedQuestion, ...prev]);

      setUserStats((prev) => ({
        ...prev,
        totalVotesCast: prev.totalVotesCast + 1,
      }));
    },
    [getSupabase],
  );

  const handleVoteRemoved = useCallback((voteData: { question_id: string }) => {
    setVoteHistory((prev) =>
      prev.filter((v) => v.questionId !== voteData.question_id),
    );

    setVotedQuestions((prev) =>
      prev.filter((q) => q.id !== voteData.question_id),
    );

    setUserStats((prev) => ({
      ...prev,
      totalVotesCast: Math.max(0, prev.totalVotesCast - 1),
    }));
  }, []);

  useRealtimeUserVotes(
    supabase,
    clerkUser?.id || null,
    handleVoteCast,
    handleVoteRemoved,
  );

  const handleFollowerChange = useCallback(
    async (isNewFollower: boolean) => {
      setUserStats((prev) => ({
        ...prev,
        followers: isNewFollower
          ? prev.followers + 1
          : Math.max(0, prev.followers - 1),
      }));

      const currentUserId = clerkUserRef.current?.id;
      if (currentUserId) {
        const sb = getSupabase();
        const followersData = await getFollowersWithProfiles(sb, currentUserId);
        setFollowers(
          followersData.map((f) => ({
            id: f.id,
            username: f.username || f.firstName || "User",
            firstName: f.firstName || undefined,
            lastName: f.lastName || undefined,
            avatarUrl: f.avatarUrl || undefined,
          })),
        );
      }
    },
    [getSupabase],
  );

  const handleFollowingChange = useCallback(
    async (isNewFollowing: boolean) => {
      setUserStats((prev) => ({
        ...prev,
        following: isNewFollowing
          ? prev.following + 1
          : Math.max(0, prev.following - 1),
      }));
      const currentUserId = clerkUserRef.current?.id;
      if (currentUserId) {
        const sb = getSupabase();
        const followingData = await getFollowingWithProfiles(sb, currentUserId);
        setFollowing(
          followingData.map((f) => ({
            id: f.id,
            username: f.username || f.firstName || "User",
            firstName: f.firstName || undefined,
            lastName: f.lastName || undefined,
            avatarUrl: f.avatarUrl || undefined,
          })),
        );
      }
    },
    [getSupabase],
  );

  useRealtimeFollows(
    supabase,
    clerkUser?.id || null,
    handleFollowerChange,
    handleFollowingChange,
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
          } catch {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
      },
    ]);
  };

  const handleEditProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pickImage = async (setImage: (image: ImageInfo | null) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImage({
        uri: result.assets[0].uri,
        width: result.assets[0].width,
        height: result.assets[0].height,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const clearEditState = useCallback(() => {
    setEditingQuestion(null);
    setEditTitle("");
    setEditPrompt("");
    setEditLeftChoice("");
    setEditRightChoice("");
    setEditCategory("");
    setEditPromptImage(null);
    setEditLeftImage(null);
    setEditRightImage(null);
  }, []);

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setEditTitle(question.title);
    setEditPrompt(question.prompt);
    setEditLeftChoice(question.left.label);
    setEditRightChoice(question.right.label);
    setEditCategory(question.meta?.category || "");
    setEditPromptImage(
      question.promptImageUrl ? { uri: question.promptImageUrl } : null,
    );
    setEditLeftImage(
      question.left.imageUrl ? { uri: question.left.imageUrl } : null,
    );
    setEditRightImage(
      question.right.imageUrl ? { uri: question.right.imageUrl } : null,
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = async () => {
    if (
      !editingQuestion ||
      !editTitle.trim() ||
      !editPrompt.trim() ||
      !editLeftChoice.trim() ||
      !editRightChoice.trim()
    ) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const updatedData = {
      title: editTitle.trim(),
      prompt: editPrompt.trim(),
      category: editCategory.trim() || null,
      prompt_image_url: editPromptImage?.uri || null,
      left_choice_label: editLeftChoice.trim(),
      left_choice_image_url: editLeftImage?.uri || null,
      right_choice_label: editRightChoice.trim(),
      right_choice_image_url: editRightImage?.uri || null,
    };

    setMyQuestions((prev) =>
      prev.map((q) =>
        q.id === editingQuestion.id
          ? {
              ...q,
              title: updatedData.title,
              prompt: updatedData.prompt,
              promptImageUrl: updatedData.prompt_image_url || undefined,
              left: {
                ...q.left,
                label: updatedData.left_choice_label,
                imageUrl: updatedData.left_choice_image_url || undefined,
              },
              right: {
                ...q.right,
                label: updatedData.right_choice_label,
                imageUrl: updatedData.right_choice_image_url || undefined,
              },
              meta: {
                ...q.meta,
                category: updatedData.category || undefined,
              },
            }
          : q,
      ),
    );

    const questionId = editingQuestion.id;
    clearEditState();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const sb = getSupabase();
      await updateQuestion(sb, questionId, updatedData);
    } catch {
      fetchProfileData(false);
    }
  };

  const handleCancelEdit = clearEditState;

  const handleDeleteQuestion = (questionId: string) => {
    Alert.alert(
      "Delete Question",
      "Are you sure you want to delete this question?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setMyQuestions((prev) => prev.filter((q) => q.id !== questionId));
            setUserStats((prev) => ({
              ...prev,
              questionsCreated: Math.max(0, prev.questionsCreated - 1),
            }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            try {
              const sb = getSupabase();
              await deleteQuestion(sb, questionId);
            } catch {
              fetchProfileData(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteVote = (questionId: string) => {
    Alert.alert(
      "Delete Vote",
      "Are you sure you want to remove your vote from this question?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setVoteHistory((prev) =>
              prev.filter((v) => v.questionId !== questionId),
            );
            setVotedQuestions((prev) =>
              prev.filter((q) => q.id !== questionId),
            );
            setUserStats((prev) => ({
              ...prev,
              totalVotesCast: Math.max(0, prev.totalVotesCast - 1),
            }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            try {
              const sb = getSupabase();
              const currentUser = clerkUserRef.current;
              if (currentUser?.id) {
                await deleteVote(sb, questionId, currentUser.id);
              }
            } catch {
              fetchProfileData(false);
            }
          },
        },
      ],
    );
  };

  const handleQuestionPress = (question: Question) => {
    const foundIndex = myQuestions.findIndex((q) => q.id === question.id);
    if (foundIndex >= 0) {
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const openVotersSheet = useCallback(async (
    questionId: string,
    choice: "left" | "right",
    choiceLabel: string
  ) => {
    if (!clerkUser?.id) return;

    setVotersSheetChoiceLabel(choiceLabel);
    setVotersLoading(true);
    setVotersSheetVisible(true);

    Animated.spring(votersSheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    try {
      const supabase = getSupabase();
      const votersList = await getQuestionVoters(supabase, questionId, choice);
      setVoters(votersList);

      const statusMap = new Map<string, boolean>();
      await Promise.all(
        votersList.map(async (voter) => {
          if (voter.userId !== clerkUser.id) {
            const isFollowing = await checkFollowStatus(supabase, clerkUser.id, voter.userId);
            statusMap.set(voter.userId, isFollowing);
          }
        })
      );
      setVoterFollowStatus(statusMap);
    } catch {
      // TODO: show user-facing error
    } finally {
      setVotersLoading(false);
    }
  }, [clerkUser?.id, getSupabase, votersSheetTranslateY]);

  const closeVotersSheet = useCallback(() => {
    Animated.timing(votersSheetTranslateY, {
      toValue: 1000,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVotersSheetVisible(false);
      setVoters([]);
      setVoterFollowStatus(new Map());
    });
  }, [votersSheetTranslateY]);

  const toggleFollowVoter = useCallback(async (voterId: string) => {
    if (!clerkUser?.id || followingInProgress.has(voterId)) return;

    setFollowingInProgress((prev) => new Set(prev).add(voterId));

    try {
      const supabase = getSupabase();
      const isCurrentlyFollowing = voterFollowStatus.get(voterId) || false;

      if (isCurrentlyFollowing) {
        await unfollowUser(supabase, clerkUser.id, voterId);
      } else {
        await followUser(supabase, clerkUser.id, voterId);
      }

      setVoterFollowStatus((prev) => {
        const newMap = new Map(prev);
        newMap.set(voterId, !isCurrentlyFollowing);
        return newMap;
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // TODO: show user-facing error
    } finally {
      setFollowingInProgress((prev) => {
        const newSet = new Set(prev);
        newSet.delete(voterId);
        return newSet;
      });
    }
  }, [clerkUser?.id, getSupabase, voterFollowStatus, followingInProgress]);

  const handleBackToList = useCallback((options?: { skipPositionReset?: boolean }) => {
    const skipPositionReset = options?.skipPositionReset ?? false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode("list");
    setProfileView("profile");
    profileViewOpacity.setValue(1);
    profileViewTranslateY.setValue(0);
    followersFollowingOpacity.setValue(0);
    if (!skipPositionReset) {
      cardPosition.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
    }
  }, [cardPosition, cardOpacity, profileViewOpacity, profileViewTranslateY, followersFollowingOpacity]);

  const resetToRoot = useCallback(() => {
    if (profileView !== "profile") {
      setProfileView("profile");
      return true;
    }
    if (viewMode === "card") {
      handleBackToList();
      return true;
    }
    if (editingQuestion) {
      clearEditState();
      return true;
    }
    return false;
  }, [
    profileView,
    viewMode,
    editingQuestion,
    handleBackToList,
    clearEditState,
  ]);

  useEffect(() => {
    registerResetCallback(resetToRoot);
    return () => unregisterResetCallback();
  }, [registerResetCallback, unregisterResetCallback, resetToRoot]);

  useEffect(() => {
    registerRefreshCallback(() => fetchProfileData(false));
    return () => unregisterRefreshCallback();
  }, [registerRefreshCallback, unregisterRefreshCallback, fetchProfileData]);

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

  const resetCard = useCallback(() => {
    Animated.timing(cardPosition, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [cardPosition]);

  const getQuestionsForTab = useCallback(() => {
    return activeTab === "questions" ? myQuestions : votedQuestions;
  }, [activeTab, myQuestions, votedQuestions]);

  const navigateCard = useCallback(
    (direction: "left" | "right", shouldGoBackToList?: boolean) => {
      const questions = getQuestionsForTab();
      const currentIndex = cardDisplayIndexRef.current;
      const isFirst = currentIndex === 0;
      const isLast = currentIndex === questions.length - 1;

      if (
        (direction === "right" && isFirst) ||
        (direction === "left" && isLast)
      ) {
        if (shouldGoBackToList) {
          handleBackToList({ skipPositionReset: true });
        } else {
          resetCard();
        }
        return;
      }

      const nextIdx =
        direction === "left"
          ? (currentIndex + 1) % questions.length
          : currentIndex === 0
            ? questions.length - 1
            : currentIndex - 1;

      cardOpacity.setValue(0);
      setCardDisplayIndex(nextIdx);
    },
    [getQuestionsForTab, resetCard, handleBackToList, cardOpacity],
  );

  const forceSwipe = useCallback(
    (direction: "left" | "right") => {
      const questions = getQuestionsForTab();
      const currentIndex = cardDisplayIndexRef.current;
      const isFirst = currentIndex === 0;
      const isLast = currentIndex === questions.length - 1;

      if ((direction === "right" && isFirst) || (direction === "left" && isLast)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        resetCard();
        return;
      }

      const x =
        direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      Animated.timing(cardPosition, {
        toValue: { x, y: 0 },
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }).start(() => {
        navigateCard(direction, false);
      });
    },
    [cardPosition, navigateCard, getQuestionsForTab, resetCard],
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
    if (viewMode === "card") {
      cardPosition.setValue({ x: 0, y: 0 });
      cardEntryScale.setValue(0.98);
      cardOpacity.setValue(0);
      requestAnimationFrame(() => {
        cardOpacity.setValue(1);
        Animated.timing(cardEntryScale, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    }
  }, [cardDisplayIndex, cardEntryScale, cardPosition, cardOpacity, viewMode]);

  useEffect(() => {
    const listenerId = cardPosition.x.addListener(({ value }) => {
      const absDx = Math.abs(value);
      if (absDx >= SWIPE_OUT_DISTANCE * 0.8) {
        cardOpacity.setValue(0);
      } else if (absDx < SWIPE_OUT_DISTANCE * 0.1) {
        cardOpacity.setValue(1);
      }
    });

    return () => {
      cardPosition.x.removeListener(listenerId);
    };
  }, [cardPosition.x, cardOpacity]);



  const handleVoteHistoryPress = (item: VoteHistoryItem) => {
    const foundIndex = voteHistory.findIndex(
      (v) => v.questionId === item.questionId,
    );
    if (foundIndex >= 0) {
      setActiveTab("history");
      setCardDisplayIndex(foundIndex);
      setViewMode("card");
      cardPosition.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      cardEntryScale.setValue(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

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

  if (viewMode === "card") {
    const questions = getQuestionsForTab();
    const question = questions[cardDisplayIndex] ?? null;

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
              No questions available
            </Text>
          </View>
        </View>
      );
    }

    const currentVotes = question.votes ?? { left: 0, right: 0 };
    const currentTotal = currentVotes.left + currentVotes.right;
    const percentages = getNormalizedPercentages(
      currentVotes.left,
      currentVotes.right,
      currentTotal,
    );

    leftBarWidth.setValue(percentages.left);
    rightBarWidth.setValue(percentages.right);

    const userVote =
      activeTab === "history" && cardDisplayIndex < voteHistory.length
        ? voteHistory[cardDisplayIndex]?.direction
        : null;

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
            style={{
              padding: 8,
            }}
          >
            <Octicons name="chevron-left" size={24} color="white" />
          </Pressable>
        </View>

        <Animated.View
          {...cardPanResponder.panHandlers}
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 20,
            opacity: cardOpacity,
            transform: [
              { translateX: cardPosition.x },
              { scale: cardEntryScale },
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
                  question.meta.createdBy !== "You" &&
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
                onPress={() => {
                  if (activeTab === "questions" && currentVotes.left > 0) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openVotersSheet(question.id, "left", question.left.label);
                  }
                }}
                disabled={activeTab !== "questions" || currentVotes.left === 0}
                showResults={true}
                percentage={percentages.left}
                votes={currentVotes.left}
                animatedWidth={leftBarWidth}
                isSelected={userVote === "left"}
                friendVotes={question.friendVotes?.left?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
              />

              <FullScreenChoice
                choice={question.right}
                direction="right"
                onPress={() => {
                  if (activeTab === "questions" && currentVotes.right > 0) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openVotersSheet(question.id, "right", question.right.label);
                  }
                }}
                disabled={activeTab !== "questions" || currentVotes.right === 0}
                showResults={true}
                percentage={percentages.right}
                votes={currentVotes.right}
                animatedWidth={rightBarWidth}
                isSelected={userVote === "right"}
                friendVotes={question.friendVotes?.right?.map(f => ({ userId: f.userId, avatarUrl: f.avatarUrl }))}
              />
            </View>
          </View>
        </Animated.View>

        {votersSheetVisible && (
          <Animated.View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "#1c1c1c",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              height: "60%",
              transform: [{ translateY: votersSheetTranslateY }],
              paddingBottom: insets.bottom,
            }}
          >
            <View {...votersSheetPanResponder.panHandlers}>
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 12,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 4,
                    backgroundColor: "#444",
                    borderRadius: 2,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: "#333",
                }}
              >
                <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
                  {votersSheetChoiceLabel}
                </Text>
                <Pressable onPress={closeVotersSheet} style={{ padding: 4 }}>
                  <Octicons name="x" size={24} color="#aaa" />
                </Pressable>
              </View>
            </View>

            {votersLoading ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" color="white" />
              </View>
            ) : voters.length === 0 ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ color: "#666", fontSize: 16 }}>No votes yet</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
              >
                {voters.map((voter) => {
                  const isCurrentUser = voter.userId === clerkUser?.id;
                  const isFollowing = voterFollowStatus.get(voter.userId) || false;
                  const isVoterLoading = followingInProgress.has(voter.userId);
                  const displayName = voter.username || voter.firstName || "User";

                  return (
                    <Pressable
                      key={voter.userId}
                      onPress={() => {
                        if (!isCurrentUser) {
                          closeVotersSheet();
                          router.push({
                            pathname: "/user-profile",
                            params: {
                              username: displayName,
                              userId: voter.userId,
                            },
                          });
                        }
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        backgroundColor: pressed ? "#252525" : "transparent",
                      })}
                    >
                      {voter.avatarUrl ? (
                        <Image
                          source={{ uri: voter.avatarUrl }}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: "#333",
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: "#333",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: "#666", fontSize: 18, fontWeight: "600" }}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                          {displayName}
                          {isCurrentUser && " (You)"}
                        </Text>
                        {voter.firstName && voter.lastName && voter.username && (
                          <Text style={{ color: "#888", fontSize: 14 }}>
                            {voter.firstName} {voter.lastName}
                          </Text>
                        )}
                      </View>

                      {!isCurrentUser && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            toggleFollowVoter(voter.userId);
                          }}
                          disabled={isVoterLoading}
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor: isFollowing ? "transparent" : "white",
                            borderWidth: isFollowing ? 1 : 0,
                            borderColor: "#444",
                          }}
                        >
                          {isVoterLoading ? (
                            <ActivityIndicator size="small" color={isFollowing ? "white" : "black"} />
                          ) : (
                            <Text
                              style={{
                                color: isFollowing ? "white" : "black",
                                fontSize: 14,
                                fontWeight: "600",
                              }}
                            >
                              {isFollowing ? "Following" : "Follow"}
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Animated.View>
        )}

        {votersSheetVisible && (
          <Pressable
            onPress={closeVotersSheet}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: -1,
            }}
          />
        )}
      </View>
    );
  }

  const currentTab = profileView === "followers" ? "followers" : "following";
  const allUsers =
    profileView === "followers"
      ? followers
      : profileView === "following"
        ? following
        : [];

  const filteredUsers = allUsers.filter((user) => {
    if (!followersFollowingSearch.trim()) return true;
    const searchLower = followersFollowingSearch.toLowerCase();
    const fullName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`.toLowerCase()
        : (user.firstName || user.username || "").toLowerCase();
    const username = user.username.toLowerCase();
    return fullName.includes(searchLower) || username.includes(searchLower);
  });

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
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
          <View
            style={{
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
              style={{
                color: "white",
                fontSize: 20,
                fontWeight: "700",
                flex: 1,
              }}
            >
              People
            </Text>
            <View style={{ width: 40 }} />
          </View>

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
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <UserListItem key={user.id} user={user} />
              ))
            ) : (
              <View style={{ alignItems: "center", padding: 32 }}>
                <Octicons
                  name='search'
                  size={48}
                  color='#666'
                  style={{ marginBottom: 16 }}
                />
                <Text style={{ color: "#666", fontSize: 16 }}>
                  No {currentTab === "followers" ? "followers" : "following"}{" "}
                  found
                </Text>
              </View>
            )}
          </ScrollView>
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
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isCategoryDropdownOpen}
          keyboardShouldPersistTaps='always'
        >
          <ProfileHeader
            onEditPress={handleEditProfile}
            onSignOut={handleSignOut}
            onFollowersPress={() => {
              setProfileView("followers");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onFollowingPress={() => {
              setProfileView("following");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            stats={userStats}
          />

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
              {activeTab === "questions" ? (
                <View style={{ paddingHorizontal: 24 }}>
                  {myQuestions.length > 0 ? (
                    myQuestions.map((question) => {
                      if (
                        editingQuestion &&
                        editingQuestion.id === question.id
                      ) {
                        return (
                          <KeyboardAvoidingView
                            key={question.id}
                            behavior={
                              Platform.OS === "ios" ? "padding" : undefined
                            }
                            style={{ marginBottom: 12 }}
                          >
                            <ScrollView
                              contentContainerStyle={{ paddingBottom: 24 }}
                              keyboardShouldPersistTaps='always'
                              showsVerticalScrollIndicator={false}
                              scrollEnabled={!isCategoryDropdownOpen}
                            >
                              <View
                                style={{
                                  borderRadius: 24,
                                  borderWidth: 1,
                                  borderColor: "#333",
                                  backgroundColor: "#0f0f0f",
                                  overflow: "hidden",
                                }}
                              >
                                <View
                                  style={{
                                    padding: 16,
                                    borderBottomWidth: 1,
                                    borderBottomColor: "#222",
                                  }}
                                >
                                  <View style={{ marginBottom: 8 }}>
                                    <AutocompleteInput
                                      value={editCategory}
                                      onChangeText={setEditCategory}
                                      placeholder='Category (optional)'
                                      suggestions={SUGGESTED_CATEGORIES}
                                      onDropdownOpen={() =>
                                        setIsCategoryDropdownOpen(true)
                                      }
                                      onDropdownClose={() =>
                                        setIsCategoryDropdownOpen(false)
                                      }
                                      style={{
                                        width: "100%",
                                        color: "#aaa",
                                        fontSize: 12,
                                        padding: 8,
                                        backgroundColor: "#1c1c1c",
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: "#333",
                                      }}
                                    />
                                  </View>
                                  <TextInput
                                    value={editTitle}
                                    onChangeText={setEditTitle}
                                    placeholder='Question Title'
                                    placeholderTextColor='#666'
                                    style={{
                                      color: "white",
                                      fontSize: 20,
                                      fontWeight: "800",
                                      padding: 10,
                                      backgroundColor: "#1c1c1c",
                                      borderRadius: 6,
                                      borderWidth: 1,
                                      borderColor: "#333",
                                    }}
                                  />
                                </View>

                                <View style={{ padding: 16, gap: 12 }}>
                                  <View
                                    style={{
                                      position: "relative",
                                      minHeight: 100,
                                    }}
                                  >
                                    <TextInput
                                      value={editPrompt}
                                      onChangeText={setEditPrompt}
                                      placeholder="What's your question?"
                                      placeholderTextColor='#666'
                                      multiline
                                      numberOfLines={4}
                                      textAlignVertical='top'
                                      style={{
                                        color: "white",
                                        fontSize: 16,
                                        lineHeight: 22,
                                        padding: 12,
                                        paddingRight: 48,
                                        paddingBottom: 48,
                                        minHeight: 100,
                                        backgroundColor: "#1c1c1c",
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: "#333",
                                      }}
                                    />
                                    <Pressable
                                      onPress={() =>
                                        pickImage(setEditPromptImage)
                                      }
                                      style={{
                                        position: "absolute",
                                        bottom: 12,
                                        right: 12,
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        backgroundColor: "#262626",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Octicons
                                        name='image'
                                        size={18}
                                        color='#aaa'
                                      />
                                    </Pressable>
                                  </View>
                                  {editPromptImage && (
                                    <View style={{ position: "relative" }}>
                                      <Image
                                        source={{ uri: editPromptImage.uri }}
                                        style={{
                                          width: "100%",
                                          height: 180,
                                          borderRadius: 16,
                                        }}
                                      />
                                      <Pressable
                                        onPress={() => setEditPromptImage(null)}
                                        style={{
                                          position: "absolute",
                                          top: 8,
                                          right: 8,
                                          backgroundColor: "rgba(0, 0, 0, 0.7)",
                                          borderRadius: 12,
                                          width: 24,
                                          height: 24,
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        <Octicons
                                          name='x'
                                          size={12}
                                          color='white'
                                        />
                                      </Pressable>
                                    </View>
                                  )}

                                  <View
                                    style={{
                                      gap: 12,
                                      borderTopWidth: 1,
                                      borderTopColor: "#222",
                                      paddingTop: 12,
                                    }}
                                  >
                                    <View
                                      style={{
                                        borderRadius: 18,
                                        borderWidth: 1,
                                        borderColor: "#333",
                                        backgroundColor: "#1c1c1c",
                                        overflow: "hidden",
                                      }}
                                    >
                                      <View
                                        style={{
                                          position: "relative",
                                          padding: 12,
                                        }}
                                      >
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 12,
                                          }}
                                        >
                                          <View
                                            style={{ position: "relative" }}
                                          >
                                            <Pressable
                                              onPress={() =>
                                                pickImage(setEditLeftImage)
                                              }
                                              style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 12,
                                                backgroundColor: "#0f0f0f",
                                                borderWidth: 1,
                                                borderColor: "#333",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                overflow: "hidden",
                                              }}
                                            >
                                              {editLeftImage ? (
                                                <Image
                                                  source={{
                                                    uri: editLeftImage.uri,
                                                  }}
                                                  style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 12,
                                                  }}
                                                />
                                              ) : (
                                                <Octicons
                                                  name='image'
                                                  size={20}
                                                  color='#666'
                                                />
                                              )}
                                            </Pressable>
                                            {editLeftImage && (
                                              <Pressable
                                                onPress={() =>
                                                  setEditLeftImage(null)
                                                }
                                                style={{
                                                  position: "absolute",
                                                  top: -4,
                                                  right: -4,
                                                  width: 20,
                                                  height: 20,
                                                  borderRadius: 10,
                                                  backgroundColor:
                                                    "rgba(0, 0, 0, 0.8)",
                                                  borderWidth: 1,
                                                  borderColor: "#333",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  zIndex: 1,
                                                }}
                                              >
                                                <Octicons
                                                  name='x'
                                                  size={10}
                                                  color='white'
                                                />
                                              </Pressable>
                                            )}
                                          </View>
                                          <TextInput
                                            value={editLeftChoice}
                                            onChangeText={setEditLeftChoice}
                                            placeholder='Left Choice'
                                            placeholderTextColor='#666'
                                            style={{
                                              flex: 1,
                                              color: "white",
                                              fontSize: 16,
                                              fontWeight: "700",
                                              padding: 10,
                                              backgroundColor: "#0f0f0f",
                                              borderRadius: 6,
                                              borderWidth: 1,
                                              borderColor: "#333",
                                            }}
                                          />
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
                                      <View
                                        style={{
                                          position: "relative",
                                          padding: 12,
                                        }}
                                      >
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 12,
                                          }}
                                        >
                                          <View
                                            style={{ position: "relative" }}
                                          >
                                            <Pressable
                                              onPress={() =>
                                                pickImage(setEditRightImage)
                                              }
                                              style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 12,
                                                backgroundColor: "#0f0f0f",
                                                borderWidth: 1,
                                                borderColor: "#333",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                overflow: "hidden",
                                              }}
                                            >
                                              {editRightImage ? (
                                                <Image
                                                  source={{
                                                    uri: editRightImage.uri,
                                                  }}
                                                  style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 12,
                                                  }}
                                                />
                                              ) : (
                                                <Octicons
                                                  name='image'
                                                  size={20}
                                                  color='#666'
                                                />
                                              )}
                                            </Pressable>
                                            {editRightImage && (
                                              <Pressable
                                                onPress={() =>
                                                  setEditRightImage(null)
                                                }
                                                style={{
                                                  position: "absolute",
                                                  top: -4,
                                                  right: -4,
                                                  width: 20,
                                                  height: 20,
                                                  borderRadius: 10,
                                                  backgroundColor:
                                                    "rgba(0, 0, 0, 0.8)",
                                                  borderWidth: 1,
                                                  borderColor: "#333",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  zIndex: 1,
                                                }}
                                              >
                                                <Octicons
                                                  name='x'
                                                  size={10}
                                                  color='white'
                                                />
                                              </Pressable>
                                            )}
                                          </View>
                                          <TextInput
                                            value={editRightChoice}
                                            onChangeText={setEditRightChoice}
                                            placeholder='Right Choice'
                                            placeholderTextColor='#666'
                                            style={{
                                              flex: 1,
                                              color: "white",
                                              fontSize: 16,
                                              fontWeight: "700",
                                              padding: 10,
                                              backgroundColor: "#0f0f0f",
                                              borderRadius: 6,
                                              borderWidth: 1,
                                              borderColor: "#333",
                                            }}
                                          />
                                        </View>
                                      </View>
                                    </View>
                                  </View>

                                  <View
                                    style={{
                                      flexDirection: "row",
                                      gap: 12,
                                      marginTop: 8,
                                    }}
                                  >
                                    <Pressable
                                      onPress={handleCancelEdit}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? "#2a2a2a"
                                          : "transparent",
                                        borderRadius: 12,
                                        padding: 16,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderWidth: 1,
                                        borderColor: "#333",
                                      })}
                                    >
                                      <Text
                                        style={{
                                          color: "#aaa",
                                          fontSize: 16,
                                          fontWeight: "600",
                                        }}
                                      >
                                        Cancel
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      onPress={handleSaveEdit}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? "#e0e0e0"
                                          : "#fff",
                                        borderRadius: 12,
                                        padding: 16,
                                        alignItems: "center",
                                        justifyContent: "center",
                                      })}
                                    >
                                      <Text
                                        style={{
                                          color: "#000",
                                          fontSize: 16,
                                          fontWeight: "700",
                                        }}
                                      >
                                        Save Changes
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>
                              </View>
                            </ScrollView>
                          </KeyboardAvoidingView>
                        );
                      }
                      return (
                        <MyQuestionCard
                          key={question.id}
                          question={question}
                          onPress={() => handleQuestionPress(question)}
                          onEdit={() => handleEditQuestion(question)}
                          onDelete={() => handleDeleteQuestion(question.id)}
                        />
                      );
                    })
                  ) : (
                    <View style={{ alignItems: "center", padding: 32 }}>
                      <Octicons
                        name='question'
                        size={48}
                        color='#666'
                        style={{ marginBottom: 16 }}
                      />
                      <Text style={{ color: "#666", fontSize: 16 }}>
                        You haven&apos;t created any questions yet
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ paddingHorizontal: 24 }}>
                  {voteHistory.length > 0 ? (
                    voteHistory.map((item, index) => {
                      const question = votedQuestions[index] || null;
                      return (
                        <VoteHistoryItemCard
                          key={item.questionId}
                          item={item}
                          question={question}
                          onPress={() => handleVoteHistoryPress(item)}
                          onDelete={() => item.questionId && handleDeleteVote(item.questionId)}
                        />
                      );
                    })
                  ) : (
                    <View style={{ alignItems: "center", padding: 32 }}>
                      <Octicons
                        name='check-circle'
                        size={48}
                        color='#666'
                        style={{ marginBottom: 16 }}
                      />
                      <Text style={{ color: "#666", fontSize: 16 }}>
                        You haven&apos;t voted on any questions yet
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
