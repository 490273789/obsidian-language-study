import { describe, expect, it } from "vitest";

import { extractReadingSelection, findEnclosingSentenceText } from "@/reading/readingContext";

describe("findEnclosingSentenceText", () => {
    it("returns null when node is null", () => {
        expect(findEnclosingSentenceText(null)).toBeNull();
    });

    it("returns null when node is not inside a .stns container", () => {
        const div = document.createElement("div");
        const span = document.createElement("span");
        span.textContent = "Isolated word";
        div.appendChild(span);

        expect(findEnclosingSentenceText(span)).toBeNull();
    });

    it("extracts and normalizes sentence text from ancestor with .stns class", () => {
        const sentenceSpan = document.createElement("span");
        sentenceSpan.className = "stns";

        const word1 = document.createElement("span");
        word1.className = "word new";
        word1.textContent = "Hello";

        const space = document.createTextNode("   \n\t  ");

        const word2 = document.createElement("span");
        word2.className = "word known";
        word2.textContent = "world.";

        sentenceSpan.appendChild(word1);
        sentenceSpan.appendChild(space);
        sentenceSpan.appendChild(word2);

        expect(findEnclosingSentenceText(word1)).toBe("Hello world.");
        expect(findEnclosingSentenceText(word2)).toBe("Hello world.");
    });

    it("handles deeply nested elements such as select wraps", () => {
        const sentenceSpan = document.createElement("span");
        sentenceSpan.className = "stns";

        const selectSpan = document.createElement("span");
        selectSpan.className = "select";

        const phraseSpan = document.createElement("span");
        phraseSpan.className = "phrase learning";

        const innerWord = document.createElement("span");
        innerWord.className = "word";
        innerWord.textContent = "turn on";

        phraseSpan.appendChild(innerWord);
        selectSpan.appendChild(phraseSpan);
        sentenceSpan.appendChild(selectSpan);

        const punctuation = document.createTextNode(" the light.");
        sentenceSpan.appendChild(punctuation);

        expect(findEnclosingSentenceText(innerWord)).toBe("turn on the light.");
    });
});

describe("extractReadingSelection", () => {
    it("returns null when expression is empty", () => {
        const sentenceSpan = document.createElement("span");
        sentenceSpan.className = "stns";
        sentenceSpan.textContent = "Valid sentence.";

        expect(extractReadingSelection(sentenceSpan, "   ", "doc.md")).toBeNull();
    });

    it("returns null when no enclosing sentence exists", () => {
        const isolatedSpan = document.createElement("span");
        isolatedSpan.textContent = "detached";

        expect(extractReadingSelection(isolatedSpan, "detached", "doc.md")).toBeNull();
    });

    it("returns structured ReadingSelection when valid", () => {
        const sentenceSpan = document.createElement("span");
        sentenceSpan.className = "stns";
        const word = document.createElement("span");
        word.className = "word";
        word.textContent = "architecture";
        sentenceSpan.appendChild(document.createTextNode("Deep "));
        sentenceSpan.appendChild(word);
        sentenceSpan.appendChild(document.createTextNode(" is testable."));

        const selection = extractReadingSelection(word, "architecture", "Software Design");

        expect(selection).toEqual({
            expression: "architecture",
            sentenceText: "Deep architecture is testable.",
            origin: "Software Design",
        });
    });
});
