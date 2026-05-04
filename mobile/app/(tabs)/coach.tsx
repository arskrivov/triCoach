/**
 * AI Coach chat screen.
 *
 * Displays conversation history in a chat bubble layout with user messages
 * right-aligned and assistant messages left-aligned. Assistant messages are
 * rendered as Markdown. Suggested prompts are shown when the conversation
 * is empty. A "Clear history" button in the header resets the conversation.
 *
 * Messages are streamed via SSE from `POST /coach/chat` using the
 * `streamChat` utility. Tokens are accumulated into the assistant message
 * in real-time. An AbortController cancels in-flight streams on navigation.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import Markdown from "react-native-markdown-display";

import { api } from "@/lib/api";
import { streamChat } from "@/lib/stream-chat";
import { useThemeColors, type ThemeColors } from "@/lib/theme";
import { extractApiError } from "@/lib/error-handling";
import { Alert } from "@/components/ui/Alert";
import type { ChatMessage } from "@/lib/types";

const SUGGESTED_PROMPTS = [
  "How is my fitness trending?",
  "Skip today's run",
  "What should I do today?",
  "Adjust my plan",
];

// ── Animated typing dots component ─────────────────────────────────────
function TypingDots({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

    const anim1 = createBounce(dot1, 0);
    const anim2 = createBounce(dot2, 150);
    const anim3 = createBounce(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const translateY = (dot: Animated.Value) =>
    dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });

  return (
    <View style={styles.typingDots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            { backgroundColor: color, transform: [{ translateY: translateY(dot) }] },
          ]}
        />
      ))}
    </View>
  );
}

export default function CoachScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch conversation history on mount ──────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<ChatMessage[]>("/coach/history");
      setMessages(res.data);
    } catch (err) {
      // Empty history is fine — only show error for real failures
      const apiErr = extractApiError(err);
      if (apiErr.status !== 404) {
        setError(apiErr.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Abort in-flight stream on unmount / navigation away ──────────────
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Clear history ────────────────────────────────────────────────────
  const clearHistory = useCallback(async () => {
    try {
      abortControllerRef.current?.abort();
      await api.delete("/coach/history");
      setMessages([]);
      setError(null);
    } catch (err) {
      const apiErr = extractApiError(err);
      setError(apiErr.message);
    }
  }, []);

  // ── Configure header with Clear history button ───────────────────────
  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        messages.length > 0 ? (
          <Pressable
            onPress={clearHistory}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear history"
            style={styles.headerButton}
          >
            <Text style={[styles.headerButtonText, { color: colors.destructive }]}>
              Clear
            </Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, messages.length, clearHistory, colors.destructive]);

  // ── Auto-scroll to latest message ────────────────────────────────────
  const scrollToEnd = useCallback(() => {
    // In an inverted FlatList, offset 0 is the bottom (newest messages).
    // scrollToOffset(0) keeps us pinned there as tokens arrive.
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // ── Send message with SSE streaming ──────────────────────────────────
  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || streaming) return;

      setInput("");
      setError(null);

      // Add user message
      const userMsg: ChatMessage = { role: "user", content: messageText };
      setMessages((prev) => [...prev, userMsg]);

      // Add empty assistant message that will be filled by streaming tokens
      const assistantMsg: ChatMessage = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreaming(true);

      // Scroll to show the new messages
      setTimeout(scrollToEnd, 50);

      // Create AbortController for this stream
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulated = "";

      try {
        await streamChat({
          message: messageText,
          onToken: (token) => {
            accumulated += token;
            const current = accumulated;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: current,
              };
              return updated;
            });
            // Auto-scroll as tokens arrive
            scrollToEnd();
          },
          onToolResult: (_result) => {
            // Tool results are already embedded in the token stream as
            // markdown (*✅ result*), so they display inline automatically.
            // The onToolResult callback is available for additional handling
            // if needed (e.g. triggering data refreshes).
          },
          signal: controller.signal,
        });

        // If the stream completed but produced no content, show an error
        if (!accumulated) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "The coach returned an empty response. Please try again.",
            };
            return updated;
          });
        }
      } catch (err: unknown) {
        // Don't show error for intentional aborts (navigation away)
        if ((err as Error).name === "AbortError") return;

        const message =
          err instanceof Error && err.message
            ? err.message
            : "Sorry, something went wrong. Please try again.";

        // If we have partial content, append the error; otherwise replace
        if (accumulated) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: accumulated + "\n\n*⚠️ Stream interrupted: " + message + "*",
            };
            return updated;
          });
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: message,
            };
            return updated;
          });
        }
      } finally {
        setStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [input, streaming, scrollToEnd]
  );

  // ── Markdown styles ──────────────────────────────────────────────────
  const markdownStyles = getMarkdownStyles(colors);

  // ── Render a single chat message ─────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === "user";
      const isEmptyAssistant = !isUser && item.content === "";

      return (
        <View
          style={[
            styles.messageBubbleRow,
            isUser ? styles.messageBubbleRowUser : styles.messageBubbleRowAssistant,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isUser
                ? [
                    styles.messageBubbleUser,
                    { backgroundColor: colors.primary },
                  ]
                : [
                    styles.messageBubbleAssistant,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ],
            ]}
          >
            {isUser ? (
              <Text
                style={[
                  styles.userMessageText,
                  { color: colors.primaryForeground },
                ]}
              >
                {item.content}
              </Text>
            ) : isEmptyAssistant ? (
              // Show typing indicator for empty assistant message (streaming)
              <TypingDots color={colors.mutedForeground} />
            ) : (
              <Markdown style={markdownStyles}>{item.content}</Markdown>
            )}
          </View>
        </View>
      );
    },
    [colors, markdownStyles]
  );

  // ── Empty state with suggested prompts ───────────────────────────────
  const renderEmptyState = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🤖</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          Your personal triathlon coach
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
          Ask about training, recovery, or tell me to adjust your plan.
        </Text>
        <View style={styles.suggestedPromptsContainer}>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt}
              onPress={() => sendMessage(prompt)}
              style={[
                styles.suggestedPrompt,
                { backgroundColor: colors.muted },
              ]}
              accessibilityRole="button"
              accessibilityLabel={prompt}
            >
              <Text
                style={[
                  styles.suggestedPromptText,
                  { color: colors.foreground },
                ]}
              >
                {prompt}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [loading, colors, sendMessage]);

  // ── Key extractor ────────────────────────────────────────────────────
  const keyExtractor = useCallback(
    (_item: ChatMessage, index: number) => `msg-${index}`,
    []
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Error banner */}
      {error ? (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.errorBanner}
        />
      ) : null}

      {/* Message list — inverted FlatList renders last array item at top,
          so we reverse the data so newest messages appear at the bottom
          (which is offset 0 in an inverted list). */}
      <FlatList
        ref={flatListRef}
        data={messages.length > 0 ? [...messages].reverse() : messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.messageListEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        inverted={messages.length > 0}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />

      {/* Input bar */}
      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.cardBorder,
          },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask your coach…"
          placeholderTextColor={colors.mutedForeground}
          editable={!streaming}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={() => sendMessage()}
          blurOnSubmit={false}
          style={[
            styles.textInput,
            {
              backgroundColor: colors.muted,
              color: colors.foreground,
              borderColor: colors.cardBorder,
            },
          ]}
          accessibilityLabel="Message input"
        />
        <Pressable
          onPress={() => sendMessage()}
          disabled={streaming || !input.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[
            styles.sendButton,
            {
              backgroundColor:
                streaming || !input.trim() ? colors.muted : colors.primary,
            },
          ]}
        >
          <Text
            style={[
              styles.sendButtonText,
              {
                color:
                  streaming || !input.trim()
                    ? colors.mutedForeground
                    : colors.primaryForeground,
              },
            ]}
          >
            ↑
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Markdown theme styles ────────────────────────────────────────────────
function getMarkdownStyles(colors: ThemeColors) {
  return {
    body: {
      color: colors.foreground,
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: colors.foreground,
      fontSize: 20,
      fontWeight: "700" as const,
      marginTop: 4,
      marginBottom: 4,
    },
    heading2: {
      color: colors.foreground,
      fontSize: 18,
      fontWeight: "600" as const,
      marginTop: 4,
      marginBottom: 4,
    },
    heading3: {
      color: colors.foreground,
      fontSize: 16,
      fontWeight: "600" as const,
      marginTop: 4,
      marginBottom: 4,
    },
    strong: {
      color: colors.foreground,
      fontWeight: "700" as const,
    },
    em: {
      fontStyle: "italic" as const,
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      marginVertical: 2,
    },
    code_inline: {
      backgroundColor: colors.muted,
      color: colors.foreground,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontSize: 13,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    fence: {
      backgroundColor: colors.muted,
      color: colors.foreground,
      padding: 12,
      borderRadius: 8,
      fontSize: 13,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      marginVertical: 4,
    },
    blockquote: {
      backgroundColor: colors.muted,
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 4,
    },
    link: {
      color: colors.primary,
    },
    paragraph: {
      marginTop: 2,
      marginBottom: 2,
    },
  };
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorBanner: {
    margin: 12,
  },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageListEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  messageBubbleRow: {
    flexDirection: "row",
    marginVertical: 4,
  },
  messageBubbleRowUser: {
    justifyContent: "flex-end",
  },
  messageBubbleRowAssistant: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleUser: {
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  userMessageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  // ── Empty state ──
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  suggestedPromptsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  suggestedPrompt: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minHeight: 44,
    justifyContent: "center",
  },
  suggestedPromptText: {
    fontSize: 14,
  },
  // ── Typing indicator ──
  typingDots: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingVertical: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // ── Input bar ──
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 22,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    fontSize: 20,
    fontWeight: "700",
  },
  // ── Header ──
  headerButton: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
