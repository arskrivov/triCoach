/**
 * Account screen — Garmin connection management and athlete profile.
 *
 * Composes GarminConnectCard and AthleteProfileForm in a ScrollView
 * with pull-to-refresh support.
 *
 * @see Requirements 12.1, 12.7
 */

import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GarminConnectCard } from "@/components/account/GarminConnectCard";
import { AthleteProfileForm } from "@/components/account/AthleteProfileForm";
import { useThemeColors } from "@/lib/theme";

export default function AccountScreen() {
  const colors = useThemeColors();

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
        <GarminConnectCard />
        <AthleteProfileForm />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
});
