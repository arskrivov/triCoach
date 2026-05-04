import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";

import { useThemeColors } from "@/lib/theme";

/**
 * Tab bar icon helper.
 * Renders a FontAwesome icon at the standard tab bar size.
 */
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

/**
 * Tab bar layout with 4 tabs: Dashboard, Workouts, AI Coach, Account.
 *
 * Uses the app theme system for active/inactive tab colours.
 * Active tab is highlighted with the primary colour; inactive tabs
 * use the muted foreground colour.
 *
 * Requirement 4.1: Bottom tab bar with four tabs
 * Requirement 4.2: Each tab displays icon + label
 * Requirement 4.3: Active tab is highlighted
 */
export default function TabLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.cardBorder,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="bar-chart" color={color} />
          ),
          tabBarLabel: "Dashboard",
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: "Workouts",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="heartbeat" color={color} />
          ),
          tabBarLabel: "Workouts",
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "AI Coach",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="comments" color={color} />
          ),
          tabBarLabel: "AI Coach",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
          tabBarLabel: "Account",
        }}
      />
      {/* Hide boilerplate screens from tab bar */}
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
