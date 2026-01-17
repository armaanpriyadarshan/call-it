import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type ImageInfo = {
  uri: string;
  width?: number;
  height?: number;
};

const SUGGESTED_CATEGORIES = ["Style", "Food", "Career", "Social", "Travel", "Technology", "Sports", "Entertainment", "Health", "Education"];

const AutocompleteInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  suggestions: string[];
  style?: any;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ value, onChangeText, placeholder, suggestions, style, onFocus, onBlur }) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const isSelectingRef = React.useRef(false);

  React.useEffect(() => {
    if (value.trim() && isFocused) {
      const filtered = suggestions.filter((cat) =>
        cat.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    } else if (isFocused) {
      setFilteredSuggestions(suggestions);
    } else {
      setFilteredSuggestions([]);
    }
  }, [value, isFocused, suggestions]);

  React.useEffect(() => {
    if (isFocused && filteredSuggestions.length > 0) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [isFocused, filteredSuggestions.length, fadeAnim]);

  const handleSelect = (suggestion: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isSelectingRef.current = true;
    onChangeText(suggestion);
    
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setIsFocused(false);
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 100);
    });
    
    inputRef.current?.focus();
  };

  const inputRef = React.useRef<TextInput>(null);

  return (
    <View style={{ position: "relative", zIndex: isFocused ? 1000 : 1 }}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          if (!isSelectingRef.current && text.trim() !== value.trim()) {
            setIsFocused(true);
          }
        }}
        onFocus={() => {
          setIsFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setTimeout(() => {
            setIsFocused(false);
            onBlur?.();
          }, 200);
        }}
        placeholder={placeholder}
        placeholderTextColor="#666"
        style={style}
      />
      {isFocused && filteredSuggestions.length > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            backgroundColor: "#1c1c1c",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#333",
            maxHeight: 200,
            zIndex: 1001,
            elevation: 5,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            overflow: "hidden",
            opacity: fadeAnim,
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 200 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={true}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  handleSelect(suggestion);
                }}
                activeOpacity={0.7}
                style={{
                  padding: 12,
                  borderBottomWidth: index < filteredSuggestions.length - 1 ? 1 : 0,
                  borderBottomColor: "#222",
                }}
              >
                <Text style={{ color: "white", fontSize: 16 }}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
};

export default function CreatePostScreen() {
  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [leftChoice, setLeftChoice] = React.useState("");
  const [rightChoice, setRightChoice] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [promptImage, setPromptImage] = React.useState<ImageInfo | null>(null);
  const [leftImage, setLeftImage] = React.useState<ImageInfo | null>(null);
  const [rightImage, setRightImage] = React.useState<ImageInfo | null>(null);
  const [isAnonymous, setIsAnonymous] = React.useState(false);
  const categoryInputRef = React.useRef<View>(null);

  const scrollToCategory = () => {
    setTimeout(() => {
      categoryInputRef.current?.measureLayout(
        scrollViewRef.current as any,
        (x, y, width, height) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 100),
            animated: true,
          });
        },
        () => {}
      );
    }, 100);
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

  const handleSubmit = () => {
    if (!title || !prompt || !leftChoice || !rightChoice) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const scrollViewRef = React.useRef<ScrollView>(null);
  const titleInputRef = React.useRef<TextInput>(null);
  const promptInputRef = React.useRef<TextInput>(null);
  const leftChoiceInputRef = React.useRef<TextInput>(null);
  const rightChoiceInputRef = React.useRef<TextInput>(null);

  const scrollToInput = (inputRef: React.RefObject<any>) => {
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.measureLayout?.(
          scrollViewRef.current as any,
          (x: number, y: number) => {
            scrollViewRef.current?.scrollTo({
              y: Math.max(0, y - 150),
              animated: true,
            });
          },
          () => {}
        );
      }
    }, 200);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "black" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{
          paddingTop: 90,
          paddingBottom: 100,
          paddingHorizontal: 24,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ color: "white", fontSize: 28, fontWeight: "800", marginBottom: 8 }}>
            Create Post
          </Text>
          <Text style={{ color: "#aaa", fontSize: 14 }}>
            Share your question and let others vote
          </Text>
        </View>

        <View>
          <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
            Title
          </Text>
          <TextInput
            ref={titleInputRef}
            value={title}
            onChangeText={setTitle}
            onFocus={() => scrollToInput(titleInputRef)}
            placeholder="Give your post a title"
            placeholderTextColor="#666"
            style={{
              backgroundColor: "#1c1c1c",
              borderRadius: 12,
              padding: 16,
              color: "white",
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#333",
            }}
          />
        </View>

        <View>
          <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
            Question / Prompt
          </Text>
          <View
            style={{
              backgroundColor: "#1c1c1c",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#333",
              overflow: "hidden",
            }}
          >
            <View style={{ position: "relative", minHeight: 100 }}>
              <TextInput
                ref={promptInputRef}
                value={prompt}
                onChangeText={setPrompt}
                onFocus={() => scrollToInput(promptInputRef)}
                placeholder="What's your question?"
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{
                  padding: 16,
                  paddingRight: 48,
                  paddingBottom: 48,
                  color: "white",
                  fontSize: 16,
                  minHeight: 100,
                }}
              />
              <Pressable
                onPress={() => pickImage(setPromptImage)}
                style={({ pressed }) => ({
                  position: "absolute",
                  bottom: 12,
                  right: 12,
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: pressed ? "#2a2a2a" : "#262626",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Octicons name="image" size={18} color="#aaa" />
              </Pressable>
            </View>
            {promptImage && (
              <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
                <View style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden" }}>
                  <Image
                    source={{ uri: promptImage.uri }}
                    style={{ width: "100%", height: "100%", borderRadius: 12 }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => {
                      setPromptImage(null);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      backgroundColor: "rgba(0, 0, 0, 0.7)",
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Octicons name="x" size={12} color="white" />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
              Left Choice
            </Text>
            <View
              style={{
                backgroundColor: "#1c1c1c",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#333",
                overflow: "hidden",
              }}
            >
              <View style={{ position: "relative" }}>
                <TextInput
                  ref={leftChoiceInputRef}
                  value={leftChoice}
                  onChangeText={setLeftChoice}
                  onFocus={() => scrollToInput(leftChoiceInputRef)}
                  placeholder="Option A"
                  placeholderTextColor="#666"
                  style={{
                    padding: 16,
                    paddingRight: 48,
                    color: "white",
                    fontSize: 16,
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 12,
                    bottom: 0,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Pressable
                    onPress={() => pickImage(setLeftImage)}
                    style={({ pressed }) => ({
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: pressed ? "#2a2a2a" : "#262626",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Octicons name="image" size={18} color="#aaa" />
                  </Pressable>
                </View>
              </View>
              {leftImage && (
                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
                  <View style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden" }}>
                    <Image
                      source={{ uri: leftImage.uri }}
                      style={{ width: "100%", height: "100%", borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => {
                        setLeftImage(null);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        borderRadius: 12,
                        width: 24,
                        height: 24,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Octicons name="x" size={12} color="white" />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View>
            <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
              Right Choice
            </Text>
            <View
              style={{
                backgroundColor: "#1c1c1c",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#333",
                overflow: "hidden",
              }}
            >
              <View style={{ position: "relative" }}>
                <TextInput
                  ref={rightChoiceInputRef}
                  value={rightChoice}
                  onChangeText={setRightChoice}
                  onFocus={() => scrollToInput(rightChoiceInputRef)}
                  placeholder="Option B"
                  placeholderTextColor="#666"
                  style={{
                    padding: 16,
                    paddingRight: 48,
                    color: "white",
                    fontSize: 16,
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 12,
                    bottom: 0,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Pressable
                    onPress={() => pickImage(setRightImage)}
                    style={({ pressed }) => ({
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: pressed ? "#2a2a2a" : "#262626",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Octicons name="image" size={18} color="#aaa" />
                  </Pressable>
                </View>
              </View>
              {rightImage && (
                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
                  <View style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden" }}>
                    <Image
                      source={{ uri: rightImage.uri }}
                      style={{ width: "100%", height: "100%", borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => {
                        setRightImage(null);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        borderRadius: 12,
                        width: 24,
                        height: 24,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Octicons name="x" size={12} color="white" />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

          <View ref={categoryInputRef}>
            <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
              Category (Optional)
            </Text>
            <AutocompleteInput
              value={category}
              onChangeText={setCategory}
              placeholder="e.g., Style, Food, Career"
              suggestions={SUGGESTED_CATEGORIES}
              onFocus={scrollToCategory}
              style={{
                backgroundColor: "#1c1c1c",
                borderRadius: 12,
                padding: 16,
                color: "white",
                fontSize: 16,
                borderWidth: 1,
                borderColor: "#333",
              }}
            />
          </View>

        <Pressable
          onPress={() => {
            setIsAnonymous(!isAnonymous);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              borderWidth: 2,
              borderColor: isAnonymous ? "#fff" : "#666",
              backgroundColor: isAnonymous ? "#fff" : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isAnonymous && (
              <Octicons name="check" size={14} color="black" />
            )}
          </View>
          <Text style={{ color: "#aaa", fontSize: 12, textTransform: "uppercase" }}>Post Anonymously</Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => ({
            backgroundColor: pressed ? "#333" : "#fff",
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
          })}
        >
          <Text
            style={{
              color: "black",
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Create Post
          </Text>
          </Pressable>
        </ScrollView>
    </KeyboardAvoidingView>
  );
}
