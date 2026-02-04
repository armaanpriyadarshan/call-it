import React from "react";
import { Animated, View } from "react-native";

interface ProgressBarProps {
  duration: number;
  isRunning: boolean;
  onComplete: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  duration = 4000,
  isRunning,
  onComplete,
}) => {
  const progress = React.useRef(new Animated.Value(0)).current;
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    if (isRunning) {
      progress.setValue(0);
      animationRef.current = Animated.timing(progress, {
        toValue: 1,
        duration,
        useNativeDriver: false,
      });
      animationRef.current.start(({ finished }) => {
        if (finished) {
          onComplete();
        }
      });
    } else {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      progress.setValue(0);
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [isRunning, duration, onComplete, progress]);

  const widthInterpolation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      style={{
        height: 2,
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        width: "100%",
      }}
    >
      <Animated.View
        style={{
          height: "100%",
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          width: widthInterpolation,
        }}
      />
    </View>
  );
};
