import { describe, expect, it, vi } from "vitest";

import {
    clearReadingSelection,
    extractReadingSelection,
    findEnclosingSentenceText,
    getSelectableElement,
    ReadingSelectionCoordinator,
    resolveReadingSelection,
    wrapReadingSelection,
} from "@/reading/readingSelection";

describe("readingSelection: sentence and selection extraction", () => {
    it("returns null when node is null or outside .stns container", () => {
        expect(findEnclosingSentenceText(null)).toBeNull();

        const div = document.createElement("div");
        const span = document.createElement("span");
        div.appendChild(span);
        expect(findEnclosingSentenceText(span)).toBeNull();
    });

    it("extracts and normalizes sentence text from .stns ancestor", () => {
        const sentence = document.createElement("span");
        sentence.className = "stns";
        const w1 = document.createElement("span");
        w1.className = "word";
        w1.textContent = "First";
        sentence.appendChild(w1);
        sentence.appendChild(document.createTextNode("   \n\t  second   "));

        expect(findEnclosingSentenceText(w1)).toBe("First second");
    });

    it("extracts reading selection when expression and sentence exist", () => {
        const sentence = document.createElement("span");
        sentence.className = "stns";
        const w1 = document.createElement("span");
        w1.className = "word";
        w1.textContent = "leverage";
        sentence.appendChild(document.createTextNode("High "));
        sentence.appendChild(w1);
        sentence.appendChild(document.createTextNode(" architecture."));

        expect(extractReadingSelection(w1, "  leverage  ", "doc.md")).toEqual({
            expression: "leverage",
            sentenceText: "High leverage architecture.",
            origin: "doc.md",
        });
        expect(extractReadingSelection(w1, "   ", "doc.md")).toBeNull();
    });

    it("resolves reading selection directly from select span", () => {
        const sentence = document.createElement("span");
        sentence.className = "stns";
        const selectSpan = document.createElement("span");
        selectSpan.className = "select";
        selectSpan.textContent = "phrase text";
        sentence.appendChild(selectSpan);

        const resolved = resolveReadingSelection(selectSpan, "source.md");
        expect(resolved.text).toBe("phrase text");
        expect(resolved.selection).toEqual({
            expression: "phrase text",
            sentenceText: "phrase text",
            origin: "source.md",
        });
    });
});

describe("readingSelection: DOM wrapping and clearing", () => {
    function createSentenceDom() {
        const container = document.createElement("div");
        const sentence = document.createElement("span");
        sentence.className = "stns";

        const w1 = document.createElement("span");
        w1.className = "word";
        w1.textContent = "One";

        const space1 = document.createTextNode(" ");

        const w2 = document.createElement("span");
        w2.className = "word";
        w2.textContent = "two";

        const space2 = document.createTextNode(" ");

        const w3 = document.createElement("span");
        w3.className = "word";
        w3.textContent = "three";

        sentence.appendChild(w1);
        sentence.appendChild(space1);
        sentence.appendChild(w2);
        sentence.appendChild(space2);
        sentence.appendChild(w3);
        container.appendChild(sentence);

        return { container, sentence, w1, space1, w2, space2, w3 };
    }

    it("returns null when start or end is not in .stns or from different sentences", () => {
        const { w1 } = createSentenceDom();
        const orphan = document.createElement("span");
        orphan.className = "word";

        expect(wrapReadingSelection(w1, orphan)).toBeNull();

        const sentence2 = document.createElement("span");
        sentence2.className = "stns";
        const wOther = document.createElement("span");
        wOther.className = "word";
        sentence2.appendChild(wOther);

        expect(wrapReadingSelection(w1, wOther)).toBeNull();
    });

    it('wraps a single word in <span class="select">', () => {
        const { container, sentence, w1 } = createSentenceDom();
        const selectSpan = wrapReadingSelection(w1, w1, container);

        expect(selectSpan).not.toBeNull();
        expect(selectSpan?.className).toBe("select");
        expect(selectSpan?.textContent).toBe("One");
        expect(selectSpan?.parentElement).toBe(sentence);
        expect(w1.parentElement).toBe(selectSpan);
    });

    it("wraps multiple words in forward order", () => {
        const { container, sentence, w1, w3 } = createSentenceDom();
        const selectSpan = wrapReadingSelection(w1, w3, container);

        expect(selectSpan).not.toBeNull();
        expect(selectSpan?.textContent).toBe("One two three");
        expect(selectSpan?.parentElement).toBe(sentence);
        expect(sentence.children.length).toBe(1);
        expect(sentence.children[0]).toBe(selectSpan);
    });

    it("normalizes backwards selection (when dragged right-to-left)", () => {
        const { container, sentence, w1, w3 } = createSentenceDom();
        // Drag from w3 back to w1
        const selectSpan = wrapReadingSelection(w3, w1, container);

        expect(selectSpan).not.toBeNull();
        expect(selectSpan?.textContent).toBe("One two three");
        expect(selectSpan?.parentElement).toBe(sentence);
        expect(sentence.children.length).toBe(1);
        expect(sentence.children[0]).toBe(selectSpan);
    });

    it("clears and unwraps previous selection completely restoring DOM order", () => {
        const { container, sentence, w1, w2, w3 } = createSentenceDom();
        wrapReadingSelection(w1, w2, container);
        expect(sentence.querySelector(".select")).not.toBeNull();

        clearReadingSelection(container);
        expect(sentence.querySelector(".select")).toBeNull();

        // Check restored order
        const textNodesAndSpans = Array.from(sentence.childNodes);
        expect(textNodesAndSpans[0]).toBe(w1);
        expect(textNodesAndSpans[2]).toBe(w2);
        expect(textNodesAndSpans[4]).toBe(w3);
        expect(sentence.textContent).toBe("One two three");
    });
});

describe("ReadingSelectionCoordinator", () => {
    function setupDom() {
        const container = document.createElement("div");
        const sentence = document.createElement("span");
        sentence.className = "stns";

        const w1 = document.createElement("span");
        w1.className = "word";
        w1.textContent = "Alpha";

        const space = document.createTextNode(" ");

        const w2 = document.createElement("span");
        w2.className = "word";
        w2.textContent = "Beta";

        sentence.appendChild(w1);
        sentence.appendChild(space);
        sentence.appendChild(w2);
        container.appendChild(sentence);

        const outside = document.createElement("div");
        outside.className = "outside-area";
        container.appendChild(outside);

        return { container, sentence, w1, w2, outside };
    }

    it("identifies selectable elements and child nodes", () => {
        const { w1, outside } = setupDom();
        expect(getSelectableElement(w1)).toBe(w1);
        expect(getSelectableElement(outside)).toBeNull();

        const textChild = document.createElement("b");
        w1.appendChild(textChild);
        expect(getSelectableElement(textChild)).toBe(w1);
    });

    it("handles desktop pointer down and up flow", () => {
        const { container, w1, w2, outside } = setupDom();
        const onSelect = vi.fn();
        const coordinator = new ReadingSelectionCoordinator({
            getContainer: () => container,
            getDocumentOrigin: () => "chapter1.md",
            onSelect,
        });

        coordinator.handlePointerDown(w1);
        const handled = coordinator.handlePointerUp(w2, { x: 100, y: 200 });

        expect(handled).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith({
            text: "Alpha Beta",
            selection: {
                expression: "Alpha Beta",
                sentenceText: "Alpha Beta",
                origin: "chapter1.md",
            },
            point: { x: 100, y: 200 },
        });

        // Pointer up outside clears selection
        coordinator.handlePointerDown(w1);
        const outsideHandled = coordinator.handlePointerUp(outside, { x: 0, y: 0 });
        expect(outsideHandled).toBe(false);
        expect(container.querySelector(".select")).toBeNull();
    });

    it("handles mobile click flow with 2-tap range selection", () => {
        const { container, w1, w2, outside } = setupDom();
        const onSelect = vi.fn();
        const coordinator = new ReadingSelectionCoordinator({
            getContainer: () => container,
            getDocumentOrigin: () => "notes.md",
            onSelect,
        });

        // First tap sets anchor
        const firstTap = coordinator.handleMobileClick(w1, { x: 50, y: 50 });
        expect(firstTap).toBe(false);
        expect(onSelect).not.toHaveBeenCalled();

        // Second tap wraps and selects
        const secondTap = coordinator.handleMobileClick(w2, { x: 80, y: 50 });
        expect(secondTap).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({
                text: "Alpha Beta",
                point: { x: 80, y: 50 },
            })
        );

        // Click outside clears anchor and selection
        coordinator.handleMobileClick(w1, { x: 50, y: 50 });
        const outsideTap = coordinator.handleMobileClick(outside, { x: 0, y: 0 });
        expect(outsideTap).toBe(false);
        expect(container.querySelector(".select")).toBeNull();
    });

    it("clears anchor and DOM selection when clear() is invoked", () => {
        const { container, w1 } = setupDom();
        const coordinator = new ReadingSelectionCoordinator({
            getContainer: () => container,
            getDocumentOrigin: () => "test.md",
            onSelect: vi.fn(),
        });

        coordinator.handlePointerDown(w1);
        coordinator.handlePointerUp(w1, { x: 10, y: 10 });
        expect(container.querySelector(".select")).not.toBeNull();

        coordinator.clear();
        expect(container.querySelector(".select")).toBeNull();
    });
});
