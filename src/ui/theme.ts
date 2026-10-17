import {
    computed,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    type ComputedRef,
    type ShallowRef,
} from "vue";
import { darkTheme, type GlobalTheme, type GlobalThemeOverrides } from "naive-ui";

const DEFAULT_PRIMARY_COLOR = "#00b8c4";
const DEFAULT_PRIMARY_COLOR_HOVER = "#00a0ab";
const DEFAULT_PRIMARY_COLOR_PRESSED = "#008b95";

function useLangrNaiveTheme(isDark: () => boolean): ComputedRef<GlobalTheme | null> {
    return computed(() => (isDark() ? darkTheme : null));
}

const baseThemeOverrides = {
    common: {
        borderRadius: "4px",
        borderRadiusSmall: "4px",
        heightTiny: "24px",
        heightSmall: "28px",
        fontSize: "13px",
        fontSizeMedium: "13px",
    },
    Button: {
        borderRadiusTiny: "4px",
        borderRadiusSmall: "4px",
        heightTiny: "24px",
        heightSmall: "28px",
        paddingTiny: "0 8px",
        paddingSmall: "0 10px",
        fontWeight: "600",
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
        titleFontWeight: "600",
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
        borderRadius: "4px",
        borderRadiusSmall: "4px",
        fontSizeTiny: "12px",
        fontSizeSmall: "13px",
        paddingTiny: "0 8px",
        paddingSmall: "0 9px",
    },
    Pagination: {
        itemBorderRadius: "4px",
    },
    Radio: {
        buttonBorderRadius: "4px",
        buttonHeightSmall: "26px",
        fontSizeMedium: "13px",
        fontSizeSmall: "13px",
    },
    Select: {
        peers: {
            InternalSelection: {
                borderRadius: "4px",
                fontSizeSmall: "13px",
            },
        },
    },
    Tag: {
        borderRadius: "4px",
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

    // color-mix(in srgb, ...) resolves to CSS Color 4 syntax in Obsidian's browser.
    // Naive UI's color utilities require legacy rgb/rgba values.
    const srgbMatch = color.match(
        /^color\(srgb\s+([+-]?[\d.eE]+)\s+([+-]?[\d.eE]+)\s+([+-]?[\d.eE]+)(?:\s*\/\s*([+-]?[\d.eE]+))?\s*\)$/i
    );
    if (srgbMatch) {
        const channels = srgbMatch.slice(1, 4).map(Number);
        const alpha = srgbMatch[4] === undefined ? 1 : Number(srgbMatch[4]);
        if (channels.some((channel) => !Number.isFinite(channel)) || !Number.isFinite(alpha)) {
            return fallback;
        }
        const rgb = channels.map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255));
        return `rgba(${rgb.join(", ")}, ${Math.min(1, Math.max(0, alpha))})`;
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
    const primaryColor = resolveCssColorVar("--langr-accent", DEFAULT_PRIMARY_COLOR);
    const primaryColorHover = resolveCssColorVar(
        "--langr-accent-hover",
        DEFAULT_PRIMARY_COLOR_HOVER
    );
    const primaryColorPressed = resolveCssColorVar(
        "--langr-accent-hot",
        DEFAULT_PRIMARY_COLOR_PRESSED
    );
    const surface = resolveCssColorVar("--langr-surface-inset", "#f4f4f5");
    const control = resolveCssColorVar("--langr-surface-control", "#e9e9ec");
    const popover = resolveCssColorVar("--langr-surface-popover", "#ffffff");
    const onAccent = resolveCssColorVar("--langr-text-on-accent", "#ffffff");
    const hover = resolveCssColorVar("--langr-surface-hover", "#ededf0");
    const surfaceRaised = resolveCssColorVar("--langr-surface-raised", "#ffffff");
    const border = resolveCssColorVar("--langr-border", "#d4d4d8");
    const text = resolveCssColorVar("--text-normal", "#1f2328");
    const muted = resolveCssColorVar("--text-muted", "#6b7280");

    return {
        ...baseThemeOverrides,
        common: {
            ...baseThemeOverrides.common,
            primaryColor,
            primaryColorHover,
            primaryColorPressed,
            primaryColorSuppl: primaryColorHover,
            borderColor: border,
            textColorBase: text,
            textColor1: text,
            textColor2: muted,
            bodyColor: surfaceRaised,
            cardColor: surfaceRaised,
            modalColor: popover,
            popoverColor: popover,
            tableColor: surfaceRaised,
            inputColor: surface,
            hoverColor: hover,
            dividerColor: border,
        },
        Button: {
            ...baseThemeOverrides.Button,
            color: control,
            colorHover: hover,
            colorFocus: hover,
            colorPressed: surface,
            textColor: text,
            textColorPrimary: onAccent,
            textColorHoverPrimary: onAccent,
            textColorPressedPrimary: onAccent,
            textColorFocusPrimary: onAccent,
            border: `1px solid ${border}`,
            borderHover: `1px solid ${primaryColorHover}`,
            borderFocus: `1px solid ${primaryColor}`,
            borderPressed: `1px solid ${primaryColorPressed}`,
            textColorHover: primaryColorHover,
            textColorFocus: primaryColor,
        },
        DataTable: {
            ...baseThemeOverrides.DataTable,
            thColor: surface,
            tdColor: surfaceRaised,
            tdColorHover: hover,
            borderColor: border,
            thTextColor: muted,
            tdTextColor: text,
        },
        Input: {
            ...baseThemeOverrides.Input,
            color: surface,
            colorFocus: surfaceRaised,
            border: `1px solid ${border}`,
            borderHover: `1px solid ${primaryColorHover}`,
            borderFocus: `1px solid ${primaryColor}`,
            textColor: text,
            placeholderColor: muted,
        },
        Select: {
            ...baseThemeOverrides.Select,
            peers: {
                InternalSelection: {
                    ...baseThemeOverrides.Select.peers.InternalSelection,
                    color: surface,
                    colorActive: surfaceRaised,
                    border: `1px solid ${border}`,
                    borderHover: `1px solid ${primaryColorHover}`,
                    borderActive: `1px solid ${primaryColor}`,
                    textColor: text,
                },
            },
        },
        Tag: {
            ...baseThemeOverrides.Tag,
            colorInfo: surface,
            borderInfo: `1px solid ${primaryColor}`,
            textColorInfo: primaryColor,
            checkableBorderColorChecked: primaryColor,
            checkableColorChecked: surfaceRaised,
            checkableTextColorChecked: primaryColorPressed,
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
