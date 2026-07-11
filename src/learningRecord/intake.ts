import type { ExpressionStatus, ExpressionType, Sentence } from "@/db/interface";
import type {
    TextDatabasePublicationResult,
    TextDatabasePublicationStatus,
} from "@/textDatabase/publication";

type LearningRecordCandidate = Readonly<{
    expression: string;
    meaning: string;
    status: ExpressionStatus;
    type: ExpressionType;
    tags: readonly string[];
    notes: readonly string[];
    sentences: readonly Readonly<Sentence>[];
}>;

type LearningRecord = LearningRecordCandidate &
    Readonly<{
        firstAcceptedAt: number;
    }>;

type ValidationIssue =
    | { code: "candidate_invalid"; field: "candidate" }
    | { code: "expression_empty"; field: "expression" }
    | { code: "meaning_empty"; field: "meaning" }
    | { code: "word_contains_whitespace"; field: "expression" }
    | { code: "status_invalid"; field: "status" }
    | { code: "type_invalid"; field: "type" }
    | { code: "tags_invalid"; field: "tags" }
    | { code: "notes_invalid"; field: "notes" }
    | { code: "sentences_invalid"; field: "sentences" };

type RecordStoreFailureCode = "record_store_unavailable" | "record_store_incompatible";

type FollowUpOutcome = { status: "updated" } | { status: "failed"; code: "update_failed" };

type PublicationTargetOutcome =
    | { status: TextDatabasePublicationStatus }
    | { status: "failed"; code: "publication_failed" };

type PublicationOutcome =
    | { status: "disabled" }
    | {
          status: "attempted";
          wordDatabase: PublicationTargetOutcome;
          reviewDatabase: PublicationTargetOutcome;
      };

type LearningRecordIntakeResult =
    | { status: "rejected"; issues: readonly ValidationIssue[] }
    | { status: "notCommitted"; code: RecordStoreFailureCode }
    | {
          status: "committed";
          operation: "created" | "updated";
          record: LearningRecord;
          readerUpdate: FollowUpOutcome;
          statisticsUpdate: FollowUpOutcome;
          publication: PublicationOutcome;
      };

type LearningRecordCommitReceipt = Readonly<{
    operation: "created" | "updated";
    record: LearningRecord;
}>;

type LearningRecordIntakeDependencies = Readonly<{
    recordStore: {
        commitWhole(
            candidate: LearningRecordCandidate,
            firstAcceptedAtIfNew: number
        ): Promise<LearningRecordCommitReceipt>;
    };
    updateReadingDocument(record: LearningRecord): Promise<void>;
    updateStatistics(record: LearningRecord): Promise<void>;
    textDatabasePublication: {
        publishWordDatabase(): Promise<TextDatabasePublicationResult>;
        publishReviewDatabase(): Promise<TextDatabasePublicationResult>;
    };
    isAutomaticPublicationEnabled(): boolean;
    now(): number;
}>;

class LearningRecordStoreError extends Error {
    constructor(readonly code: RecordStoreFailureCode) {
        super(code);
        this.name = "LearningRecordStoreError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSentenceArray(value: unknown): value is Sentence[] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                isRecord(entry) &&
                typeof entry.text === "string" &&
                typeof entry.trans === "string" &&
                typeof entry.origin === "string"
        )
    );
}

function validateCandidate(candidate: unknown): ValidationIssue[] {
    if (!isRecord(candidate)) {
        return [{ code: "candidate_invalid", field: "candidate" }];
    }

    const issues: ValidationIssue[] = [];
    if (typeof candidate.expression !== "string" || !candidate.expression.trim()) {
        issues.push({ code: "expression_empty", field: "expression" });
    }
    if (typeof candidate.meaning !== "string" || !candidate.meaning.trim()) {
        issues.push({ code: "meaning_empty", field: "meaning" });
    }
    if (
        typeof candidate.expression === "string" &&
        candidate.expression.trim().split(/\s+/).length > 1 &&
        candidate.type === "WORD"
    ) {
        issues.push({ code: "word_contains_whitespace", field: "expression" });
    }
    if (
        typeof candidate.status !== "number" ||
        !Number.isInteger(candidate.status) ||
        candidate.status < 0 ||
        candidate.status > 4
    ) {
        issues.push({ code: "status_invalid", field: "status" });
    }
    if (candidate.type !== "WORD" && candidate.type !== "PHRASE") {
        issues.push({ code: "type_invalid", field: "type" });
    }
    if (!isStringArray(candidate.tags)) {
        issues.push({ code: "tags_invalid", field: "tags" });
    }
    if (!isStringArray(candidate.notes)) {
        issues.push({ code: "notes_invalid", field: "notes" });
    }
    if (!isSentenceArray(candidate.sentences)) {
        issues.push({ code: "sentences_invalid", field: "sentences" });
    }
    return issues;
}

function isLearningRecord(value: unknown): value is LearningRecord {
    if (!isRecord(value) || validateCandidate(value).length > 0) {
        return false;
    }
    return (
        typeof value.expression === "string" &&
        value.expression === value.expression.trim().toLowerCase() &&
        typeof value.firstAcceptedAt === "number" &&
        Number.isInteger(value.firstAcceptedAt) &&
        value.firstAcceptedAt >= 0
    );
}

function snapshotInput(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
    if (typeof value !== "object" || value === null) {
        return value;
    }
    const existing = seen.get(value);
    if (existing !== undefined) {
        return existing;
    }
    if (Array.isArray(value)) {
        const copy: unknown[] = [];
        seen.set(value, copy);
        value.forEach((entry) => copy.push(snapshotInput(entry, seen)));
        return copy;
    }
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    Object.entries(value).forEach(([key, entry]) => {
        copy[key] = snapshotInput(entry, seen);
    });
    return copy;
}

function normalizeCandidate(candidate: Record<string, unknown>): LearningRecordCandidate {
    return {
        expression: (candidate.expression as string).trim().toLowerCase(),
        meaning: candidate.meaning as string,
        status: candidate.status as ExpressionStatus,
        type: candidate.type as ExpressionType,
        tags: [...(candidate.tags as string[])],
        notes: [...(candidate.notes as string[])],
        sentences: (candidate.sentences as Sentence[]).map((sentence) => ({ ...sentence })),
    };
}

async function settleUpdate(update: () => Promise<void>): Promise<FollowUpOutcome> {
    try {
        await update();
        return { status: "updated" };
    } catch {
        return { status: "failed", code: "update_failed" };
    }
}

async function settlePublication(
    publish: () => Promise<TextDatabasePublicationResult>
): Promise<PublicationTargetOutcome> {
    try {
        const result = await publish();
        return { status: result.status };
    } catch {
        return { status: "failed", code: "publication_failed" };
    }
}

class LearningRecordIntakeModule {
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly dependencies: LearningRecordIntakeDependencies) {}

    accept(candidate: unknown): Promise<LearningRecordIntakeResult> {
        const snapshot = snapshotInput(candidate);
        const result = this.queue.then(() => this.execute(snapshot));
        this.queue = result.then(
            () => undefined,
            () => undefined
        );
        return result;
    }

    private async execute(candidate: unknown): Promise<LearningRecordIntakeResult> {
        const issues = validateCandidate(candidate);
        if (issues.length > 0) {
            return { status: "rejected", issues };
        }

        const normalized = normalizeCandidate(candidate as Record<string, unknown>);
        let receipt: LearningRecordCommitReceipt;
        try {
            receipt = await this.dependencies.recordStore.commitWhole(
                normalized,
                this.dependencies.now()
            );
        } catch (error) {
            if (error instanceof LearningRecordStoreError) {
                return { status: "notCommitted", code: error.code };
            }
            throw error;
        }

        const publicationPromise: Promise<PublicationOutcome> =
            this.dependencies.isAutomaticPublicationEnabled()
                ? Promise.all([
                      settlePublication(() =>
                          this.dependencies.textDatabasePublication.publishWordDatabase()
                      ),
                      settlePublication(() =>
                          this.dependencies.textDatabasePublication.publishReviewDatabase()
                      ),
                  ]).then(([wordDatabase, reviewDatabase]) => ({
                      status: "attempted" as const,
                      wordDatabase,
                      reviewDatabase,
                  }))
                : Promise.resolve({ status: "disabled" as const });

        const [readerUpdate, statisticsUpdate, publication] = await Promise.all([
            settleUpdate(() => this.dependencies.updateReadingDocument(receipt.record)),
            settleUpdate(() => this.dependencies.updateStatistics(receipt.record)),
            publicationPromise,
        ]);

        return {
            status: "committed",
            operation: receipt.operation,
            record: receipt.record,
            readerUpdate,
            statisticsUpdate,
            publication,
        };
    }
}

export { isLearningRecord, LearningRecordIntakeModule, LearningRecordStoreError };
export type {
    FollowUpOutcome,
    LearningRecord,
    LearningRecordCandidate,
    LearningRecordCommitReceipt,
    LearningRecordIntakeDependencies,
    LearningRecordIntakeResult,
    PublicationOutcome,
    PublicationTargetOutcome,
    RecordStoreFailureCode,
    ValidationIssue,
};
