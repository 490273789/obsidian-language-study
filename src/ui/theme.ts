import {
    computed,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    type ComputedRef,
    type ShallowRef,
} from "vue";
import { darkTheme, type GlobalTheme, type GlobalThemeOverrides } from "naive-ui";

const DEFAULT_PRIMARY_COLOR = "#7c6fdd";
const DEFAULT_PRIMARY_COLOR_HOVER = "#6f63c7";

function useLangrNaiveTheme(isDark: () => boolean): ComputedRef<GlobalTheme | null> {
    return computed(() => (isDark() ? darkTheme : null));
}

const baseThemeOverrides = {
    common: {
        borderRadius: "6px",
        borderRadiusSmall: "4px",
        heightTiny: "24px",
        heightSmall: "28px",
        fontSize: "13px",
        fontSizeMedium: "13px",
    },
    Button: {
        borderRadiusTiny: "6px",
        borderRadiusSmall: "6px",
        heightTiny: "24px",
        heightSmall: "28px",
        paddingTiny: "0 8px",
        paddingSmall: "0 10px",
    },
    DataTable: {
        borderRadius: "6px",
        fontSizeSmall: "13px",
        thPaddingSmall: "8px 10px",
        tdPaddingSmall: "8px 10px",
    },
    Drawer: {
        bodyPadding: "12px",
        headerPadding: "10px 12px",
        titleFontSize: "14px",
        titleFontWeight: "700",
    },
    DynamicInput: {
        actionMargin: "0 0 0 6px",
    },
    Form: {
        labelFontSizeTopMedium: "13px",
        feedbackFontSizeMedium: "12px",
        blankHeightMedium: "6px",
        feedbackHeightMedium: "20px",
    },
    Input: {
        borderRadius: "6px",
        borderRadiusSmall: "6px",
        fontSizeTiny: "12px",
        fontSizeSmall: "13px",
        paddingTiny: "0 8px",
        paddingSmall: "0 9px",
    },
    Pagination: {
        itemBorderRadius: "6px",
    },
    Radio: {
        buttonBorderRadius: "6px",
        buttonHeightSmall: "26px",
        fontSizeMedium: "13px",
        fontSizeSmall: "13px",
    },
    Select: {
        peers: {
            InternalSelection: {
                borderRadius: "6px",
                fontSizeSmall: "13px",
            },
        },
    },
    Tag: {
        borderRadius: "6px",
        fontSizeSmall: "12px",
        heightSmall: "22px",
        heightTiny: "20px",
    },
} satisfies GlobalThemeOverrides;

function normalizeColorForNaive(value: string, fallback: string): string {
    const color = value.trim();

    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
        return color;
    }

    const rgbMatch = color.match(
        /^rgba?\(\s*([+-]?\d*\.?\d+)\s*(?:,|\s+)\s*([+-]?\d*\.?\d+)\s*(?:,|\s+)\s*([+-]?\d*\.?\d+)(?:\s*(?:,|\/)\s*([+-]?\d*\.?\d+))?\s*\)$/i
    );

    if (!rgbMatch) {
        return fallback;
    }

    const channels = rgbMatch.slice(1, 4).map((channel) => {
        const numeric = Number(channel);
        return Number.isFinite(numeric) ? Math.min(255, Math.max(0, Math.round(numeric))) : null;
    });

    if (channels.some((channel) => channel === null)) {
        return fallback;
    }

    const alpha = rgbMatch[4] === undefined ? null : Number(rgbMatch[4]);
    const [red, green, blue] = channels as [number, number, number];

    if (alpha === null || !Number.isFinite(alpha)) {
        return `rgb(${red}, ${green}, ${blue})`;
    }

    return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`;
}

function resolveCssColorVar(name: string, fallback: string): string {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return fallback;
    }

    const root = document.body ?? document.documentElement;

    if (!root || !window.getComputedStyle(root).getPropertyValue(name).trim()) {
        return fallback;
    }

    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    probe.style.position = "fixed";
    probe.style.left = "-9999px";
    probe.style.top = "-9999px";
    probe.style.pointerEvents = "none";
    root.appendChild(probe);

    const resolved = window.getComputedStyle(probe).color;
    probe.remove();

    return normalizeColorForNaive(resolved, fallback);
}

function createLangrThemeOverrides(): GlobalThemeOverrides {
    const primaryColor = resolveCssColorVar("--interactive-accent", DEFAULT_PRIMARY_COLOR);
    const primaryColorHover = resolveCssColorVar(
        "--interactive-accent-hover",
        DEFAULT_PRIMARY_COLOR_HOVER
    );

    return {
        ...baseThemeOverrides,
        common: {
            ...baseThemeOverrides.common,
            primaryColor,
            primaryColorHover,
            primaryColorPressed: primaryColor,
            primaryColorSuppl: primaryColorHover,
        },
    };
}

function useLangrNaiveThemeOverrides(): ShallowRef<GlobalThemeOverrides> {
    const overrides = shallowRef(createLangrThemeOverrides());
    let observer: MutationObserver | null = null;
    let frameId = 0;

    const refresh = () => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            if (frameId !== 0) {
                window.cancelAnimationFrame(frameId);
            }

            frameId = window.requestAnimationFrame(() => {
                overrides.value = createLangrThemeOverrides();
                frameId = 0;
            });
            return;
        }

        overrides.value = createLangrThemeOverrides();
    };

    onMounted(() => {
        refresh();

        if (typeof window !== "undefined") {
            window.addEventListener("focus", refresh);
        }

        if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
            return;
        }

        observer = new MutationObserver(refresh);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style"],
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ["class", "style"],
            });
        }
    });

    onBeforeUnmount(() => {
        observer?.disconnect();

        if (typeof window !== "undefined") {
            window.removeEventListener("focus", refresh);

            if (frameId !== 0 && typeof window.cancelAnimationFrame === "function") {
                window.cancelAnimationFrame(frameId);
            }
        }
    });

    return overrides;
}

export { useLangrNaiveTheme, useLangrNaiveThemeOverrides };
