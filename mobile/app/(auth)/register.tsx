import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useThemeColors } from "@/lib/theme";
import { extractApiError } from "@/lib/error-handling";

/**
 * Register screen — name (optional), email, password inputs,
 * "Create account" button, link to login, and inline error display.
 *
 * On successful registration the auth state change in the root layout
 * handles navigation to the dashboard.
 *
 * @see Requirements 2.7, 2.8, 2.9, 2.10
 */
export default function RegisterScreen() {
  const colors = useThemeColors();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError("");
    setLoading(true);

    try {
      await signUp(email, password, name || undefined);
      // Navigation is handled by auth state change in root layout
    } catch (err) {
      const apiError = extractApiError(err);
      setError(apiError.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              <Text style={styles.titleForeground}>Personal </Text>
              <Text style={styles.titlePrimary}>Coach</Text>
            </Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Alex"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.buttonText}>Create account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.linkRow}>
              <Text style={styles.linkText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.link}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 24,
      maxWidth: 400,
      width: "100%",
      alignSelf: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 4,
    },
    titleForeground: {
      color: colors.foreground,
    },
    titlePrimary: {
      color: colors.primary,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
    },
    form: {
      gap: 16,
    },
    field: {
      gap: 6,
    },
    label: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.foreground,
    },
    input: {
      height: 44,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    error: {
      fontSize: 14,
      color: colors.statusNegative,
    },
    button: {
      height: 44,
      backgroundColor: colors.primary,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryForeground,
    },
    linkRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    linkText: {
      fontSize: 14,
      color: colors.mutedForeground,
    },
    link: {
      fontSize: 14,
      color: colors.primary,
      textDecorationLine: "underline",
    },
  });
}
