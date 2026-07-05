import type { ExpressionInfoSimple } from "@/db/interface";

type ReadingSection = "article" | "words" | "notes";

type ReadingDocumentFile = {
    read(): Promise<string>;
    write(text: string): Promise<void>;
};

type ReadingProgressStore = {
    getPosition(): Promise<string>;
    setPosition(position: string): Promise<void>;
};

type ReadingExpressionLookup = {
    getWordsPhrases(text: string): Promise<ExpressionInfoSimple[]>;
};

type ReadingDocumentDependencies = {
    file: ReadingDocumentFile;
    progressStore: ReadingProgressStore;
    expressionLookup: ReadingExpressionLookup;
};

type ReadingSectionRange = {
    start: number;
    end: number;
};

type ReadingPageRange = {
    startLine: number;
    endLine: number;
    totalLines: number;
};

type ReadingPageState = {
    articleLines: string[];
    totalLines: number;
    pageRange: ReadingPageRange;
    pageText: string;
};

const sectionMarkers: Record<ReadingSection, string> = {
    article: "^^^article",
    words: "^^^words",
    notes: "^^^notes",
};

function divideReadingSections(
    lines: string[]
): Partial<Record<ReadingSection, ReadingSectionRange>> {
    let positions = Object.entries(sectionMarkers).map(([section, marker]) => {
        return [section as ReadingSection, lines.indexOf(marker)] as const;
    });
    positions.sort((a, b) => a[1] - b[1]);
    positions = positions.filter((entry) => entry[1] !== -1);

    const segments: Partial<Record<ReadingSection, ReadingSectionRange>> = {};
    for (let index = 0; index < positions.length; index++) {
        const next = positions[index + 1];
        segments[positions[index][0]] = {
            start: positions[index][1] + 1,
            end: next ? next[1] : lines.length,
        };
    }
    return segments;
}

function normalizePageSize(defaultParagraphs: string): number {
    return defaultParagraphs === "all" ? Number.MAX_VALUE : parseInt(defaultParagraphs);
}

function getInitialPage(lastPosition: number, pageSize: number): number {
    return lastPosition ? Math.ceil(lastPosition / pageSize) : 1;
}

function getPositionForPage(page: number, pageSize: number): string {
    return `${(page - 1) * pageSize + 1}`;
}

function getPageRange(page: number, pageSize: number, totalLines: number): ReadingPageRange {
    const startLine = (page - 1) * pageSize;
    const endLine = startLine + pageSize > totalLines ? totalLines : startLine + pageSize;
    return { startLine, endLine, totalLines };
}

function getPageForResizedPageSize(
    page: number,
    previousPageSize: number,
    pageSize: number
): number {
    return Math.ceil(((page - 1) * previousPageSize + 1) / pageSize);
}

function renderWordsSection(expressions: ExpressionInfoSimple[]): string {
    return (
        expressions.map((word) => `+ **${word.expression}** : ${word.meaning}`).join("\n") + "\n\n"
    );
}

class ReadingDocument {
    private file: ReadingDocumentFile;
    private progressStore: ReadingProgressStore;
    private expressionLookup: ReadingExpressionLookup;

    constructor(dependencies: ReadingDocumentDependencies) {
        this.file = dependencies.file;
        this.progressStore = dependencies.progressStore;
        this.expressionLookup = dependencies.expressionLookup;
    }

    async getLastPosition(): Promise<number> {
        const lastPosition = await this.progressStore.getPosition();
        return parseInt(lastPosition) || 0;
    }

    async setPagePosition(page: number, pageSize: number): Promise<void> {
        await this.progressStore.setPosition(getPositionForPage(page, pageSize));
    }

    async readSection(section: ReadingSection, create = false): Promise<string | null> {
        const text = await this.file.read();
        const lines = text.split("\n");
        const segments = divideReadingSections(lines);
        const segment = segments[section];
        if (!segment) {
            if (create) {
                await this.file.write(`${text}\n${sectionMarkers[section]}\n\n`);
                return "";
            }
            return null;
        }
        return lines.slice(segment.start, segment.end).join("\n");
    }

    async writeSection(section: ReadingSection, content: string): Promise<void> {
        const text = await this.file.read();
        const lines = text.split("\n");
        const segment = divideReadingSections(lines)[section];
        if (!segment) {
            return;
        }

        const newText =
            lines.slice(0, segment.start).join("\n") +
            "\n" +
            content.trim() +
            "\n\n" +
            lines.slice(segment.end, lines.length).join("\n");
        await this.file.write(newText);
    }

    getArticleLines(text: string): string[] {
        const lines = text.split("\n");
        const article = divideReadingSections(lines).article;
        if (!article) {
            return [];
        }
        return lines.slice(article.start, article.end);
    }

    getInitialPage(pageSize: number, lastPosition: number): number {
        return getInitialPage(lastPosition, pageSize);
    }

    getPageForResizedPageSize(page: number, previousPageSize: number, pageSize: number): number {
        return getPageForResizedPageSize(page, previousPageSize, pageSize);
    }

    getPageState(articleLines: string[], page: number, pageSize: number): ReadingPageState {
        const pageRange = getPageRange(page, pageSize, articleLines.length);
        return {
            articleLines,
            totalLines: articleLines.length,
            pageRange,
            pageText: articleLines.slice(pageRange.startLine, pageRange.endLine).join("\n"),
        };
    }

    async publishWordsSection(): Promise<"skipped" | "published"> {
        const words = await this.readSection("words");
        if (words === null) {
            return "skipped";
        }

        const article = await this.readSection("article");
        if (article === null) {
            return "skipped";
        }

        const expressions = await this.expressionLookup.getWordsPhrases(article);
        await this.writeSection("words", renderWordsSection(expressions));
        return "published";
    }
}

export {
    ReadingDocument,
    divideReadingSections,
    getInitialPage,
    getPageForResizedPageSize,
    getPageRange,
    getPositionForPage,
    normalizePageSize,
    renderWordsSection,
};
export type {
    ReadingDocumentDependencies,
    ReadingDocumentFile,
    ReadingExpressionLookup,
    ReadingPageRange,
    ReadingPageState,
    ReadingProgressStore,
    ReadingSection,
    ReadingSectionRange,
};
