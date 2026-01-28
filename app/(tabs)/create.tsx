import { useAuth, useUser } from "@clerk/clerk-expo";
import Octicons from "@expo/vector-icons/Octicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import React from "react";
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { createQuestion } from "@/lib/queries/questions";
import { uploadQuestionImage } from "@/lib/storage";
import { createClerkSupabaseClient } from "@/lib/supabase";

type ImageInfo = {
  uri: string;
  width?: number;
  height?: number;
};

const SUGGESTED_CATEGORIES = [
  "Style",
  "Food",
  "Career",
  "Social",
  "Travel",
  "Technology",
  "Sports",
  "Entertainment",
  "Health",
  "Education",
];

const COLORS = {
  background: "#1c1c1c",
  border: "#333",
  borderError: "#ff6b6b",
  text: "white",
  textSecondary: "#aaa",
  placeholder: "#666",
  overlay: "rgba(0, 0, 0, 0.7)",
};

const resetFormData = {
  title: "",
  prompt: "",
  leftChoice: "",
  rightChoice: "",
  category: "",
  promptImage: null as ImageInfo | null,
  leftImage: null as ImageInfo | null,
  rightImage: null as ImageInfo | null,
  submitted: false,
};

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
  const inputRef = React.useRef<TextInput>(null);

  React.useEffect(() => {
    if (value.trim() && isFocused) {
      const filtered = suggestions.filter((cat) => cat.toLowerCase().includes(value.toLowerCase()));
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
        placeholderTextColor={COLORS.placeholder}
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
            backgroundColor: COLORS.background,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
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
                onPress={() => handleSelect(suggestion)}
                activeOpacity={0.7}
                style={{
                  padding: 12,
                  borderBottomWidth: index < filteredSuggestions.length - 1 ? 1 : 0,
                  borderBottomColor: "#222",
                }}
              >
                <Text style={{ color: COLORS.text, fontSize: 16 }}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
};

const ImagePreview: React.FC<{
  image: ImageInfo;
  onRemove: () => void;
}> = ({ image, onRemove }) => (
  <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#222" }}>
    <View style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden" }}>
      <Image source={{ uri: image.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      <Pressable
        onPress={onRemove}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          backgroundColor: COLORS.overlay,
          borderRadius: 12,
          width: 24,
          height: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Octicons name="x" size={12} color={COLORS.text} />
      </Pressable>
    </View>
  </View>
);

const ImageAttachmentButton: React.FC<{
  onPress: () => void;
  position: "bottom-right" | "center-right";
}> = ({ onPress, position }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      ...(position === "bottom-right" && { position: "absolute", bottom: 12, right: 12 }),
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: pressed ? "#2a2a2a" : "#262626",
      alignItems: "center",
      justifyContent: "center",
    })}
  >
    <Octicons name="image" size={18} color={COLORS.textSecondary} />
  </Pressable>
);

const FormField: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <View>
    <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
      {label}
    </Text>
    {children}
    {error ? <Text style={{ color: COLORS.borderError, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
  </View>
);

const SuccessScreen: React.FC<{
  onDismiss: () => void;
}> = ({ onDismiss }) => (
  <View
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "black",
      zIndex: 1000,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: COLORS.background,
          borderWidth: 2,
          borderColor: COLORS.text,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Octicons name="check" size={40} color={COLORS.text} />
      </View>
      <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "700", marginBottom: 8 }}>
        Post created!
      </Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 16, marginBottom: 8 }}>Your question is now live</Text>
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: pressed ? COLORS.border : "transparent",
          backgroundColor: pressed ? COLORS.background : "transparent",
          minWidth: 60,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Octicons name="arrow-left" size={24} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontWeight: "500" }}>Back</Text>
        </View>
      </Pressable>
    </View>
  </View>
);

export default function CreatePostScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [leftChoice, setLeftChoice] = React.useState("");
  const [rightChoice, setRightChoice] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [promptImage, setPromptImage] = React.useState<ImageInfo | null>(null);
  const [leftImage, setLeftImage] = React.useState<ImageInfo | null>(null);
  const [rightImage, setRightImage] = React.useState<ImageInfo | null>(null);
  const [isAnonymous, setIsAnonymous] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);

  const wasFocusedRef = React.useRef(false);
  const showSuccessRef = React.useRef(false);
  const categoryInputRef = React.useRef<View>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const titleInputRef = React.useRef<TextInput>(null);
  const promptInputRef = React.useRef<TextInput>(null);
  const leftChoiceInputRef = React.useRef<TextInput>(null);
  const rightChoiceInputRef = React.useRef<TextInput>(null);

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

  const scrollToInput = React.useCallback((inputRef: React.RefObject<TextInput | null>) => {
    setTimeout(() => {
      inputRef.current?.measureLayout?.(
        scrollViewRef.current as any,
        (x: number, y: number) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 150),
            animated: true,
          });
        },
        () => {}
      );
    }, 200);
  }, []);

  const scrollToCategory = React.useCallback(() => {
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
  }, []);

  const resetForm = React.useCallback(() => {
    setTitle(resetFormData.title);
    setPrompt(resetFormData.prompt);
    setLeftChoice(resetFormData.leftChoice);
    setRightChoice(resetFormData.rightChoice);
    setCategory(resetFormData.category);
    setPromptImage(resetFormData.promptImage);
    setLeftImage(resetFormData.leftImage);
    setRightImage(resetFormData.rightImage);
    setSubmitted(resetFormData.submitted);
  }, []);

  const titleOk = title.trim().length > 0;
  const promptOk = prompt.trim().length > 0;
  const leftChoiceOk = leftChoice.trim().length > 0;
  const rightChoiceOk = rightChoice.trim().length > 0;
  const formOk = titleOk && promptOk && leftChoiceOk && rightChoiceOk;

  const showTitleError = submitted && !titleOk;
  const showPromptError = submitted && !promptOk;
  const showLeftChoiceError = submitted && !leftChoiceOk;
  const showRightChoiceError = submitted && !rightChoiceOk;

  const handleSubmit = React.useCallback(async () => {
    setSubmitted(true);
    Keyboard.dismiss();

    if (!formOk || !user) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      setBusy(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const supabase = createClerkSupabaseClient({ getToken });

      let promptImageUrl: string | null = null;
      let leftImageUrl: string | null = null;
      let rightImageUrl: string | null = null;

      if (promptImage) {
        promptImageUrl = await uploadQuestionImage(supabase, user.id, promptImage.uri);
      }
      if (leftImage) {
        leftImageUrl = await uploadQuestionImage(supabase, user.id, leftImage.uri);
      }
      if (rightImage) {
        rightImageUrl = await uploadQuestionImage(supabase, user.id, rightImage.uri);
      }

      await createQuestion(supabase, {
        user_id: user.id,
        title: title.trim(),
        prompt: prompt.trim(),
        left_choice_label: leftChoice.trim(),
        right_choice_label: rightChoice.trim(),
        category: category.trim() || null,
        prompt_image_url: promptImageUrl,
        left_choice_image_url: leftImageUrl,
        right_choice_image_url: rightImageUrl,
        is_anonymous: isAnonymous,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setShowSuccess(true);
    } catch (err) {
      console.error("Failed to create question:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }, [formOk, user, getToken, title, prompt, leftChoice, rightChoice, category, promptImage, leftImage, rightImage, isAnonymous, resetForm]);

  const handleDismissSuccess = React.useCallback(() => {
    setShowSuccess(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  React.useEffect(() => {
    showSuccessRef.current = showSuccess;
  }, [showSuccess]);

  useFocusEffect(
    React.useCallback(() => {
      const wasFocused = wasFocusedRef.current;
      wasFocusedRef.current = true;

      if (!wasFocused && showSuccessRef.current) {
        setShowSuccess(false);
      }

      return () => {
        wasFocusedRef.current = false;
      };
    }, [])
  );

  const inputStyle = {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "black" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {showSuccess && <SuccessScreen onDismiss={handleDismissSuccess} />}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{
          paddingTop: 90,
          paddingBottom: 24,
          paddingHorizontal: 24,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ color: COLORS.text, fontSize: 28, fontWeight: "800", marginBottom: 8 }}>
            Create Post
          </Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>Share your question and let others vote</Text>
        </View>

        <FormField label="Title" error={showTitleError ? "Title is required." : undefined}>
          <TextInput
            ref={titleInputRef}
            value={title}
            onChangeText={setTitle}
            onFocus={() => scrollToInput(titleInputRef)}
            placeholder="Give your post a title"
            placeholderTextColor={COLORS.placeholder}
            style={{
              ...inputStyle,
              borderColor: showTitleError ? COLORS.borderError : COLORS.border,
            }}
          />
        </FormField>

        <FormField label="Question / Prompt" error={showPromptError ? "Prompt is required." : undefined}>
          <View
            style={{
              backgroundColor: COLORS.background,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: showPromptError ? COLORS.borderError : COLORS.border,
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
                placeholderTextColor={COLORS.placeholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{
                  padding: 16,
                  paddingRight: 48,
                  paddingBottom: 48,
                  color: COLORS.text,
                  fontSize: 16,
                  minHeight: 100,
                }}
              />
              <ImageAttachmentButton onPress={() => pickImage(setPromptImage)} position="bottom-right" />
            </View>
            {promptImage && (
              <ImagePreview image={promptImage} onRemove={() => setPromptImage(null)} />
            )}
          </View>
        </FormField>

        <View style={{ gap: 12 }}>
          <FormField label="Left Choice" error={showLeftChoiceError ? "Left choice is required." : undefined}>
            <View
              style={{
                backgroundColor: COLORS.background,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: showLeftChoiceError ? COLORS.borderError : COLORS.border,
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
                  placeholderTextColor={COLORS.placeholder}
                  style={{
                    padding: 16,
                    paddingRight: 48,
                    color: COLORS.text,
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
                  <ImageAttachmentButton onPress={() => pickImage(setLeftImage)} position="center-right" />
                </View>
              </View>
              {leftImage && <ImagePreview image={leftImage} onRemove={() => setLeftImage(null)} />}
            </View>
          </FormField>

          <FormField label="Right Choice" error={showRightChoiceError ? "Right choice is required." : undefined}>
            <View
              style={{
                backgroundColor: COLORS.background,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: showRightChoiceError ? COLORS.borderError : COLORS.border,
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
                  placeholderTextColor={COLORS.placeholder}
                  style={{
                    padding: 16,
                    paddingRight: 48,
                    color: COLORS.text,
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
                  <ImageAttachmentButton onPress={() => pickImage(setRightImage)} position="center-right" />
                </View>
              </View>
              {rightImage && <ImagePreview image={rightImage} onRemove={() => setRightImage(null)} />}
            </View>
          </FormField>
        </View>

        <View ref={categoryInputRef}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginBottom: 8, textTransform: "uppercase" }}>
            Category (Optional)
          </Text>
          <AutocompleteInput
            value={category}
            onChangeText={setCategory}
            placeholder="e.g., Style, Food, Career"
            suggestions={SUGGESTED_CATEGORIES}
            onFocus={scrollToCategory}
            style={{
              ...inputStyle,
              borderColor: COLORS.border,
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
              borderColor: isAnonymous ? COLORS.text : COLORS.textSecondary,
              backgroundColor: isAnonymous ? COLORS.text : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isAnonymous && <Octicons name="check" size={14} color="black" />}
          </View>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, textTransform: "uppercase" }}>
            Post Anonymously
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          disabled={busy || !formOk}
          style={({ pressed }) => ({
            backgroundColor: pressed ? "#2a2a2a" : formOk ? "#fff" : COLORS.background,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
            borderWidth: 1,
            borderColor: formOk ? "transparent" : COLORS.border,
            opacity: busy || !formOk ? 0.5 : 1,
          })}
        >
          <Text
            style={{
              color: formOk ? "black" : COLORS.textSecondary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            {busy ? "Creating..." : "Create Post"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
