import React from "react";
import { Animated, View } from "react-native";

interface ProgressBarProps {
  duration: number;
  isRunning: boolean;
  isPaused?: boolean;
  onComplete: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  duration = 4000,
  isRunning,
  isPaused = false,
  onComplete,
}) => {
  const progress = React.useRef(new Animated.Value(0)).current;
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const currentProgressRef = React.useRef(0);
  const startTimeRef = React.useRef<number | null>(null);

  // Track current progress value
  React.useEffect(() => {
    const listenerId = progress.addListener(({ value }) => {
      currentProgressRef.current = value;
    });
    return () => {
      progress.removeListener(listenerId);
    };
  }, [progress]);

  // Handle running state
  React.useEffect(() => {
    if (isRunning && !isPaused) {
      // Calculate remaining duration based on current progress
      const remainingProgress = 1 - currentProgressRef.current;
      const remainingDuration = remainingProgress * duration;

      if (remainingDuration <= 0) {
        onComplete();
        return;
      }

      startTimeRef.current = Date.now();
      animationRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: remainingDuration,
        useNativeDriver: false,
      });
      animationRef.current.start(({ finished }) => {
        if (finished) {
          onComplete();
        }
      });
    } else if (isRunning && isPaused) {
      // Pause: stop the animation but keep current progress
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    } else {
      // Not running: reset everything
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      progress.setValue(0);
      currentProgressRef.current = 0;
      startTimeRef.current = null;
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [isRunning, isPaused, duration, onComplete, progress]);

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
