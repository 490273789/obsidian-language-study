import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, nextTick, shallowReactive, type App } from "vue";

const mocks = vi.hoisted(() => ({ notice: vi.fn() }));
vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    Notice: class {
        constructor(message: string) {
            mocks.notice(message);
        }
    },
}));
vi.mock("@/ui/context", () => ({ usePlugin: () => plugin }));
vi.mock("@/ui/theme", () => ({
    useLangrNaiveTheme: () => null,
    useLangrNaiveThemeOverrides: () => ({}),
}));
vi.mock("naive-ui", async () => {
    const { defineComponent, h } = await import("vue");
    const wrapper = defineComponent({
        setup:
            (_, { slots }) =>
            () =>
                h("div", slots.default?.()),
    });
    return {
        NConfigProvider: wrapper,
        NInput: wrapper,
        NTag: wrapper,
        NDataTable: defineComponent({
            props: ["data", "loading"],
            setup(props, { expose }) {
                expose({ filter: vi.fn() });
                return () =>
                    h("div", { "data-loading": String(props.loading) }, JSON.stringify(props.data));
            },
        }),
    };
});

import DataPanel from "@/views/DataPanel.vue";

function store() {
    return { getAllExpressionSimple: vi.fn(), getTags: vi.fn(async () => []) };
}
let plugin = shallowReactive({ db: store() });
const record = {
    expression: "alpha",
    status: 1,
    meaning: "meaning",
    tags: [],
    note_num: 0,
    sen_num: 0,
    date: 0,
};
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
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await nextTick();
}

describe("DataPanel source failures", () => {
    let app: App;
    let root: HTMLDivElement;
    beforeEach(() => {
        mocks.notice.mockClear();
        plugin = shallowReactive({ db: store() });
        root = document.createElement("div");
        document.body.append(root);
    });
    afterEach(() => {
        app.unmount();
        root.remove();
    });
    function mount() {
        app = createApp(DataPanel);
        app.mount(root);
    }

    it("ends loading and reports a rejected initial source read", async () => {
        plugin.db.getAllExpressionSimple.mockRejectedValue(new Error("offline"));
        mount();
        await flush();
        expect(root.querySelector("[data-loading]")?.getAttribute("data-loading")).toBe("false");
        expect(mocks.notice).toHaveBeenCalledWith("Learning Records could not be loaded");
        expect(root.textContent).not.toContain('"expr":');
    });

    it("preserves displayed rows when the next source read fails", async () => {
        plugin.db.getAllExpressionSimple.mockResolvedValue([record]);
        mount();
        await flush();
        expect(root.textContent).toContain('"expr":"alpha"');
        const next = store();
        next.getAllExpressionSimple.mockRejectedValue(new Error("offline"));
        plugin.db = next;
        await flush();
        expect(root.textContent).toContain('"expr":"alpha"');
        expect(root.querySelector("[data-loading]")?.getAttribute("data-loading")).toBe("false");
        expect(mocks.notice).toHaveBeenCalledOnce();
    });

    it("does not let an obsolete fetch overwrite current rows", async () => {
        const stale = deferred<(typeof record)[]>();
        plugin.db.getAllExpressionSimple.mockReturnValue(stale.promise);
        mount();
        const next = store();
        next.getAllExpressionSimple.mockResolvedValue([{ ...record, expression: "beta" }]);
        plugin.db = next;
        await flush();
        stale.resolve([record]);
        await flush();
        expect(root.textContent).toContain('"expr":"beta"');
        expect(root.textContent).not.toContain('"expr":"alpha"');
        expect(mocks.notice).not.toHaveBeenCalled();
    });
});
