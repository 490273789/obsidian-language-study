import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";

const mocks = vi.hoisted(() => ({
    getExpression: vi.fn(),
    getSentence: vi.fn(),
    translate: vi.fn(),
    accept: vi.fn(),
    notice: vi.fn(),
    settings: {
        use_machine_trans: true,
        dictionaries: {
            disabled: { enable: false, priority: 0 },
            youdao: { enable: true, priority: 3 },
            deepl: { enable: true, priority: 1 },
        },
    },
}));
vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    Notice: class {
        constructor(message: string) {
            mocks.notice(message);
        }
    },
}));
vi.mock("@/ui/context", () => ({
    usePlugin: () => ({
        db: { getExpression: mocks.getExpression, tryGetSen: mocks.getSentence },
        settings: mocks.settings,
        learningRecordIntake: { accept: mocks.accept },
    }),
}));
vi.mock("@/ui/theme", () => ({
    useLangrNaiveTheme: () => null,
    useLangrNaiveThemeOverrides: () => ({}),
}));
vi.mock("@/store", () => ({ default: { dark: false } }));
vi.mock("@/dictionary/list", () => ({
    defaultDictionaryHub: { translateSentenceWithProviders: mocks.translate },
}));
// Keep Vue's real event bindings, while replacing visual controls with native ones.
vi.mock("naive-ui", async () => {
    const { defineComponent, h } = await import("vue");
    const { NDynamicInput } = await vi.importActual<typeof import("naive-ui")>("naive-ui");
    const wrapper = defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("div", slots.default?.()),
    });
    const input = defineComponent({
        props: ["value", "disabled", "placeholder"],
        emits: ["update:value"],
        setup:
            (props, { emit }) =>
            () =>
                h("input", {
                    value: props.value,
                    disabled: props.disabled,
                    placeholder: props.placeholder,
                    onInput: (event: Event) =>
                        emit("update:value", (event.target as HTMLInputElement).value),
                }),
    });
    const button = defineComponent({
        props: ["disabled", "loading"],
        setup:
            (props, { slots }) =>
            () =>
                h("button", { disabled: props.disabled || props.loading }, slots.default?.()),
    });
    return {
        NConfigProvider: wrapper,
        NForm: wrapper,
        NFormItem: wrapper,
        NInput: input,
        NButton: button,
        NDynamicInput,
        NRadioGroup: wrapper,
        NRadio: wrapper,
        NRadioButton: wrapper,
        NSelect: wrapper,
        NIcon: wrapper,
        NIconWrapper: wrapper,
    };
});

import LearnPanel from "@/views/LearnPanel.vue";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
async function flush() {
    for (let i = 0; i < 8; ++i) await Promise.resolve();
    await nextTick();
}
function select(expression: string, sentenceText = "") {
    window.dispatchEvent(
        new CustomEvent("obsidian-langr-search", {
            detail: {
                selection: expression,
                context: sentenceText ? { expression, sentenceText, origin: "Book" } : undefined,
            },
        })
    );
}

describe("LearnPanel draft adapter", () => {
    let app: App;
    let root: HTMLDivElement;
    function input(placeholder: string): HTMLInputElement {
        const element = root.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
        if (!element) throw new Error(`Missing input ${placeholder}`);
        return element;
    }
    function edit(placeholder: string, value: string) {
        const element = input(placeholder);
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function submitButton(): HTMLButtonElement {
        const element = [...root.querySelectorAll("button")].find(
            (button) => button.textContent?.trim() === "Submit"
        );
        if (!element) throw new Error("Missing Submit button");
        return element;
    }
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.settings.use_machine_trans = true;
        mocks.getExpression.mockResolvedValue(null);
        mocks.getSentence.mockResolvedValue(null);
        mocks.translate.mockResolvedValue({ status: "skipped" });
        vi.stubGlobal("sleep", () => Promise.resolve());
        root = document.createElement("div");
        document.body.append(root);
        app = createApp(LearnPanel);
        app.mount(root);
    });
    afterEach(() => {
        app.unmount();
        root.remove();
        vi.unstubAllGlobals();
    });

    it("blocks edits and submission until lookup succeeds; a failed lookup retries explicitly", async () => {
        const lookup = deferred<null>();
        mocks.getExpression.mockReturnValueOnce(lookup.promise);
        select("alpha");
        await flush();
        expect(input("A word or a phrase").disabled).toBe(true);
        expect(submitButton().disabled).toBe(true);
        expect([...root.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
        submitButton().click();
        expect(mocks.accept).not.toHaveBeenCalled();
        lookup.reject(new Error("offline"));
        await flush();
        expect(root.textContent).toContain("Learning Record lookup failed");
        expect(submitButton().disabled).toBe(true);
        const retry = [...root.querySelectorAll("button")].find(
            (button) => button.textContent === "Retry"
        );
        retry?.click();
        await flush();
        expect(input("A word or a phrase").value).toBe("alpha");
        expect(input("A word or a phrase").disabled).toBe(false);
        expect(submitButton().disabled).toBe(false);
    });

    it("routes enabled Providers in priority order and respects manual translation edits", async () => {
        const translation = deferred<{ status: "success"; translation: string }>();
        mocks.translate.mockReturnValueOnce(translation.promise);
        select("alpha", "Alpha sentence.");
        await flush();
        expect(mocks.translate).toHaveBeenCalledWith("Alpha sentence.", ["deepl", "youdao"]);
        expect(submitButton().disabled).toBe(false);
        edit("Translation (Optional)", "Manual translation");
        await flush();
        edit("Translation (Optional)", "");
        translation.resolve({ status: "success", translation: "Late machine translation" });
        await flush();
        expect(input("Translation (Optional)").value).toBe("");
    });

    it("skips Providers when machine translation is disabled", async () => {
        mocks.settings.use_machine_trans = false;
        select("alpha", "Alpha sentence.");
        await flush();
        expect(mocks.translate).not.toHaveBeenCalled();
        expect(submitButton().disabled).toBe(false);
    });

    it("creates and edits notes through the real dynamic input before intake", async () => {
        select("alpha");
        await flush();
        const create = [...root.querySelectorAll("button")].find(
            (button) => button.textContent?.trim() === "Create"
        );
        if (!create) throw new Error("Missing Create note button");
        create.click();
        await flush();
        expect(input("Write a new note").value).toBe("");
        edit("Write a new note", "My note");
        edit("A short definition", "First meaning");
        await flush();
        const intake = deferred<unknown>();
        mocks.accept.mockReturnValueOnce(intake.promise);
        submitButton().click();
        await flush();
        expect(mocks.accept.mock.calls[0][0].notes).toEqual(["My note"]);
        intake.resolve({ status: "notCommitted" });
        await flush();
    });

    it("creates and edits a sentence through the real dynamic input without persisting its draft identity", async () => {
        select("alpha");
        await flush();
        const create = [...root.querySelectorAll(".sentence-input button")].find(
            (button) => button.textContent?.trim() === "Create"
        );
        if (!(create instanceof HTMLButtonElement))
            throw new Error("Missing Create sentence button");
        create.click();
        await flush();
        edit("Origin sentence", "My sentence.");
        edit("Translation (Optional)", "My translation");
        edit("Origin (Optional)", "My book");
        edit("A short definition", "First meaning");
        await flush();
        const intake = deferred<unknown>();
        mocks.accept.mockReturnValueOnce(intake.promise);
        submitButton().click();
        await flush();
        expect(mocks.accept.mock.calls[0][0].sentences).toEqual([
            { text: "My sentence.", trans: "My translation", origin: "My book" },
        ]);
        intake.resolve({ status: "notCommitted" });
        await flush();
    });

    it.each(["pathConflict", "invalidTarget", "closed", "reloadFailed"])(
        "reports publication issue %s after saving without resubmitting",
        async (status) => {
            select("alpha");
            await flush();
            edit("A short definition", "First meaning");
            await flush();
            mocks.accept.mockResolvedValueOnce({
                status: "committed",
                record: { expression: "alpha" },
                readerUpdate: { status: "updated" },
                statisticsUpdate: { status: "updated" },
                publication: {
                    status: "attempted",
                    wordDatabase:
                        status === "reloadFailed"
                            ? { status: "published", completionReload: { status: "failed" } }
                            : { status },
                    reviewDatabase: { status: "published" },
                },
            });
            submitButton().click();
            await flush();
            expect(mocks.notice).toHaveBeenCalledWith(
                "Learning Record saved, but some updates failed"
            );
            expect(mocks.accept).toHaveBeenCalledTimes(1);
            expect(input("A word or a phrase").value).toBe("alpha");
        }
    );

    it("submits a fixed snapshot while translation is pending and leaves a newer selection intact", async () => {
        const translation = deferred<{ status: "success"; translation: string }>();
        const intake = deferred<unknown>();
        mocks.translate.mockReturnValueOnce(translation.promise);
        mocks.accept.mockReturnValueOnce(intake.promise);
        select("alpha", "Alpha sentence.");
        await flush();
        edit("A short definition", "First meaning");
        await flush();
        submitButton().click();
        await flush();
        const candidate = mocks.accept.mock.calls[0][0];
        expect(candidate.sentences).toEqual([
            { text: "Alpha sentence.", trans: "", origin: "Book" },
        ]);
        select("beta");
        await flush();
        edit("A short definition", "Second meaning");
        intake.resolve({
            status: "committed",
            record: { expression: "alpha" },
            readerUpdate: { status: "updated" },
            statisticsUpdate: { status: "updated" },
            publication: { status: "disabled" },
        });
        translation.resolve({ status: "success", translation: "Late translation" });
        await flush();
        expect(input("A word or a phrase").value).toBe("beta");
        expect(input("A short definition").value).toBe("Second meaning");
        expect(candidate.expression).toBe("alpha");
        expect(candidate.sentences[0].trans).toBe("");
    });
});
