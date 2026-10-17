export type ReadingSelection = Readonly<{
    expression: string;
    sentenceText: string;
    origin: string;
}>;

export type ReadingSelectionPoint = Readonly<{
    x: number;
    y: number;
}>;

export type ReadingSelectionEvent = Readonly<{
    text: string;
    selection: ReadingSelection | null;
    point: ReadingSelectionPoint;
}>;

export function findEnclosingSentenceText(node: Node | null): string | null {
    if (!node) {
        return null;
    }
    let current: Element | null = node instanceof Element ? node : node.parentElement;

    while (current) {
        if (current.classList?.contains("stns")) {
            const raw = current.textContent ?? "";
            const normalized = raw.replace(/\s+/g, " ").trim();
            return normalized.length > 0 ? normalized : null;
        }
        current = current.parentElement;
    }
    return null;
}

export function extractReadingSelection(
    node: Node | null,
    expression: string,
    origin: string
): ReadingSelection | null {
    const trimmedExpression = expression.trim();
    if (!trimmedExpression) {
        return null;
    }
    const sentenceText = findEnclosingSentenceText(node);
    if (!sentenceText) {
        return null;
    }
    return {
        expression: trimmedExpression,
        sentenceText,
        origin: origin.trim(),
    };
}

export function resolveReadingSelection(
    selectSpan: HTMLElement,
    origin: string
): { text: string; selection: ReadingSelection | null } {
    const text = selectSpan.textContent ?? "";
    const selection = extractReadingSelection(selectSpan, text, origin);
    return { text, selection };
}

export function clearReadingSelection(container?: ParentNode | null): void {
    const root = container ?? (typeof document !== "undefined" ? document : null);
    if (!root) return;
    const selects = root.querySelectorAll<HTMLElement>("span.select");
    selects.forEach((el) => {
        const parent = el.parentElement;
        if (!parent) return;
        const children = Array.from(el.childNodes);
        for (const child of children) {
            parent.insertBefore(child, el);
        }
        el.remove();
    });
}

export function wrapReadingSelection(
    elStart: HTMLElement,
    elEnd: HTMLElement,
    container?: ParentNode | null
): HTMLElement | null {
    clearReadingSelection(container);

    const startSentence = elStart.closest?.(".stns");
    const endSentence = elEnd.closest?.(".stns");
    if (!startSentence || !endSentence || startSentence !== endSentence) {
        return null;
    }

    if (elStart.parentElement !== elEnd.parentElement) {
        return null;
    }

    const parent = elStart.parentNode;
    if (!parent) {
        return null;
    }

    // Normalize order if dragging backwards
    if (
        elStart !== elEnd &&
        (elStart.compareDocumentPosition(elEnd) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    ) {
        const temp = elStart;
        elStart = elEnd;
        elEnd = temp;
    }

    const doc = elStart.ownerDocument || document;
    const selectSpan = doc.createElement("span");
    selectSpan.className = "select";

    parent.insertBefore(selectSpan, elStart);

    let current: Node | null = elStart;
    while (current && current !== elEnd) {
        const next: ChildNode | null = current.nextSibling;
        selectSpan.appendChild(current);
        current = next;
    }
    selectSpan.appendChild(elEnd);

    return selectSpan;
}

export function getSelectableElement(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    if (
        target.classList?.contains("word") ||
        target.classList?.contains("phrase") ||
        target.classList?.contains("select")
    ) {
        return target;
    }
    return target.closest<HTMLElement>(".word, .phrase, .select");
}

export interface ReadingSelectionCoordinatorOptions {
    getContainer?: () => ParentNode | null;
    getDocumentOrigin: () => string;
    onSelect: (event: ReadingSelectionEvent) => void;
}

export class ReadingSelectionCoordinator {
    private anchor: HTMLElement | null = null;
    private options: ReadingSelectionCoordinatorOptions;

    constructor(options: ReadingSelectionCoordinatorOptions) {
        this.options = options;
    }

    isSelectable(target: EventTarget | null): boolean {
        return getSelectableElement(target) !== null;
    }

    handlePointerDown(target: EventTarget | null): void {
        const el = getSelectableElement(target);
        if (el) {
            this.anchor = el;
        }
    }

    handlePointerUp(target: EventTarget | null, point: ReadingSelectionPoint): boolean {
        const el = getSelectableElement(target);
        if (!el) {
            this.clear();
            return false;
        }

        if (!this.anchor) {
            return false;
        }

        const start = this.anchor;
        this.anchor = null;

        const container = this.options.getContainer ? this.options.getContainer() : null;
        const selectSpan = wrapReadingSelection(start, el, container);
        if (!selectSpan) {
            return false;
        }

        const { text, selection } = resolveReadingSelection(
            selectSpan,
            this.options.getDocumentOrigin()
        );
        this.options.onSelect({ text, selection, point });
        return true;
    }

    handleMobileClick(target: EventTarget | null, point: ReadingSelectionPoint): boolean {
        const el = getSelectableElement(target);
        if (!el) {
            this.clear();
            return false;
        }

        if (this.anchor) {
            const start = this.anchor;
            this.anchor = null;
            const container = this.options.getContainer ? this.options.getContainer() : null;
            const selectSpan = wrapReadingSelection(start, el, container);
            if (!selectSpan) {
                return false;
            }
            const { text, selection } = resolveReadingSelection(
                selectSpan,
                this.options.getDocumentOrigin()
            );
            this.options.onSelect({ text, selection, point });
            return true;
        } else {
            this.anchor = el;
            return false;
        }
    }

    clear(): void {
        this.anchor = null;
        const container = this.options.getContainer ? this.options.getContainer() : null;
        clearReadingSelection(container);
    }
}
