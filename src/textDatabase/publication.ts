import { t } from "@/lang/helper";
import type { ExpressionInfo, ExpressionInfoSimple } from "@/db/interface";

type TextDatabaseTarget = "word" | "review";
type CompletionReloadResult = { status: "reloaded" | "skipped" | "failed" | "closed" };
type PublicationFailureStage = "settings" | "target" | "source" | "render" | "write";
type TextDatabasePublicationResult =
    | {
          target: TextDatabaseTarget;
          status: "skipped" | "invalidTarget" | "emptySource" | "pathConflict" | "closed";
      }
    | { target: TextDatabaseTarget; status: "failed"; stage: PublicationFailureStage }
    | {
          target: TextDatabaseTarget;
          status: "published";
          completionReload?: CompletionReloadResult;
      };
type TextDatabasePublicationStatus = TextDatabasePublicationResult["status"];

type TextDatabasePublicationAllResult = {
    word: TextDatabasePublicationResult;
    review: TextDatabasePublicationResult;
};

type TextDatabasePublicationSettings = {
    wordDatabasePath: string;
    reviewDatabasePath: string;
    colDelimiter: "," | "\t" | "|";
    reviewDelimiter: string;
};

type ExpressionStore = {
    getAllExpressionSimple(ignores?: boolean): Promise<ExpressionInfoSimple[]>;
    getExpressionAfter(time: string): Promise<ExpressionInfo[]>;
};

type TextDatabaseVault<FileRef> = {
    getFile(path: string): FileRef | null;
    getPath(file: FileRef): string;
    process(file: FileRef, transform: (text: string) => string): Promise<void | string>;
    write(file: FileRef, text: string): Promise<void>;
};

type CompletionReloader = {
    reloadCustomDictionaries(): void | boolean | Promise<void | boolean>;
};

type TextDatabasePublicationDependencies<FileRef> = {
    getSettings(): TextDatabasePublicationSettings;
    expressionStore: ExpressionStore;
    vault: TextDatabaseVault<FileRef>;
    completionReloader: CompletionReloader;
};

const REVIEW_CUTOFF = "1970-01-01T00:00:00Z";

function renderWordDatabase(
    words: ExpressionInfoSimple[],
    delimiter: TextDatabasePublicationSettings["colDelimiter"]
): string {
    const classified: number[][] = Array(5)
        .fill(0)
        .map((): number[] => []);
    words.forEach((word, index) => {
        classified[word.status].push(index);
    });

    const statusMap = [t("Ignore"), t("Learning"), t("Familiar"), t("Known"), t("Learned")];

    const classifiedTexts = classified.map((entries, index) => {
        return (
            `#### ${statusMap[index]}\n` +
            entries
                .map((wordIndex) => {
                    const word = words[wordIndex];
                    return `${word.expression}${delimiter}    ${word.meaning}`;
                })
                .join("\n") +
            "\n"
        );
    });
    classifiedTexts.shift();
    const wordToMeaning = classifiedTexts.join("\n");

    const meaningToWord = classified
        .flat()
        .map((wordIndex) => {
            const word = words[wordIndex];
            return `${word.meaning}  ${delimiter}  ${word.expression}`;
        })
        .join("\n");

    return `${wordToMeaning}\n\n#### \u53cd\u5411\u67e5\u8be2\n${meaningToWord}`;
}

function parseReviewRecords(text: string): Record<string, string> {
    // Null-prototype storage also supports valid expressions such as "constructor".
    const records: Record<string, string> = Object.create(null);
    for (const block of text.split(/^#word[ \t]*\r?$/m).slice(1)) {
        const heading = block.match(/^#### ([^\r\n]+)\r?$/m);
        const comments = block.match(/<!--SR\b[\s\S]*?-->/g);
        if (heading && comments?.length) records[heading[1]] = comments[comments.length - 1];
    }
    return records;
}

function renderReviewDatabase(
    expressions: ExpressionInfo[],
    reviewDelimiter: TextDatabasePublicationSettings["reviewDelimiter"],
    oldRecord: Record<string, string>
): string {
    const body =
        expressions
            .map((word) => {
                const notes =
                    word.notes.length === 0 ? "" : `**Notes**:\n${word.notes.join("\n").trim()}\n`;
                const sentences =
                    word.sentences.length === 0
                        ? ""
                        : "**Sentences**:\n" +
                          word.sentences
                              .map((sentence) => {
                                  return (
                                      `*${sentence.text.trim()}*` +
                                      "\n" +
                                      (sentence.trans ? `${sentence.trans.trim()}\n` : "") +
                                      (sentence.origin ? sentence.origin.trim() : "")
                                  );
                              })
                              .join("\n")
                              .trim() +
                          "\n";

                return (
                    "#word\n" +
                    `#### ${word.expression}\n` +
                    `${reviewDelimiter}\n` +
                    `${word.meaning}\n` +
                    notes +
                    sentences +
                    (oldRecord[word.expression] ? `${oldRecord[word.expression]}\n` : "")
                );
            })
            .join("\n") + "\n";

    return `#flashcards\n\n${body}`;
}

class TextDatabasePublication<FileRef> {
    private readonly tails = new Map<string, Promise<void>>();
    private readonly pending = new Set<Promise<unknown>>();
    private closed = false;
    private closePromise: Promise<void> | null = null;

    constructor(private readonly dependencies: TextDatabasePublicationDependencies<FileRef>) {}

    async publishAll(): Promise<TextDatabasePublicationAllResult> {
        if (this.closed)
            return {
                word: { target: "word", status: "closed" },
                review: { target: "review", status: "closed" },
            };
        let settings: TextDatabasePublicationSettings;
        try {
            settings = { ...this.dependencies.getSettings() };
        } catch {
            return {
                word: { target: "word", status: "failed", stage: "settings" },
                review: { target: "review", status: "failed", stage: "settings" },
            };
        }
        const [word, review] = await Promise.all([
            this.publish("word", settings),
            this.publish("review", settings),
        ]);
        return { word, review };
    }

    publishWordDatabase(): Promise<TextDatabasePublicationResult> {
        return this.request("word");
    }
    publishReviewDatabase(): Promise<TextDatabasePublicationResult> {
        return this.request("review");
    }

    retryCompletionReload(): Promise<CompletionReloadResult> {
        if (this.closed) return Promise.resolve({ status: "closed" });
        return this.enqueue(["target:word"], () => this.reloadCompletion());
    }

    close(): Promise<void> {
        this.closed = true;
        this.closePromise ??= Promise.allSettled([...this.pending]).then(() => undefined);
        return this.closePromise;
    }

    private request(target: TextDatabaseTarget): Promise<TextDatabasePublicationResult> {
        if (this.closed) return Promise.resolve({ target, status: "closed" });
        let settings: TextDatabasePublicationSettings;
        try {
            settings = { ...this.dependencies.getSettings() };
        } catch {
            return Promise.resolve({ target, status: "failed", stage: "settings" });
        }
        return this.publish(target, settings);
    }

    private publish(
        target: TextDatabaseTarget,
        settings: TextDatabasePublicationSettings
    ): Promise<TextDatabasePublicationResult> {
        const path = target === "word" ? settings.wordDatabasePath : settings.reviewDatabasePath;
        const otherPath =
            target === "word" ? settings.reviewDatabasePath : settings.wordDatabasePath;
        if (!path) return Promise.resolve({ target, status: "skipped" });
        if (path === otherPath) return Promise.resolve({ target, status: "pathConflict" });
        let canonicalPath: string;
        try {
            const file = this.dependencies.vault.getFile(path);
            if (!file) return Promise.resolve({ target, status: "invalidTarget" });
            canonicalPath = this.dependencies.vault.getPath(file);
            const other = otherPath ? this.dependencies.vault.getFile(otherPath) : null;
            if (other && canonicalPath === this.dependencies.vault.getPath(other)) {
                return Promise.resolve({ target, status: "pathConflict" });
            }
        } catch {
            return Promise.resolve({ target, status: "failed", stage: "target" });
        }
        // Register every predecessor at acceptance, so roles changing paths cannot race.
        return this.enqueue([`target:${target}`, `file:${canonicalPath}`], () =>
            this.execute(target, path, canonicalPath, settings)
        );
    }

    private enqueue<Result>(keys: string[], operation: () => Promise<Result>): Promise<Result> {
        const predecessors = keys.map((key) => this.tails.get(key) ?? Promise.resolve());
        const result = Promise.all(predecessors).then(operation);
        const tail = result.then(
            () => undefined,
            () => undefined
        );
        keys.forEach((key) => this.tails.set(key, tail));
        this.pending.add(result);
        void tail.then(() => {
            this.pending.delete(result);
            keys.forEach((key) => {
                if (this.tails.get(key) === tail) this.tails.delete(key);
            });
        });
        return result;
    }

    private async execute(
        target: TextDatabaseTarget,
        path: string,
        canonicalPath: string,
        settings: TextDatabasePublicationSettings
    ): Promise<TextDatabasePublicationResult> {
        let stage: PublicationFailureStage = "target";
        const getTarget = () => {
            const file = this.dependencies.vault.getFile(path);
            return file && this.dependencies.vault.getPath(file) === canonicalPath ? file : null;
        };
        try {
            if (!getTarget()) return { target, status: "invalidTarget" };
            stage = "source";
            if (target === "word") {
                const words = await this.dependencies.expressionStore.getAllExpressionSimple(false);
                stage = "render";
                const text = renderWordDatabase(words, settings.colDelimiter);
                stage = "target";
                const file = getTarget();
                if (!file) return { target, status: "invalidTarget" };
                stage = "write";
                await this.dependencies.vault.write(file, text);
                const completionReload = await this.reloadCompletion();
                return { target, status: "published", completionReload };
            }
            const expressions =
                await this.dependencies.expressionStore.getExpressionAfter(REVIEW_CUTOFF);
            if (expressions.length === 0) return { target, status: "emptySource" };
            stage = "render";
            const ordered = [...expressions].sort((a, b) =>
                a.expression.localeCompare(b.expression)
            );
            stage = "target";
            const file = getTarget();
            if (!file) return { target, status: "invalidTarget" };
            stage = "write";
            await this.dependencies.vault.process(file, (currentText) => {
                stage = "render";
                const text = renderReviewDatabase(
                    ordered,
                    settings.reviewDelimiter,
                    parseReviewRecords(currentText)
                );
                stage = "write";
                return text;
            });
            return { target, status: "published" };
        } catch {
            return { target, status: "failed", stage };
        }
    }

    private async reloadCompletion(): Promise<CompletionReloadResult> {
        try {
            const executed = await this.dependencies.completionReloader.reloadCustomDictionaries();
            return { status: executed === false ? "skipped" : "reloaded" };
        } catch {
            return { status: "failed" };
        }
    }
}

export { TextDatabasePublication, parseReviewRecords, renderReviewDatabase, renderWordDatabase };
export type {
    CompletionReloader,
    CompletionReloadResult,
    PublicationFailureStage,
    ExpressionStore,
    TextDatabasePublicationAllResult,
    TextDatabasePublicationDependencies,
    TextDatabasePublicationResult,
    TextDatabasePublicationSettings,
    TextDatabasePublicationStatus,
    TextDatabaseTarget,
    TextDatabaseVault,
};
