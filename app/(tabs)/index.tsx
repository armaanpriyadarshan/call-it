import React from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

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
  meta?: {
    category?: string;
    createdBy?: string;
  };
};

const SAMPLE_QUESTIONS: Question[] = [
  {
    id: "q1",
    title: "Outfit check",
    prompt: "Which one for dinner tonight?",
    promptImageUrl:
      "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=1200&q=80",
    left: {
      id: "left",
      label: "Black dress",
      imageUrl:
        "https://images.unsplash.com/photo-1520975958222-8c6c2b6c5e6b?auto=format&fit=crop&w=900&q=80",
    },
    right: {
      id: "right",
      label: "Red dress",
      imageUrl:
        "https://images.unsplash.com/photo-1520975951211-0db1a7e24f2f?auto=format&fit=crop&w=900&q=80",
    },
    meta: { category: "Style", createdBy: "Anonymous" },
  },
  {
    id: "q2",
    title: "Text them?",
    prompt: "Do I double-text if they haven’t replied in 24 hours?",
    left: { id: "left", label: "No (chill)" },
    right: { id: "right", label: "Yes (send it)" },
    meta: { category: "Social", createdBy: "Anonymous" },
  },
  {
    id: "q3",
    title: "Long prompt stress test",
    prompt:
      "I’m picking between two internships. Option A is a bigger brand, but the team is less aligned with what I want to do long-term. Option B is smaller, but I’ll get more ownership and mentorship. I’m worried Option B won’t look as strong on my resume, but I also don’t want to be stuck doing boring work all summer. For context: I care about learning, actual shipping, and a team that invests in me. Which should I choose?",
    left: { id: "left", label: "Option A (brand)" },
    right: { id: "right", label: "Option B (growth)" },
    meta: { category: "Career", createdBy: "Anonymous" },
  },
  {
    id: "q4",
    title: "Food",
    prompt: "Pick my late-night order.",
    left: {
      id: "left",
      label: "Sushi",
      imageUrl:
        "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1200&q=80",
    },
    right: {
      id: "right",
      label: "Tacos",
      imageUrl:
        "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=1200&q=80",
    },
    meta: { category: "Food", createdBy: "Anonymous" },
  },
];

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = 0.25 * SCREEN_W;
const SWIPE_OUT_DISTANCE = 1.2 * SCREEN_W;
const HORIZONTAL_ACTIVATION_DX = 8;

export default function HomeScreen() {
  const [index, setIndex] = React.useState(0);
  const question = SAMPLE_QUESTIONS[index] ?? null;

  const position = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const entryScale = React.useRef(new Animated.Value(1)).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  const cardStyle = {
    transform: [{ translateX: position.x }, { rotate }],
  };

  const resetCard = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
    }).start();
  };

  const advance = () => {
    setIndex((i) => (i + 1 >= SAMPLE_QUESTIONS.length ? 0 : i + 1));
    position.setValue({ x: 0, y: 0 });
  };

  const forceSwipe = (direction: "left" | "right") => {
    const x = direction === "right" ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 180,
      useNativeDriver: false,
    }).start(advance);
  };

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_, gesture) => {
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          if (dy > dx) return false; // vertical = ScrollView
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
          }
        },

        onPanResponderTerminate: resetCard,
      }),
    [index]
  );

  React.useEffect(() => {
    entryScale.setValue(0.985);
    Animated.timing(entryScale, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [index, entryScale]);

  return (
    <View style={{ flex: 1, backgroundColor: "black", padding: 24 }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        {!question ? (
          <Text style={{ color: "white" }}>No questions</Text>
        ) : (
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
            {/* Header */}
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#222" }}>
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {question.meta?.category ?? "General"}
                {question.meta?.createdBy ? ` • ${question.meta.createdBy}` : ""}
              </Text>
              <Text style={{ color: "white", fontSize: 20, fontWeight: "800", marginTop: 6 }}>
                {question.title}
              </Text>
            </View>

            {/* Prompt */}
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

            {/* Choices */}
            <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#333",
                  backgroundColor: "#1c1c1c",
                  padding: 12,
                }}
              >
                <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8 }}>
                  SWIPE LEFT
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {question.left.imageUrl && (
                    <Image
                      source={{ uri: question.left.imageUrl }}
                      style={{ width: 44, height: 44, borderRadius: 12 }}
                    />
                  )}
                  <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
                    {question.left.label}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#333",
                  backgroundColor: "#1c1c1c",
                  padding: 12,
                }}
              >
                <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8 }}>
                  SWIPE RIGHT
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {question.right.imageUrl && (
                    <Image
                      source={{ uri: question.right.imageUrl }}
                      style={{ width: 44, height: 44, borderRadius: 12 }}
                    />
                  )}
                  <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
                    {question.right.label}
                  </Text>
                </View>
              </View>

              <Text style={{ color: "#777", fontSize: 12 }}>
                Tip: Scroll vertically in the prompt. Swipe left or right to pick.
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
