import { unified } from "unified";
import retextEnglish from "retext-english";
import { Root, Content, Literal, Parent, Sentence } from "nlcst";
import { visit } from "unist-util-visit";
import { toString } from "nlcst-to-string";

import { Phrase, Word } from "@/db/interface";
import type Plugin from "@/plugin";
import { escapeHtml, unsafeMarkSafeHtml } from "@/utils/safeHtml";
import type { SafeHtml } from "@/utils/safeHtml";

const STATUS_MAP = ["ignore", "learning", "familiar", "known", "learned"] as const;
type AnyNode = Root | Content | Content[];
type PhraseNode = Parent & { type: "PhraseNode" };

type ParseContext = {
    phrases: Phrase[];
    words: Map<string, Word>;
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

export class TextParser {
    plugin: Plugin;
    processor = unified().use(retextEnglish);

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async parse(data: string): Promise<SafeHtml> {
        return this.text2HTML(data.trim());
    }

    async countWords(text: string): Promise<[number, number, number]> {
        const ast = this.processor.parse(text) as Root;
        const wordSet = this.collectWords(ast);
        let stored = await this.plugin.db.getStoredWords({
            article: "",
            words: [...wordSet],
        });
        let ignore = 0;
        stored.words.forEach((word) => {
            if (word.status === 0) ignore++;
        });
        let learn = stored.words.length - ignore;
        let unknown = wordSet.size - stored.words.length;
        return [unknown, learn, ignore];
    }

    async text2HTML(text: string): Promise<SafeHtml> {
        const phraseResult = await this.plugin.db.getStoredWords({
            article: text.toLowerCase(),
            words: [],
        });
        const phrases = [...phraseResult.phrases].sort((a, b) => a.offset - b.offset);
        const ast = this.processor.parse(text) as Root;
        this.wrapPhrases(ast, phrases);

        const wordSet = this.collectWords(ast);
        const stored = await this.plugin.db.getStoredWords({
            article: "",
            words: [...wordSet],
        });

        const context: ParseContext = {
            phrases,
            words: new Map(stored.words.map((w) => [w.text, w])),
        };

        return unsafeMarkSafeHtml(this.toHTMLString(ast, context));
    }

    async getWordsPhrases(text: string) {
        const ast = this.processor.parse(text) as Root;
        const words = this.collectWords(ast);
        let wordsPhrases = await this.plugin.db.getStoredWords({
            article: text.toLowerCase(),
            words: [...words],
        });

        let payload = [] as string[];
        wordsPhrases.phrases.forEach((word) => {
            if (word.status > 0) payload.push(word.text);
        });
        wordsPhrases.words.forEach((word) => {
            if (word.status > 0) payload.push(word.text);
        });

        return this.plugin.db.getExpressionsSimple(payload);
    }

    private collectWords(ast: Root | Content): Set<string> {
        const wordSet = new Set<string>();
        visit(ast, "WordNode", (word) => {
            const text = toString(word).toLowerCase();
            if (isWordLike(text)) {
                wordSet.add(text);
            }
        });
        return wordSet;
    }

    private wrapPhrases(tree: Root, phrases: Phrase[]): void {
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

    private toHTMLString(node: AnyNode, context: ParseContext): string {
        if (hasValue(node)) {
            return escapeHtml(node.value);
        }
        if (Array.isArray(node)) {
            return node.map((n) => this.toHTMLString(n, context)).join("");
        }
        if (hasChildren(node)) {
            switch (node.type as string) {
                case "WordNode": {
                    let text = toString(node.children);
                    let textLower = text.toLowerCase();
                    let status = context.words.has(textLower)
                        ? STATUS_MAP[context.words.get(textLower)!.status]
                        : "new";

                    return isWordLike(text)
                        ? `<span class="word ${status}">${escapeHtml(text)}</span>`
                        : `<span class="other">${escapeHtml(text)}</span>`;
                }
                case "PhraseNode": {
                    const phraseNode = node as PhraseNode;
                    let childText = toString(phraseNode.children);
                    let text = this.toHTMLString(phraseNode.children as Content[], context);
                    let phrase = context.phrases.find((p) => p.text === childText.toLowerCase());
                    let status = phrase ? STATUS_MAP[phrase.status] : "new";

                    return `<span class="phrase ${status}">${text}</span>`;
                }
                case "SentenceNode": {
                    return `<span class="stns">${this.toHTMLString(node.children, context)}</span>`;
                }
                case "ParagraphNode": {
                    return `<p>${this.toHTMLString(node.children, context)}</p>`;
                }
                default: {
                    return `<div class="article">${this.toHTMLString(node.children, context)}</div>`;
                }
            }
        }
        return "";
    }
}
