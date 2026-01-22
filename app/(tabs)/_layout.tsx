import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { ExploreTabProvider, useExploreTabReset } from '@/contexts/explore-tab-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

function TabLayoutContent() {
  const colorScheme = useColorScheme();
  const { triggerReset, setExploreTabActive } = useExploreTabReset();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
        listeners={{
          focus: () => {
            setExploreTabActive(false);
          },
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="safari.fill" color={color} />,
        }}
        listeners={{
          focus: () => {
            setExploreTabActive(true);
          },
          blur: () => {
            setExploreTabActive(false);
          },
          tabPress: (e) => {
            if (triggerReset()) {
              e.preventDefault();
            }
          },
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="plus.circle.fill" color={color} />,
        }}
        listeners={{
          focus: () => {
            setExploreTabActive(false);
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
        listeners={{
          focus: () => {
            setExploreTabActive(false);
          },
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ExploreTabProvider>
      <TabLayoutContent />
    </ExploreTabProvider>
  );
}
