import { describe, expect, it } from "vitest";

import { parseTranslationFromHtml, translateSentence } from "@/dictionary/translation";

describe("parseTranslationFromHtml", () => {
    it("returns empty string when html is empty", () => {
        expect(parseTranslationFromHtml("")).toBe("");
    });

    it("extracts the second paragraph text from translation HTML", () => {
        const html = "<p>Original Text</p><p>这是翻译文本</p>";
        expect(parseTranslationFromHtml(html)).toBe("这是翻译文本");
    });

    it("returns empty string when there is only one paragraph", () => {
        const html = "<p>Only one paragraph</p>";
        expect(parseTranslationFromHtml(html)).toBe("");
    });
});

describe("translateSentence", () => {
    it("returns empty string immediately for whitespace input without invoking engine", async () => {
        let called = false;
        const fakeEngine = async () => {
            called = true;
            return null;
        };

        const result = await translateSentence("   ", fakeEngine);
        expect(result).toBe("");
        expect(called).toBe(false);
    });

    it("extracts translation when engine returns valid payload", async () => {
        const fakeEngine = async (text: string) => {
            return {
                result: {
                    translation: `<p>${text}</p><p>架构深度非常高。</p>`,
                },
            };
        };

        const result = await translateSentence("Architecture depth is high.", fakeEngine);
        expect(result).toBe("架构深度非常高。");
    });

    it("returns empty string when engine throws or returns unexpected shape", async () => {
        const throwingEngine = async () => {
            throw new Error("Network offline");
        };
        expect(await translateSentence("Test sentence", throwingEngine)).toBe("");

        const emptyEngine = async () => null;
        expect(await translateSentence("Test sentence", emptyEngine)).toBe("");
    });
});
