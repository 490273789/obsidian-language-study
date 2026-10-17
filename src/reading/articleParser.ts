import { unified } from "unified";
import retextEnglish from "retext-english";
import type { Root, Content, Literal, Parent, Sentence } from "nlcst";
import { visit } from "unist-util-visit";
import { toString } from "nlcst-to-string";

import type {
    ArticleWords,
    ExpressionInfoSimple,
    ExpressionStatus,
    Phrase,
    Word,
    WordsPhrase,
} from "@/db/interface";
import { escapeHtml, unsafeMarkSafeHtml } from "@/utils/safeHtml";
import type { SafeHtml } from "@/utils/safeHtml";

const STATUS_MAP = ["ignore", "learning", "familiar", "known", "learned"] as const;
const processor = unified().use(retextEnglish);

type AnyNode = Root | Content | Content[];
type PhraseNode = Parent & { type: "PhraseNode" };

export type RenderArticleResult = Readonly<{
    html: SafeHtml;
    newWords: readonly string[];
}>;

export type ArticleParserStore = Readonly<{
    getStoredWords(payload: ArticleWords): Promise<WordsPhrase>;
    getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]>;
}>;

type ParseContext = {
    phrases: readonly Phrase[];
    wordStatuses: ReadonlyMap<string, ExpressionStatus>;
};

function hasChildren(node: unknown): node is Parent {
    return typeof node === "object" && node !== null && "children" in node;
}

function hasValue(node: unknown): node is Literal {
    return typeof node === "object" && node !== null && "value" in node;
}

function isWordLike(text: string): boolean {
    return !/[0-9\u4e00-\u9fa5]/.test(text);
}

function collectWordsFromAst(ast: Root): string[] {
    const wordSet = new Set<string>();
    visit(ast, "WordNode", (word) => {
        const wordText = toString(word).toLowerCase();
        if (isWordLike(wordText)) {
            wordSet.add(wordText);
        }
    });
    return [...wordSet];
}

function countWordStatuses(
    words: readonly string[],
    storedWords: readonly Word[]
): [number, number, number] {
    const wordSet = new Set(words);
    let ignore = 0;
    storedWords.forEach((word) => {
        if (word.status === 0) ignore++;
    });
    const learn = storedWords.length - ignore;
    const unknown = wordSet.size - storedWords.length;
    return [unknown, learn, ignore];
}

function selectPositiveExpressions(wordsPhrases: WordsPhrase): string[] {
    const payload: string[] = [];
    wordsPhrases.phrases.forEach((phrase) => {
        if (phrase.status > 0) payload.push(phrase.text);
    });
    wordsPhrases.words.forEach((word) => {
        if (word.status > 0) payload.push(word.text);
    });
    return payload;
}

function wrapPhrases(tree: Root, phrases: Phrase[]): void {
    if (phrases.length === 0) {
        return;
    }

    let phraseIndex = 0;
    visit(tree, "SentenceNode", (node: Sentence) => {
        if (phraseIndex >= phrases.length) {
            return;
        }
        const sentenceEnd = node.position?.end.offset ?? -1;
        while (phraseIndex < phrases.length && phrases[phraseIndex].offset < sentenceEnd) {
            const phrase = phrases[phraseIndex];
            const children = node.children;
            const start = children.findIndex(
                (child) => child.position?.start.offset === phrase.offset
            );
            const end = children.findIndex(
                (child) => child.position?.end.offset === phrase.offset + phrase.text.length
            );

            if (start === -1 || end === -1 || end < start) {
                phraseIndex++;
                continue;
            }

            const phraseChildren = children.slice(start, end + 1);
            children.splice(start, end - start + 1, {
                type: "PhraseNode",
                children: phraseChildren,
                position: {
                    start: phraseChildren[0].position?.start,
                    end: phraseChildren[phraseChildren.length - 1].position?.end,
                },
            } as unknown as (typeof children)[number]);
            phraseIndex++;
        }
    });
}

function toHTMLString(node: AnyNode, context: ParseContext, newWords: Set<string>): string {
    if (hasValue(node)) {
        return escapeHtml(node.value);
    }
    if (Array.isArray(node)) {
        return node.map((n) => toHTMLString(n, context, newWords)).join("");
    }
    if (hasChildren(node)) {
        switch (node.type as string) {
            case "WordNode": {
                const text = toString(node.children);
                const textLower = text.toLowerCase();
                const isWord = isWordLike(text);
                const isNew = !context.wordStatuses.has(textLower);
                const status = isNew ? "new" : STATUS_MAP[context.wordStatuses.get(textLower)!];

                if (isWord && isNew) {
                    newWords.add(textLower);
                }

                return isWord
                    ? `<span class="word ${status}">${escapeHtml(text)}</span>`
                    : `<span class="other">${escapeHtml(text)}</span>`;
            }
            case "PhraseNode": {
                const phraseNode = node as PhraseNode;
                const childText = toString(phraseNode.children);
                const text = toHTMLString(phraseNode.children as Content[], context, newWords);
                const phrase = context.phrases.find((p) => p.text === childText.toLowerCase());
                const status = phrase ? STATUS_MAP[phrase.status] : "new";

                return `<span class="phrase ${status}">${text}</span>`;
            }
            case "SentenceNode": {
                return `<span class="stns">${toHTMLString(node.children, context, newWords)}</span>`;
            }
            case "ParagraphNode": {
                return `<p>${toHTMLString(node.children, context, newWords)}</p>`;
            }
            default: {
                return `<div class="article">${toHTMLString(node.children, context, newWords)}</div>`;
            }
        }
    }
    return "";
}

export class ReadingArticleParser {
    constructor(private readonly store: ArticleParserStore) {}

    async parse(data: string): Promise<RenderArticleResult> {
        const text = data.trim();
        const ast = processor.parse(text) as Root;
        const words = collectWordsFromAst(ast);

        const wordsPhrases = await this.store.getStoredWords({
            article: text.toLowerCase(),
            words,
        });

        const wordStatuses = new Map<string, ExpressionStatus>();
        wordsPhrases.words.forEach((word) => wordStatuses.set(word.text, word.status));

        const phrases = [...wordsPhrases.phrases].sort((a, b) => a.offset - b.offset);
        wrapPhrases(ast, phrases);

        const newWords = new Set<string>();
        const parseContext: ParseContext = {
            phrases,
            wordStatuses,
        };

        const htmlString = toHTMLString(ast, parseContext, newWords);
        return {
            html: unsafeMarkSafeHtml(htmlString),
            newWords: [...newWords],
        };
    }

    async countWords(text: string): Promise<[number, number, number]> {
        const trimmed = text.trim();
        if (!trimmed) {
            return [0, 0, 0];
        }
        const ast = processor.parse(trimmed) as Root;
        const words = collectWordsFromAst(ast);
        const stored = await this.store.getStoredWords({ article: "", words });
        return countWordStatuses(words, stored.words);
    }

    async getWordsPhrases(text: string): Promise<ExpressionInfoSimple[]> {
        const trimmed = text.trim();
        if (!trimmed) {
            return [];
        }
        const ast = processor.parse(trimmed) as Root;
        const words = collectWordsFromAst(ast);
        const wordsPhrases = await this.store.getStoredWords({
            article: trimmed.toLowerCase(),
            words,
        });
        return this.store.getExpressionsSimple(selectPositiveExpressions(wordsPhrases));
    }
}
