import { describe, expect, it, vi } from "vitest";

import type { ExpressionInfo, Sentence } from "@/db/interface";
import { LearningRecordDraftModule } from "@/learningRecord/draft";

type Dependencies = ConstructorParameters<typeof LearningRecordDraftModule>[0];
type TranslationResult = Awaited<ReturnType<Dependencies["translate"]>>;

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function record(sentences: Sentence[] = []): ExpressionInfo {
    return {
        expression: "alpha",
        meaning: "first letter",
        status: 2,
        t: "WORD",
        tags: ["greek"],
        notes: ["note"],
        sentences,
    };
}

function context(sentenceText = "Alpha appears.") {
    return { expression: "alpha", sentenceText, origin: "Book" };
}

function harness() {
    const getExpression = vi.fn<Dependencies["getExpression"]>().mockResolvedValue(null);
    const getSentence = vi.fn<Dependencies["getSentence"]>().mockResolvedValue(null);
    const translate = vi.fn<Dependencies["translate"]>().mockResolvedValue({ status: "skipped" });
    const onChange = vi.fn<NonNullable<Dependencies["onChange"]>>();
    const draft = new LearningRecordDraftModule({
        getExpression,
        getSentence,
        translate,
        onChange,
    });
    return { draft, getExpression, getSentence, translate, onChange };
}

describe("Learning Record Draft", () => {
    it.each(["success", "failure"])(
        "keeps the latest selection after stale lookup %s",
        async (outcome) => {
            const { draft, getExpression } = harness();
            const oldLookup = deferred<ExpressionInfo | null>();
            getExpression.mockReturnValueOnce(oldLookup.promise);
            const oldSelection = draft.select("alpha");
            await draft.select("  BETA PHRASE  ");
            if (outcome === "success") oldLookup.resolve(record());
            else oldLookup.reject(new Error("old lookup failed"));
            await oldSelection;

            expect(draft.getState()).toMatchObject({
                preparation: "ready",
                record: { expression: "beta phrase", t: "PHRASE", status: 1 },
            });
        }
    );

    it("disables edits and intake while loading and after lookup failure, then retries", async () => {
        const { draft, getExpression } = harness();
        const lookup = deferred<ExpressionInfo | null>();
        getExpression.mockReturnValueOnce(lookup.promise);
        const selection = draft.select("alpha");
        expect(draft.getState()).toMatchObject({
            preparation: "loading",
            canEdit: false,
            canSubmit: false,
        });
        draft.edit({ kind: "record", patch: { meaning: "ignored" } });
        expect(draft.snapshotForIntake()).toBeNull();
        lookup.reject(new Error("offline"));
        await selection;
        expect(draft.getState()).toMatchObject({
            preparation: "failed",
            canEdit: false,
            canSubmit: false,
        });
        draft.edit({ kind: "record", patch: { meaning: "still ignored" } });
        expect(draft.getState().record.meaning).toBe("");
        expect(draft.snapshotForIntake()).toBeNull();
        await draft.retry("preparation");
        expect(getExpression).toHaveBeenCalledTimes(2);
        expect(draft.getState()).toMatchObject({
            preparation: "ready",
            canEdit: true,
            canSubmit: true,
        });
    });

    it("treats absent records as ready and does not retry successful preparation", async () => {
        const { draft, getExpression } = harness();
        await draft.select("alpha");
        await draft.retry("preparation");
        expect(getExpression).toHaveBeenCalledTimes(1);
        expect(draft.snapshotForIntake()).toMatchObject({
            expression: "alpha",
            status: 1,
            sentences: [],
        });
    });

    it("fails preparation when the shared sentence lookup fails", async () => {
        const { draft, getSentence, translate } = harness();
        getSentence.mockRejectedValueOnce(new Error("sentence store offline"));
        await draft.select("alpha", context());
        expect(draft.getState().preparation).toBe("failed");
        expect(translate).not.toHaveBeenCalled();
        await draft.retry("preparation");
        expect(draft.getState().preparation).toBe("ready");
    });

    it("clones dependency records, exposed state, edit inputs and intake snapshots", async () => {
        const { draft, getExpression, onChange } = harness();
        const stored = record([{ text: "Alpha.", trans: "translated", origin: "Book" }]);
        getExpression.mockResolvedValue(stored);
        await draft.select("alpha");
        stored.tags.push("external");
        stored.notes[0] = "external";
        stored.sentences[0].trans = "external";
        const exposed = draft.getState();
        exposed.record.tags.push("state mutation");
        exposed.record.notes[0] = "state mutation";
        exposed.record.sentences[0].trans = "state mutation";
        const published = onChange.mock.calls.at(-1)![0];
        published.record.meaning = "callback mutation";
        const tags = ["edited"];
        draft.edit({ kind: "record", patch: { tags } });
        tags.push("input mutation");
        const sentences = draft.getState().record.sentences;
        draft.edit({ kind: "sentences", sentences });
        sentences[0].origin = "input mutation";
        const snapshot = draft.snapshotForIntake()!;
        Reflect.set(snapshot.tags, 0, "snapshot mutation");
        Reflect.set(snapshot.notes, 0, "snapshot mutation");
        Reflect.set(snapshot.sentences[0], "trans", "snapshot mutation");

        expect(draft.getState().record).toMatchObject({
            meaning: "first letter",
            tags: ["edited"],
            notes: ["note"],
            sentences: [{ text: "Alpha.", trans: "translated", origin: "Book" }],
        });
        expect(draft.snapshotForIntake()!.sentences[0]).not.toHaveProperty("draftId");
    });

    it("prefers the expression's own matching sentence without appending a duplicate", async () => {
        const { draft, getExpression, getSentence, translate } = harness();
        getExpression.mockResolvedValue(
            record([{ text: "Alpha appears.", trans: "own", origin: "Own" }])
        );
        getSentence.mockResolvedValue({
            text: "Alpha appears.",
            trans: "shared",
            origin: "Shared",
        });
        await draft.select("alpha", context());
        expect(draft.snapshotForIntake()!.sentences).toEqual([
            { text: "Alpha appears.", trans: "own", origin: "Own" },
        ]);
        expect(translate).not.toHaveBeenCalled();
    });

    it("reuses and clones a shared translated sentence without translating again", async () => {
        const { draft, getSentence, translate } = harness();
        const shared = { text: "Alpha appears.", trans: "shared", origin: "Shared" };
        getSentence.mockResolvedValue(shared);
        await draft.select("alpha", context());
        shared.trans = "external";
        expect(draft.snapshotForIntake()!.sentences).toEqual([
            { text: "Alpha appears.", trans: "shared", origin: "Shared" },
        ]);
        expect(translate).not.toHaveBeenCalled();
    });

    it("keeps preparation and snapshots ready while optional translation is pending", async () => {
        const { draft, translate } = harness();
        const translation = deferred<TranslationResult>();
        translate.mockReturnValue(translation.promise);
        await draft.select("alpha", context());
        expect(draft.getState()).toMatchObject({
            preparation: "ready",
            translation: "pending",
            canSubmit: true,
        });
        const snapshot = draft.snapshotForIntake()!;
        draft.edit({ kind: "record", patch: { meaning: "edited", tags: ["new"] } });
        translation.resolve({ status: "success", translation: "translated" });
        await vi.waitFor(() => expect(draft.getState().translation).toBe("completed"));
        expect(snapshot).toMatchObject({ meaning: "", tags: [], sentences: [{ trans: "" }] });
        expect(draft.snapshotForIntake()).toMatchObject({
            meaning: "edited",
            tags: ["new"],
            sentences: [{ trans: "translated" }],
        });
    });

    it("reports skipped translation while preserving editable intake", async () => {
        const { draft, translate } = harness();
        await draft.select("alpha", context());
        await vi.waitFor(() => expect(draft.getState().translation).toBe("skipped"));
        await draft.retry("translation");
        expect(translate).toHaveBeenCalledTimes(1);
        expect(draft.getState()).toMatchObject({
            preparation: "ready",
            canEdit: true,
            canSubmit: true,
        });
        expect(draft.snapshotForIntake()!.sentences[0].trans).toBe("");
    });

    it.each(["unavailable", "throw", "empty"])(
        "retries an optional translation failure (%s)",
        async (failure) => {
            const { draft, translate } = harness();
            if (failure === "throw")
                translate.mockRejectedValueOnce(new Error("translation offline"));
            else
                translate.mockResolvedValueOnce(
                    failure === "empty"
                        ? { status: "success", translation: "   " }
                        : { status: "unavailable" }
                );
            await draft.select("alpha", context());
            await vi.waitFor(() => expect(draft.getState().translation).toBe("failed"));
            expect(draft.snapshotForIntake()).not.toBeNull();
            translate.mockResolvedValueOnce({ status: "success", translation: "retried" });
            await draft.retry("translation");
            expect(draft.getState().translation).toBe("completed");
            expect(draft.snapshotForIntake()!.sentences[0].trans).toBe("retried");
        }
    );

    it.each(["manual", "clear", "text"])(
        "preserves a user's %s edit against late translation",
        async (edit) => {
            const { draft, translate } = harness();
            const translation = deferred<TranslationResult>();
            translate.mockReturnValue(translation.promise);
            await draft.select("alpha", context());
            const sentence = draft.getState().record.sentences[0];
            const patch =
                edit === "text"
                    ? { text: "Rewritten." }
                    : { trans: edit === "manual" ? "manual" : "" };
            draft.edit({ kind: "sentence", id: sentence.draftId, patch });
            translation.resolve({ status: "success", translation: "late" });
            await translation.promise;
            expect(draft.getState().record.sentences[0]).toMatchObject({
                text: edit === "text" ? "Rewritten." : "Alpha appears.",
                trans: edit === "manual" ? "manual" : "",
            });
            expect(draft.getState().translation).toBe("idle");
        }
    );

    it("retains the translation target across reordering and unrelated edits", async () => {
        const { draft, getExpression, translate } = harness();
        getExpression.mockResolvedValue(
            record([{ text: "Other.", trans: "other", origin: "Book" }])
        );
        const translation = deferred<TranslationResult>();
        translate.mockReturnValue(translation.promise);
        await draft.select("alpha", context());
        const [other, target] = draft.getState().record.sentences;
        draft.edit({ kind: "sentences", sentences: [target, other] });
        draft.edit({
            kind: "record",
            patch: { meaning: "changed", status: 3, notes: ["changed"] },
        });
        draft.edit({ kind: "sentence", id: target.draftId, patch: { origin: "Changed" } });
        translation.resolve({ status: "success", translation: "translated" });
        await vi.waitFor(() => expect(draft.getState().translation).toBe("completed"));
        expect(draft.getState().record.sentences).toMatchObject([
            { draftId: target.draftId, trans: "translated", origin: "Changed" },
            { draftId: other.draftId, trans: "other" },
        ]);
    });

    it("does not patch a deleted and recreated sentence with the same text", async () => {
        const { draft, translate } = harness();
        const translation = deferred<TranslationResult>();
        translate.mockReturnValue(translation.promise);
        await draft.select("alpha", context());
        const original = draft.getState().record.sentences[0];
        draft.edit({ kind: "sentences", sentences: [] });
        draft.edit({ kind: "sentences", sentences: [original] });
        expect(draft.getState().record.sentences[0].draftId).not.toBe(original.draftId);
        translation.resolve({ status: "success", translation: "late" });
        await translation.promise;
        expect(draft.snapshotForIntake()!.sentences[0].trans).toBe("");
    });

    it.each(["select", "close"])("invalidates pending translation on %s", async (action) => {
        const { draft, translate } = harness();
        const translation = deferred<TranslationResult>();
        translate.mockReturnValue(translation.promise);
        await draft.select("alpha", context());
        if (action === "select") await draft.select("beta");
        else draft.close();
        const state = draft.getState();
        translation.resolve({ status: "success", translation: "late" });
        await translation.promise;
        expect(draft.getState()).toEqual(state);
    });

    it("invalidates pending lookup on close and prevents further selection and edits", async () => {
        const { draft, getExpression } = harness();
        const lookup = deferred<ExpressionInfo | null>();
        getExpression.mockReturnValueOnce(lookup.promise);
        const selection = draft.select("alpha");
        draft.close();
        const closed = draft.getState();
        lookup.resolve(record());
        await selection;
        await draft.select("beta");
        draft.edit({ kind: "record", patch: { meaning: "ignored" } });
        expect(draft.getState()).toEqual(closed);
        expect(closed).toMatchObject({ preparation: "closed", canEdit: false, canSubmit: false });
        expect(draft.snapshotForIntake()).toBeNull();
        expect(getExpression).toHaveBeenCalledTimes(1);
    });
});
