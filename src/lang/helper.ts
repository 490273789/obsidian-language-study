import zh from "./locale/zh";
import en from "./locale/en";
import zh_TW from "./locale/zh-TW";

const localeMap: { [k: string]: Partial<typeof en> } = {
    en,
    zh,
    "zh-TW": zh_TW,
};

export function getStoredLanguage(): string {
    const storage = globalThis.localStorage;
    if (!storage) {
        return "en";
    }

    try {
        return storage.getItem("language") ?? "en";
    } catch {
        return "en";
    }
}

const locale = localeMap[getStoredLanguage()] ?? en;

export function t(text: keyof typeof en): string {
    return (locale && locale[text]) || en[text];
}
