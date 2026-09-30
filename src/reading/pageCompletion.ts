type ReadingPageCompletionStoreErrorCode = "ignore_store_incompatible" | "ignore_store_unavailable";

class ReadingPageCompletionStoreError extends Error {
    constructor(readonly code: ReadingPageCompletionStoreErrorCode) {
        super(code);
        this.name = "ReadingPageCompletionStoreError";
    }
}

function normalizeIgnoreWords(words: readonly string[]): string[] {
    const normalized = new Set<string>();
    for (const word of words) {
        const value = word.trim().toLowerCase();
        if (value) {
            normalized.add(value);
        }
    }
    return [...normalized];
}

export {
    normalizeIgnoreWords,
    ReadingPageCompletionStoreError,
    type ReadingPageCompletionStoreErrorCode,
};
