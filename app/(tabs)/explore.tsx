import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import {
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
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
  {
    id: "q5",
    title: "Weekend plans",
    prompt: "What should I do this weekend?",
    left: { id: "left", label: "Stay home" },
    right: { id: "right", label: "Go out" },
    votes: { left: 18, right: 32 },
    meta: { category: "Social", createdBy: "Anonymous" },
  },
  {
    id: "q6",
    title: "Career move",
    prompt: "Should I take the promotion or switch companies?",
    left: { id: "left", label: "Take promotion" },
    right: { id: "right", label: "Switch companies" },
    votes: { left: 25, right: 19 },
    meta: { category: "Career", createdBy: "Anonymous" },
  },
  {
    id: "q7",
    title: "Travel destination",
    prompt: "Where should I go for my next vacation?",
    left: {
      id: "left",
      label: "Beach",
      imageUrl: "https://images.unsplash.com/photo-1507525421304-6d5d6e4a6c8b?w=400&h=400&fit=crop",
    },
    right: {
      id: "right",
      label: "Mountains",
      imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop",
    },
    votes: { left: 42, right: 28 },
    meta: { category: "Travel", createdBy: "Anonymous" },
  },
  {
    id: "q8",
    title: "Morning routine",
    prompt: "What's your ideal morning?",
    left: { id: "left", label: "Early riser" },
    right: { id: "right", label: "Sleep in" },
    votes: { left: 31, right: 44 },
    meta: { category: "Health", createdBy: "Anonymous" },
  },
];

const QuestionCard: React.FC<{ question: Question }> = ({ question }) => {
  const totalVotes = (question.votes?.left ?? 0) + (question.votes?.right ?? 0);

  return (
    <Pressable
      style={{
        backgroundColor: "#1c1c1c",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#333",
      }}
    >
      {question.promptImageUrl && (
        <Image
          source={{ uri: question.promptImageUrl }}
          style={{ width: "100%", height: 120 }}
          resizeMode="cover"
        />
      )}
      
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          {question.meta?.category && (
            <Text style={{ color: "#aaa", fontSize: 12, marginRight: 8 }}>
              {question.meta.category}
            </Text>
          )}
          {question.meta?.createdBy && (
            <Text style={{ color: "#666", fontSize: 12 }}>• {question.meta.createdBy}</Text>
          )}
        </View>
        
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          {question.title}
        </Text>
        
        <Text
          style={{ color: "#aaa", fontSize: 14, marginBottom: 8 }}
          numberOfLines={3}
        >
          {question.prompt}
        </Text>

        <Text style={{ color: "#666", fontSize: 12 }}>
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </Text>
      </View>
    </Pressable>
  );
};

export default function ExploreScreen() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [questions] = React.useState(SAMPLE_QUESTIONS);

  const filteredQuestions = React.useMemo(() => {
    if (!searchQuery.trim()) return questions;
    
    const query = searchQuery.toLowerCase();
    return questions.filter(
      (q) =>
        q.title.toLowerCase().includes(query) ||
        q.prompt.toLowerCase().includes(query) ||
        q.meta?.category?.toLowerCase().includes(query) ||
        q.left.label.toLowerCase().includes(query) ||
        q.right.label.toLowerCase().includes(query)
    );
  }, [searchQuery, questions]);

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
        }}
      >
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
          }}
        >
          <Octicons name="search" size={18} color="#666" style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search questions"
            placeholderTextColor="#666"
            style={{
              flex: 1,
              color: "white",
              fontSize: 16,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Octicons name="x" size={18} color="#666" />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filteredQuestions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <QuestionCard question={item} />}
        contentContainerStyle={{
          padding: 16,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
