/**
 * Account screen — Athlete profile and app logout.
 *
 * Shows athlete profile form and a logout button at the bottom.
 * Garmin connection is handled on the dashboard (one-time onboarding).
 */

import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AthleteProfileForm } from "@/components/account/AthleteProfileForm";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useThemeColors } from "@/lib/theme";

export default function AccountScreen() {
  const colors = useThemeColors();
  const { signOut } = useAuth();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AthleteProfileForm />

        <View style={styles.logoutSection}>
          <Button
            title="Log Out"
            onPress={signOut}
            variant="destructive"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  logoutSection: { marginTop: 24 },
});
