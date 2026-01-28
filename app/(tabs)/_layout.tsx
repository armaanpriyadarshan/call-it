import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { ExploreTabProvider, useExploreTabReset } from '@/contexts/explore-tab-context';
import { ProfileTabProvider, useProfileTabReset } from '@/contexts/profile-tab-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEnsureProfile } from '@/hooks/use-ensure-profile';

function TabLayoutContent() {
  const colorScheme = useColorScheme();
  const { triggerReset: triggerExploreReset, setExploreTabActive } = useExploreTabReset();
  const { triggerReset: triggerProfileReset, setProfileTabActive } = useProfileTabReset();

  useEnsureProfile();

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
            setProfileTabActive(false);
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
            setProfileTabActive(false);
          },
          blur: () => {
            setExploreTabActive(false);
          },
          tabPress: (e) => {
            if (triggerExploreReset()) {
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
            setProfileTabActive(false);
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
            setProfileTabActive(true);
            setExploreTabActive(false);
          },
          blur: () => {
            setProfileTabActive(false);
          },
          tabPress: (e) => {
            if (triggerProfileReset()) {
              e.preventDefault();
            }
          },
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ExploreTabProvider>
      <ProfileTabProvider>
        <TabLayoutContent />
      </ProfileTabProvider>
    </ExploreTabProvider>
  );
}
