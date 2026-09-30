import type { ExpressionInfo, Sentence } from "@/db/interface";
import type { ReadingSelection } from "@/reading/readingContext";
import type { LearningRecordCandidate } from "./intake";

export type DraftSentence = Sentence & { readonly draftId: number };
type DraftRecord = Omit<ExpressionInfo, "sentences"> & { sentences: DraftSentence[] };
export type LearningRecordDraftState = Readonly<{
    revision: number;
    preparation: "idle" | "loading" | "ready" | "failed" | "closed";
    translation: "idle" | "pending" | "completed" | "failed" | "skipped";
    record: DraftRecord;
    canEdit: boolean;
    canSubmit: boolean;
}>;

export type DraftEdit =
    | { kind: "record"; patch: Partial<Omit<ExpressionInfo, "sentences">> }
    | { kind: "sentences"; sentences: readonly DraftSentence[] }
    | { kind: "sentence"; id: number; patch: Partial<Sentence> };

type TranslationResult =
    | { status: "success"; translation: string }
    | { status: "unavailable" | "skipped" };

type DraftDependencies = Readonly<{
    getExpression(expression: string): Promise<ExpressionInfo | null>;
    getSentence(text: string): Promise<Sentence | null>;
    translate(sentence: string): Promise<TranslationResult>;
    onChange?(state: LearningRecordDraftState): void;
}>;

function emptyRecord(expression = "", status: ExpressionInfo["status"] = 0): DraftRecord {
    return {
        expression,
        meaning: "",
        status,
        t: /\s/.test(expression) ? "PHRASE" : "WORD",
        tags: [],
        notes: [],
        sentences: [],
    };
}

/** Owns the editable proposal; snapshots never expose its mutable storage. */
export class LearningRecordDraftModule {
    private record = emptyRecord();
    private preparation: LearningRecordDraftState["preparation"] = "idle";
    private translation: LearningRecordDraftState["translation"] = "idle";
    private revision = 0;
    private generation = 0;
    private nextSentenceId = 0;
    private translationAttempt = 0;
    private input: { expression: string; context?: ReadingSelection } | null = null;
    private translationTarget: { id: number; text: string } | null = null;
    private readonly touchedSentences = new Set<number>();

    constructor(private readonly dependencies: DraftDependencies) {}

    getState(): LearningRecordDraftState {
        const canEdit = this.preparation === "idle" || this.preparation === "ready";
        return {
            revision: this.revision,
            preparation: this.preparation,
            translation: this.translation,
            record: {
                ...this.record,
                tags: [...this.record.tags],
                notes: [...this.record.notes],
                sentences: this.record.sentences.map((sentence) => ({ ...sentence })),
            },
            canEdit,
            canSubmit: canEdit,
        };
    }

    async select(expression: string, context?: ReadingSelection): Promise<void> {
        if (this.preparation === "closed") return;
        const generation = ++this.generation;
        ++this.translationAttempt;
        this.input = {
            expression: expression.trim().toLowerCase(),
            context: context && { ...context },
        };
        const input = this.input;
        this.record = emptyRecord(input.expression, 1);
        this.preparation = "loading";
        this.translation = "idle";
        this.translationTarget = null;
        this.touchedSentences.clear();
        this.publish();

        try {
            const text = input.context?.sentenceText ?? "";
            const [existing, storedSentence] = await Promise.all([
                this.dependencies.getExpression(input.expression),
                text ? this.dependencies.getSentence(text) : Promise.resolve(null),
            ]);
            if (generation !== this.generation) return;
            const record: DraftRecord = existing
                ? {
                      ...existing,
                      tags: [...existing.tags],
                      notes: [...existing.notes],
                      sentences: existing.sentences.map((sentence) => this.newSentence(sentence)),
                  }
                : emptyRecord(input.expression, 1);
            // Keep the expression's own example before consulting the shared sentence.
            if (text) {
                let sentence = record.sentences.find((entry) => entry.text === text);
                if (!sentence) {
                    sentence = this.newSentence(
                        storedSentence ?? { text, trans: "", origin: input.context?.origin ?? "" }
                    );
                    record.sentences.push(sentence);
                }
                if (!sentence.trans.trim()) {
                    this.translationTarget = { id: sentence.draftId, text };
                }
            }
            this.record = record;
            this.preparation = "ready";
            this.publish();
            // Translation is optional and must never delay readiness or intake.
            if (generation === this.generation && this.translationTarget) {
                void this.translate();
            }
        } catch {
            if (generation !== this.generation) return;
            this.preparation = "failed";
            this.publish();
        }
    }

    edit(edit: DraftEdit): void {
        if (!this.getState().canEdit) return;
        if (edit.kind === "record") {
            if (
                edit.patch.expression !== undefined &&
                edit.patch.expression !== this.record.expression
            ) {
                this.invalidateTranslation();
            }
            this.record = {
                ...this.record,
                ...edit.patch,
                tags: [...(edit.patch.tags ?? this.record.tags)],
                notes: [...(edit.patch.notes ?? this.record.notes)],
            };
        } else if (edit.kind === "sentence") {
            const sentence = this.record.sentences.find((entry) => entry.draftId === edit.id);
            if (!sentence) return;
            if (edit.patch.text !== undefined || edit.patch.trans !== undefined) {
                this.touchedSentences.add(edit.id);
                if (this.translationTarget?.id === edit.id) this.invalidateTranslation();
            }
            Object.assign(sentence, edit.patch);
        } else {
            const previous = new Map(this.record.sentences.map((entry) => [entry.draftId, entry]));
            const usedIds = new Set<number>();
            this.record.sentences = edit.sentences.map((entry) => {
                const old = previous.get(entry.draftId);
                if (!old || usedIds.has(entry.draftId)) return this.newSentence(entry);
                usedIds.add(entry.draftId);
                if (old.text !== entry.text || old.trans !== entry.trans) {
                    this.touchedSentences.add(entry.draftId);
                }
                return { ...entry };
            });
            if (!this.eligibleTranslationTarget()) this.invalidateTranslation();
        }
        this.publish();
    }

    async retry(target: "preparation" | "translation"): Promise<void> {
        if (target === "preparation" && this.preparation === "failed" && this.input) {
            await this.select(this.input.expression, this.input.context);
        } else if (target === "translation" && this.translation === "failed") {
            await this.translate();
        }
    }

    snapshotForIntake(): LearningRecordCandidate | null {
        if (!this.getState().canSubmit) return null;
        const record = this.record;
        return {
            expression: record.expression,
            meaning: record.meaning,
            status: record.status,
            type: record.t,
            tags: [...record.tags],
            notes: [...record.notes],
            sentences: record.sentences.map(({ text, trans, origin }) => ({ text, trans, origin })),
        };
    }

    close(): void {
        if (this.preparation === "closed") return;
        ++this.generation;
        this.invalidateTranslation();
        this.preparation = "closed";
        this.publish();
    }

    private newSentence(sentence: Sentence): DraftSentence {
        return {
            text: sentence.text,
            trans: sentence.trans,
            origin: sentence.origin,
            draftId: ++this.nextSentenceId,
        };
    }

    private eligibleTranslationTarget(): DraftSentence | undefined {
        const target = this.translationTarget;
        if (!target || this.preparation !== "ready" || this.touchedSentences.has(target.id)) return;
        return this.record.sentences.find(
            (sentence) =>
                sentence.draftId === target.id &&
                sentence.text === target.text &&
                !sentence.trans.trim()
        );
    }

    private invalidateTranslation(): void {
        ++this.translationAttempt;
        this.translationTarget = null;
        this.translation = "idle";
    }

    private async translate(): Promise<void> {
        const sentence = this.eligibleTranslationTarget();
        if (!sentence) return;
        const attempt = ++this.translationAttempt;
        const generation = this.generation;
        this.translation = "pending";
        this.publish();
        let result: TranslationResult;
        try {
            result = await this.dependencies.translate(sentence.text);
        } catch {
            result = { status: "unavailable" };
        }
        if (generation !== this.generation || attempt !== this.translationAttempt) return;
        const current = this.eligibleTranslationTarget();
        if (!current) return;
        if (result.status === "success" && result.translation.trim()) {
            current.trans = result.translation;
            this.translation = "completed";
        } else {
            this.translation = result.status === "skipped" ? "skipped" : "failed";
        }
        this.publish();
    }

    private publish(): void {
        ++this.revision;
        this.dependencies.onChange?.(this.getState());
    }
}
