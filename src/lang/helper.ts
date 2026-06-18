import zh from "./locale/zh";
import en from "./locale/en";
import zh_TW from "./locale/zh-TW";

const localeMap: { [k: string]: Partial<typeof en> } = {
    en,
    zh,
    "zh-TW": zh_TW,
};

function getSavedLanguage(): string {
    if (typeof window === "undefined") {
        return "en";
    }

    try {
        return window.localStorage?.getItem("language") || "en";
    } catch {
        return "en";
    }
}

const lang = getSavedLanguage();
const locale = localeMap[lang || "en"];

export function t(text: keyof typeof en): string {
    return (locale && locale[text]) || en[text];
}
