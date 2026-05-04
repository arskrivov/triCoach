/**
 * Property-based tests for Markdown rendering in assistant chat messages.
 *
 * **Validates: Requirements 7.3**
 *
 * Property 4: Assistant messages render as formatted Markdown
 *
 * *For any* valid Markdown string in an assistant chat message, the rendered
 * output SHALL contain the formatted content (headings, bold, lists, code)
 * rather than raw Markdown syntax characters.
 *
 * Tests the `react-native-markdown-display` component in isolation to verify
 * that Markdown syntax is processed and the text content is rendered without
 * raw syntax markers.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import * as fc from "fast-check";
import Markdown from "react-native-markdown-display";

// ---------------------------------------------------------------------------
// Arbitraries — generate Markdown fragments with known text content
// ---------------------------------------------------------------------------

/**
 * Generates a non-empty word consisting of lowercase alphanumeric characters.
 * We avoid special characters that could interfere with Markdown parsing.
 */
const arbWord: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 2,
    maxLength: 12,
  })
  .map((chars) => chars.join(""));

/**
 * Generates a short phrase of 2-4 words joined by spaces.
 */
const arbPhrase: fc.Arbitrary<string> = fc
  .array(arbWord, { minLength: 2, maxLength: 4 })
  .map((words) => words.join(" "));

/**
 * Generates a Markdown heading (# to ###) with known text content.
 * Returns { markdown, textContent } so we can verify the text is present.
 */
const arbHeading: fc.Arbitrary<{ markdown: string; textContent: string }> = fc
  .tuple(fc.integer({ min: 1, max: 3 }), arbPhrase)
  .map(([level, text]) => ({
    markdown: `${"#".repeat(level)} ${text}`,
    textContent: text,
  }));

/**
 * Generates bold Markdown (**text**) with known text content.
 */
const arbBold: fc.Arbitrary<{ markdown: string; textContent: string }> = arbPhrase.map(
  (text) => ({
    markdown: `**${text}**`,
    textContent: text,
  })
);

/**
 * Generates a Markdown unordered list with 1-3 items.
 * Returns the full markdown and the individual item texts.
 */
const arbList: fc.Arbitrary<{ markdown: string; textContents: string[] }> = fc
  .array(arbPhrase, { minLength: 1, maxLength: 3 })
  .map((items) => ({
    markdown: items.map((item) => `- ${item}`).join("\n"),
    textContents: items,
  }));

/**
 * Generates an inline code snippet (`code`).
 */
const arbInlineCode: fc.Arbitrary<{ markdown: string; textContent: string }> =
  arbWord.map((text) => ({
    markdown: `\`${text}\``,
    textContent: text,
  }));

/**
 * Generates a fenced code block with known content.
 */
const arbCodeBlock: fc.Arbitrary<{ markdown: string; textContent: string }> =
  arbWord.map((text) => ({
    markdown: `\`\`\`\n${text}\n\`\`\``,
    textContent: text,
  }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts all text content from the rendered component tree by walking
 * the toJSON() output. The toJSON() tree uses `children` (not `props.children`)
 * for child nodes, and string children represent visible text.
 */
function getAllTextContent(root: ReturnType<typeof render>): string {
  const texts: string[] = [];

  function walk(node: any) {
    if (typeof node === "string") {
      texts.push(node);
      return;
    }
    if (node?.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(root.toJSON());
  return texts.join(" ");
}

// ---------------------------------------------------------------------------
// Markdown style (minimal, matching coach screen pattern)
// ---------------------------------------------------------------------------

const markdownStyles = {
  body: { color: "#0a0a0a", fontSize: 15 },
  heading1: { color: "#0a0a0a", fontSize: 20, fontWeight: "700" as const },
  heading2: { color: "#0a0a0a", fontSize: 18, fontWeight: "600" as const },
  heading3: { color: "#0a0a0a", fontSize: 16, fontWeight: "600" as const },
  strong: { fontWeight: "700" as const },
  code_inline: { backgroundColor: "#f5f5f5", fontSize: 13 },
  fence: { backgroundColor: "#f5f5f5", fontSize: 13 },
};

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("Markdown Rendering - Property Tests", () => {
  /**
   * **Property 4: Assistant messages render as formatted Markdown**
   *
   * *For any* valid Markdown string in an assistant chat message, the rendered
   * output SHALL contain the formatted content (headings, bold, lists, code)
   * rather than raw Markdown syntax characters.
   *
   * **Validates: Requirements 7.3**
   */
  describe("Property 4: Assistant messages render as formatted Markdown", () => {
    it("headings render text content without # syntax markers", () => {
      fc.assert(
        fc.property(arbHeading, ({ markdown, textContent }) => {
          const result = render(
            <Markdown style={markdownStyles}>{markdown}</Markdown>
          );

          const allText = getAllTextContent(result);

          // The heading text content MUST be present in the rendered output
          expect(allText).toContain(textContent);

          // Raw # markers at the start of lines should NOT appear as visible text.
          // The Markdown component converts these to styled heading elements.
          const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            expect(line).not.toMatch(/^#{1,3}\s/);
          }

          result.unmount();
        }),
        { numRuns: 100 }
      );
    });

    it("bold text renders content without ** syntax markers", () => {
      fc.assert(
        fc.property(arbBold, ({ markdown, textContent }) => {
          const result = render(
            <Markdown style={markdownStyles}>{markdown}</Markdown>
          );

          const allText = getAllTextContent(result);

          // The bold text content MUST be present
          expect(allText).toContain(textContent);

          // Raw ** markers should NOT appear in the rendered text
          expect(allText).not.toContain("**");

          result.unmount();
        }),
        { numRuns: 100 }
      );
    });

    it("unordered list items render content without - syntax markers", () => {
      fc.assert(
        fc.property(arbList, ({ markdown, textContents }) => {
          const result = render(
            <Markdown style={markdownStyles}>{markdown}</Markdown>
          );

          const allText = getAllTextContent(result);

          // Each list item's text content MUST be present
          for (const itemText of textContents) {
            expect(allText).toContain(itemText);
          }

          // The raw "- " list marker pattern should not appear.
          // The Markdown renderer converts these to bullet characters (·)
          // or styled list items. We verify the original dash-space pattern
          // is not present as a line prefix.
          const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            expect(line).not.toMatch(/^- [a-z0-9]/);
          }

          result.unmount();
        }),
        { numRuns: 100 }
      );
    });

    it("inline code renders content without backtick syntax markers", () => {
      fc.assert(
        fc.property(arbInlineCode, ({ markdown, textContent }) => {
          const result = render(
            <Markdown style={markdownStyles}>{markdown}</Markdown>
          );

          const allText = getAllTextContent(result);

          // The code text content MUST be present
          expect(allText).toContain(textContent);

          // Raw backtick markers should NOT appear in the rendered text
          expect(allText).not.toContain("`");

          result.unmount();
        }),
        { numRuns: 100 }
      );
    });

    it("fenced code blocks render content without ``` syntax markers", () => {
      fc.assert(
        fc.property(arbCodeBlock, ({ markdown, textContent }) => {
          const result = render(
            <Markdown style={markdownStyles}>{markdown}</Markdown>
          );

          const allText = getAllTextContent(result);

          // The code block content MUST be present
          expect(allText).toContain(textContent);

          // Raw ``` fence markers should NOT appear in the rendered text
          expect(allText).not.toContain("```");

          result.unmount();
        }),
        { numRuns: 100 }
      );
    });

    it("mixed Markdown content renders all text without any raw syntax", () => {
      fc.assert(
        fc.property(
          arbHeading,
          arbBold,
          arbList,
          arbInlineCode,
          (heading, bold, list, inlineCode) => {
            // Compose a realistic assistant message with multiple Markdown elements
            const markdown = [
              heading.markdown,
              "",
              `This is ${bold.markdown} text.`,
              "",
              list.markdown,
              "",
              `Use ${inlineCode.markdown} for that.`,
            ].join("\n");

            const result = render(
              <Markdown style={markdownStyles}>{markdown}</Markdown>
            );

            const allText = getAllTextContent(result);

            // All text content MUST be present
            expect(allText).toContain(heading.textContent);
            expect(allText).toContain(bold.textContent);
            for (const itemText of list.textContents) {
              expect(allText).toContain(itemText);
            }
            expect(allText).toContain(inlineCode.textContent);

            // No raw Markdown syntax should be visible
            expect(allText).not.toContain("**");
            expect(allText).not.toContain("`");
            const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);
            for (const line of lines) {
              expect(line).not.toMatch(/^#{1,3}\s/);
            }

            result.unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
