import { sanitizeHTMLToDom } from "obsidian";

declare const safeHtmlBrand: unique symbol;

type SafeHtml = string & { readonly [safeHtmlBrand]: true };

const EMPTY_SAFE_HTML = "" as SafeHtml;

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function unsafeMarkSafeHtml(html: string): SafeHtml {
    return html as SafeHtml;
}

function sanitizeToSafeHtml(html: string): SafeHtml {
    const fragment = sanitizeHTMLToDom(html);
    const container = document.createElement("div");
    container.appendChild(fragment.cloneNode(true));
    return unsafeMarkSafeHtml(container.innerHTML);
}

function safeHtmlToString(html: SafeHtml): string {
    return html;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightExpression(text: string, expression: string): SafeHtml {
    const escapedText = escapeHtml(text);
    const trimmed = expression.trim();
    if (!trimmed) {
        return unsafeMarkSafeHtml(escapedText);
    }

    const pattern = new RegExp(
        `(^|[^A-Za-z])(${escapeRegExp(escapeHtml(trimmed))})(?=$|[^A-Za-z])`,
        "gi"
    );
    return unsafeMarkSafeHtml(
        escapedText.replace(pattern, (_match, prefix: string, match: string) => {
            return `${prefix}<em>${match}</em>`;
        })
    );
}

export {
    EMPTY_SAFE_HTML,
    escapeHtml,
    highlightExpression,
    safeHtmlToString,
    sanitizeToSafeHtml,
    unsafeMarkSafeHtml,
};
export type { SafeHtml };
