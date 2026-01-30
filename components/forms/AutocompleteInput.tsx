import * as Haptics from "expo-haptics";
import React from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";

const COLORS = {
  background: "#1c1c1c",
  border: "#333",
  text: "white",
  placeholder: "#666",
};

export const AutocompleteInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  suggestions: string[];
  style?: any;
  onFocus?: () => void;
  onBlur?: () => void;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
}> = ({ value, onChangeText, placeholder, suggestions, style, onFocus, onBlur, onDropdownOpen, onDropdownClose }) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const isSelectingRef = React.useRef(false);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef<TextInput>(null);

  const cancelBlurTimeout = React.useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

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

  const isDropdownVisible = isFocused && filteredSuggestions.length > 0;

  React.useEffect(() => {
    if (isDropdownVisible) {
      onDropdownOpen?.();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      onDropdownClose?.();
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [isDropdownVisible, fadeAnim, onDropdownOpen, onDropdownClose]);

  React.useEffect(() => {
    return () => cancelBlurTimeout();
  }, [cancelBlurTimeout]);

  const handleSelect = (suggestion: string) => {
    cancelBlurTimeout();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isSelectingRef.current = true;
    onChangeText(suggestion);
    setIsFocused(false);

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 100);
    });
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
          cancelBlurTimeout();
          setIsFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => {
            if (!isSelectingRef.current) {
              setIsFocused(false);
              onBlur?.();
            }
          }, 150);
        }}
        placeholder={placeholder}
        placeholderTextColor={COLORS.placeholder}
        style={style}
      />
      {isFocused && filteredSuggestions.length > 0 && (
        <View
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
            elevation: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            overflow: "hidden",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="always"
            style={{ maxHeight: 200 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={true}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <Pressable
                key={index}
                onPressIn={cancelBlurTimeout}
                onPress={() => handleSelect(suggestion)}
                style={({ pressed }) => ({
                  padding: 12,
                  borderBottomWidth: index < filteredSuggestions.length - 1 ? 1 : 0,
                  borderBottomColor: "#222",
                  backgroundColor: pressed ? "#2a2a2a" : "transparent",
                })}
              >
                <Text style={{ color: COLORS.text, fontSize: 16 }}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
