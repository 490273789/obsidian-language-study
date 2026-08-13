import type {
    ArticleWords,
    ExpressionInfoSimple,
    ExpressionStatus,
    WordsPhrase,
} from "@/db/interface";
import type { SafeHtml } from "@/utils/safeHtml";

import {
    countWordStatuses,
    collectArticleWords,
    renderArticle,
    selectPositiveExpressions,
} from "./renderArticle";
import type { ArticleRenderContext } from "./renderArticle";

type ParserQueryStore = Readonly<{
    getStoredWords(payload: ArticleWords): Promise<WordsPhrase>;
    getExpressionsSimple(
        expressions: string[],
    ): Promise<ExpressionInfoSimple[]>;
}>;

export class TextParser {
    constructor(private readonly db: ParserQueryStore) {}

    async parse(data: string): Promise<SafeHtml> {
        const text = data.trim();
        const context = await this.buildRenderContext(text);
        return renderArticle(text, context);
    }

    async countWords(text: string): Promise<[number, number, number]> {
        const words = collectArticleWords(text);
        const stored = await this.db.getStoredWords({ article: "", words });
        return countWordStatuses(words, stored.words);
    }

    async getWordsPhrases(text: string): Promise<ExpressionInfoSimple[]> {
        const words = collectArticleWords(text);
        const wordsPhrases = await this.db.getStoredWords({
            article: text.toLowerCase(),
            words,
        });
        return this.db.getExpressionsSimple(
            selectPositiveExpressions(wordsPhrases),
        );
    }

    private async buildRenderContext(
        text: string,
    ): Promise<ArticleRenderContext> {
        const words = collectArticleWords(text);
        const wordsPhrases = await this.db.getStoredWords({
            article: text.toLowerCase(),
            words,
        });

        const wordStatuses = new Map<string, ExpressionStatus>();
        wordsPhrases.words.forEach((word) =>
            wordStatuses.set(word.text, word.status),
        );

        return {
            phrases: wordsPhrases.phrases,
            wordStatuses,
        };
    }
}
