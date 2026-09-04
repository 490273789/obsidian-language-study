type ExpressionStatus = 0 | 1 | 2 | 3 | 4;
type ExpressionType = "WORD" | "PHRASE";

interface ArticleWords {
    article: string;
    words: string[];
}

interface Word {
    text: string;
    status: ExpressionStatus;
}

interface Phrase {
    text: string;
    status: ExpressionStatus;
    offset: number;
}

interface WordsPhrase {
    words: Word[];
    phrases: Phrase[];
}

interface Sentence {
    text: string;
    trans: string;
    origin: string;
}

interface ExpressionInfo {
    expression: string;
    meaning: string;
    status: ExpressionStatus;
    t: ExpressionType;
    tags: string[];
    notes: string[];
    sentences: Sentence[];
}

interface ExpressionInfoSimple {
    expression: string;
    meaning: string;
    status: ExpressionStatus;
    t: ExpressionType;
    tags: string[];
    note_num: number;
    sen_num: number;
    date: number;
}

interface CountInfo {
    word_count: number[];
    phrase_count: number[];
}

interface Span {
    from: number;
    to: number;
}

interface WordCount {
    today: number[];
    accumulated: number[];
}

interface DailyLearningStat {
    dateLabel: string;
    timestamp: number;
    dayIgnore: number;
    dayLearned: number;
    accumulated: number;
    statusBreakdown: readonly number[];
    accumulatedBreakdown: readonly number[];
}

interface LearningRecordTimeItem {
    date: number;
    status: ExpressionStatus;
    type?: ExpressionType;
}

export type {
    ExpressionStatus,
    ExpressionType,
    ArticleWords,
    Word,
    Phrase,
    WordsPhrase,
    Sentence,
    ExpressionInfo,
    ExpressionInfoSimple,
    CountInfo,
    WordCount,
    Span,
    DailyLearningStat,
    LearningRecordTimeItem,
};
