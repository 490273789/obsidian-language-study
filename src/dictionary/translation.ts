import { search as youdaoSearch } from "./youdao/engine";

export type SentenceTranslateEngine = (text: string) => Promise<unknown>;

export function parseTranslationFromHtml(html: string): string {
    if (!html) {
        return "";
    }
    const paragraphs = html.match(/<p>([^<>]+)<\/p>/g);
    return paragraphs?.[1]?.match(/<p>(.*)<\/p>/)?.[1]?.trim() ?? "";
}

export async function translateSentence(
    sentence: string,
    engine: SentenceTranslateEngine = youdaoSearch
): Promise<string> {
    const trimmed = sentence.trim();
    if (!trimmed) {
        return "";
    }
    try {
        const res = (await engine(trimmed)) as
            | { result?: { translation?: string } }
            | null
            | undefined;
        if (res && res.result && typeof res.result.translation === "string") {
            return parseTranslationFromHtml(res.result.translation);
        }
        return "";
    } catch {
        return "";
    }
}
