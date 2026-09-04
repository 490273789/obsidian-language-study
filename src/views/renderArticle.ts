import { unified } from "unified";
import retextEnglish from "retext-english";
import { Root, Content, Literal, Parent, Sentence } from "nlcst";
import { visit } from "unist-util-visit";
import { toString } from "nlcst-to-string";

import type { ExpressionStatus, Phrase, Word, WordsPhrase } from "@/db/interface";
import { escapeHtml, unsafeMarkSafeHtml } from "@/utils/safeHtml";
import type { SafeHtml } from "@/utils/safeHtml";

const STATUS_MAP = ["ignore", "learning", "familiar", "known", "learned"] as const;
const processor = unified().use(retextEnglish);

type AnyNode = Root | Content | Content[];
type PhraseNode = Parent & { type: "PhraseNode" };

type ArticleRenderContext = Readonly<{
    phrases: readonly Phrase[];
    wordStatuses: ReadonlyMap<string, ExpressionStatus>;
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

// 从文章中收集所有单词（小写、去重、过滤数字与中文）
function collectArticleWords(text: string): string[] {
    const ast = processor.parse(text) as Root;
    const wordSet = new Set<string>();
    visit(ast, "WordNode", (word) => {
        const wordText = toString(word).toLowerCase();
        if (isWordLike(wordText)) {
            wordSet.add(wordText);
        }
    });
    return [...wordSet];
}

// 根据已存储单词的状态，统计 [未知, 已学, 忽略]
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

// 筛选状态为正的表达式，词组在前、单词在后
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

// 纯渲染：text + 已解析的 context → SafeHtml，无副作用、无 Obsidian 依赖
function renderArticle(text: string, context: ArticleRenderContext): SafeHtml {
    const phrases = [...context.phrases].sort((a, b) => a.offset - b.offset);
    const ast = processor.parse(text) as Root;
    wrapPhrases(ast, phrases);

    const parseContext: ParseContext = {
        phrases,
        wordStatuses: context.wordStatuses,
    };

    return unsafeMarkSafeHtml(toHTMLString(ast, parseContext));
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

function toHTMLString(node: AnyNode, context: ParseContext): string {
    if (hasValue(node)) {
        return escapeHtml(node.value);
    }
    if (Array.isArray(node)) {
        return node.map((n) => toHTMLString(n, context)).join("");
    }
    if (hasChildren(node)) {
        switch (node.type as string) {
            case "WordNode": {
                let text = toString(node.children);
                let textLower = text.toLowerCase();
                let status = context.wordStatuses.has(textLower)
                    ? STATUS_MAP[context.wordStatuses.get(textLower)!]
                    : "new";

                return isWordLike(text)
                    ? `<span class="word ${status}">${escapeHtml(text)}</span>`
                    : `<span class="other">${escapeHtml(text)}</span>`;
            }
            case "PhraseNode": {
                const phraseNode = node as PhraseNode;
                let childText = toString(phraseNode.children);
                let text = toHTMLString(phraseNode.children as Content[], context);
                let phrase = context.phrases.find((p) => p.text === childText.toLowerCase());
                let status = phrase ? STATUS_MAP[phrase.status] : "new";

                return `<span class="phrase ${status}">${text}</span>`;
            }
            case "SentenceNode": {
                return `<span class="stns">${toHTMLString(node.children, context)}</span>`;
            }
            case "ParagraphNode": {
                return `<p>${toHTMLString(node.children, context)}</p>`;
            }
            default: {
                return `<div class="article">${toHTMLString(node.children, context)}</div>`;
            }
        }
    }
    return "";
}

export { countWordStatuses, collectArticleWords, renderArticle, selectPositiveExpressions };
export type { ArticleRenderContext };
