import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

/**
 * Root layout — loads fonts, hides splash screen once auth is resolved,
 * then wraps the app in AuthProvider and ThemeProvider.
 *
 * Auth gating is implemented with `<Stack.Protected guard={...}>` per the
 * Expo Router v5+ recommended pattern — this prevents protected routes
 * from mounting at all while unauthenticated, eliminating the race that
 * would otherwise let tab screens render briefly before the redirect
 * kicks in.
 */
export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

/**
 * Inner navigation component that reads auth state and renders a
 * Stack with protected route groups. While auth is still loading,
 * shows a centered spinner and keeps the splash screen visible.
 *
 * Requirement 4.5: While the user is not authenticated, the
 * Navigation_Shell SHALL not be visible and the auth screens
 * SHALL be shown instead.
 */
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  // Hide the splash screen only after both fonts and auth state are ready.
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack.Protected>

        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
