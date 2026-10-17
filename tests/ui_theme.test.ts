import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, defineComponent, h, type App } from "vue";
import type { GlobalThemeOverrides } from "naive-ui";
import { useLangrNaiveThemeOverrides } from "@/ui/theme";

let app: App | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
    app?.unmount();
    container?.remove();
    vi.restoreAllMocks();
});

describe("Obsidian theme integration", () => {
    it.each([
        ["color(srgb 0.12 0.14 0.16)", "rgba(31, 36, 41, 1)"],
        ["color(srgb 0.97 0.97 0.98)", "rgba(247, 247, 250, 1)"],
        ["color(srgb 0.1 0.2 0.3 / 0.5)", "rgba(26, 51, 77, 0.5)"],
        ["rgb(31, 36, 41)", "rgb(31, 36, 41)"],
    ])("preserves a resolved %s surface in Naive UI", (resolvedColor, expected) => {
        const getComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
            const style = getComputedStyle(element);
            return new Proxy(style, {
                get(target, key) {
                    if (key === "color") return resolvedColor;
                    if (key === "getPropertyValue") return () => "theme-token";
                    return Reflect.get(target, key);
                },
            });
        });
        let theme: GlobalThemeOverrides | undefined;
        container = document.createElement("div");
        document.body.appendChild(container);
        app = createApp(
            defineComponent({
                setup() {
                    theme = useLangrNaiveThemeOverrides().value;
                    return () => h("div");
                },
            })
        );
        app.mount(container);

        expect(theme?.DataTable?.tdColor).toBe(expected);
        expect(theme?.Input?.color).toBe(expected);
        expect(theme?.Button?.color).toBe(expected);
        expect(theme?.common?.popoverColor).toBe(expected);
    });
});
