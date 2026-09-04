export type ReadingSelection = Readonly<{
    expression: string;
    sentenceText: string;
    origin: string;
}>;

export function findEnclosingSentenceText(node: Node | null): string | null {
    if (!node) {
        return null;
    }
    let current: Element | null = node instanceof Element ? node : node.parentElement;

    while (current) {
        if (current.classList?.contains("stns")) {
            const raw = current.textContent ?? "";
            const normalized = raw.replace(/\s+/g, " ").trim();
            return normalized.length > 0 ? normalized : null;
        }
        current = current.parentElement;
    }
    return null;
}

export function extractReadingSelection(
    node: Node | null,
    expression: string,
    origin: string
): ReadingSelection | null {
    const trimmedExpression = expression.trim();
    if (!trimmedExpression) {
        return null;
    }
    const sentenceText = findEnclosingSentenceText(node);
    if (!sentenceText) {
        return null;
    }
    return {
        expression: trimmedExpression,
        sentenceText,
        origin: origin.trim(),
    };
}
