import Octicons from "@expo/vector-icons/Octicons";
import React from "react";
import { Pressable, TextInput, View } from "react-native";

export const SearchBar = React.forwardRef<
  TextInput,
  {
    value: string;
    onChangeText: (text: string) => void;
    onClear: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onSubmitEditing: () => void;
  }
>(function SearchBar({ value, onChangeText, onClear, onFocus, onBlur, onSubmitEditing }, ref) {
  return (
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
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
        placeholder="Search"
        placeholderTextColor="#666"
        style={{
          flex: 1,
          color: "white",
          fontSize: 16,
        }}
      />
      {value.length > 0 && (
        <Pressable onPress={onClear}>
          <Octicons name="x" size={18} color="#666" />
        </Pressable>
      )}
    </View>
  );
});
