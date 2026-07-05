import { t } from "@/lang/helper";
import type { ExpressionInfo, ExpressionInfoSimple } from "@/db/interface";

type TextDatabaseTarget = "word" | "review";
type TextDatabasePublicationStatus = "skipped" | "invalidTarget" | "emptySource" | "published";

type TextDatabasePublicationResult = {
    target: TextDatabaseTarget;
    status: TextDatabasePublicationStatus;
};

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
    read(file: FileRef): Promise<string>;
    write(file: FileRef, text: string): Promise<void>;
};

type CompletionReloader = {
    reloadCustomDictionaries(): void;
};

type TextDatabasePublicationDependencies<FileRef> = {
    getSettings(): TextDatabasePublicationSettings;
    expressionStore: ExpressionStore;
    vault: TextDatabaseVault<FileRef>;
    completionReloader: CompletionReloader;
};

const REVIEW_CUTOFF = "1970-01-01T00:00:00Z";

function makeResult(
    target: TextDatabaseTarget,
    status: TextDatabasePublicationStatus
): TextDatabasePublicationResult {
    return { target, status };
}

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
    const oldRecord: Record<string, string> = {};
    text.match(/#word(\n.+)+\n(<!--SR.*?-->)/g)
        ?.map((value) => value.match(/#### (.+)[\s\S]+(<!--SR.*-->)/))
        ?.forEach((value) => {
            if (value?.[1] && value[2]) {
                oldRecord[value[1]] = value[2];
            }
        });
    return oldRecord;
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
    private getSettings: () => TextDatabasePublicationSettings;
    private expressionStore: ExpressionStore;
    private vault: TextDatabaseVault<FileRef>;
    private completionReloader: CompletionReloader;

    constructor(dependencies: TextDatabasePublicationDependencies<FileRef>) {
        this.getSettings = dependencies.getSettings;
        this.expressionStore = dependencies.expressionStore;
        this.vault = dependencies.vault;
        this.completionReloader = dependencies.completionReloader;
    }

    async publishAll(): Promise<TextDatabasePublicationAllResult> {
        const word = await this.publishWordDatabase();
        const review = await this.publishReviewDatabase();
        if (word.status === "published") {
            this.completionReloader.reloadCustomDictionaries();
        }
        return { word, review };
    }

    async publishWordDatabase(): Promise<TextDatabasePublicationResult> {
        const settings = this.getSettings();
        if (!settings.wordDatabasePath) {
            return makeResult("word", "skipped");
        }

        const target = this.vault.getFile(settings.wordDatabasePath);
        if (!target) {
            return makeResult("word", "invalidTarget");
        }

        const words = await this.expressionStore.getAllExpressionSimple(false);
        await this.vault.write(target, renderWordDatabase(words, settings.colDelimiter));
        return makeResult("word", "published");
    }

    async publishReviewDatabase(): Promise<TextDatabasePublicationResult> {
        const settings = this.getSettings();
        if (!settings.reviewDatabasePath) {
            return makeResult("review", "skipped");
        }

        const target = this.vault.getFile(settings.reviewDatabasePath);
        if (!target) {
            return makeResult("review", "invalidTarget");
        }

        const existingText = await this.vault.read(target);
        const oldRecord = parseReviewRecords(existingText);
        const expressions = await this.expressionStore.getExpressionAfter(REVIEW_CUTOFF);
        if (expressions.length === 0) {
            return makeResult("review", "emptySource");
        }

        expressions.sort((a, b) => a.expression.localeCompare(b.expression));
        await this.vault.write(
            target,
            renderReviewDatabase(expressions, settings.reviewDelimiter, oldRecord)
        );
        return makeResult("review", "published");
    }
}

export { TextDatabasePublication, parseReviewRecords, renderReviewDatabase, renderWordDatabase };
export type {
    CompletionReloader,
    ExpressionStore,
    TextDatabasePublicationAllResult,
    TextDatabasePublicationDependencies,
    TextDatabasePublicationResult,
    TextDatabasePublicationSettings,
    TextDatabasePublicationStatus,
    TextDatabaseTarget,
    TextDatabaseVault,
};
