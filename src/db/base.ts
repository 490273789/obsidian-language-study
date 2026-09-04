import {
    ArticleWords,
    WordsPhrase,
    Sentence,
    ExpressionInfo,
    ExpressionInfoSimple,
    CountInfo,
    WordCount,
} from "./interface";
import type { LearningRecordCandidate, LearningRecordCommitReceipt } from "@/learningRecord/intake";

abstract class DbProvider {
    abstract open(): Promise<void>;
    abstract close(): void;
    // 在文章中寻找之前记录过的单词和词组
    abstract getStoredWords(payload: ArticleWords): Promise<WordsPhrase>;
    // 查询单个单词/词组的全部信息
    abstract getExpression(expression: string): Promise<ExpressionInfo | null>;
    //获取一批单词的简略信息
    abstract getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]>;
    // 某一时间之后添加的全部单词
    abstract getExpressionAfter(time: string): Promise<ExpressionInfo[]>;
    // 获取全部单词的简略信息
    abstract getAllExpressionSimple(ignores?: boolean): Promise<ExpressionInfoSimple[]>;
    abstract commitWhole(
        candidate: LearningRecordCandidate,
        firstAcceptedAtIfNew: number
    ): Promise<LearningRecordCommitReceipt>;
    // 获取所有tag
    abstract getTags(): Promise<string[]>;
    // 批量发送单词，全部标记为ignore
    abstract postIgnoreWords(payload: string[]): Promise<void>;
    // 查询一个例句是否已经记录过
    abstract tryGetSen(text: string): Promise<Sentence | null>;
    // 获取各类单词的个数
    abstract getCount(): Promise<CountInfo>;
    // 获取7天内的统计信息
    abstract countSeven(): Promise<WordCount[]>;
}

export default DbProvider;
