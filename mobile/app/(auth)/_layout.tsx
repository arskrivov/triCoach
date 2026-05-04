import { Stack } from "expo-router";

/**
 * Auth layout — simple stack navigator with no tab bar.
 * Shown when the user is not authenticated.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
