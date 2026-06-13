import { describe, expect, it } from "vitest";

import { escapeHtml, highlightExpression, sanitizeToSafeHtml } from "@/utils/safeHtml";

describe("safe html helpers", () => {
    it("escapes user text", () => {
        expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
        );
    });

    it("sanitizes unsafe remote html before branding", () => {
        const html = sanitizeToSafeHtml(`<img src="x" onerror="alert(1)"><script>bad()</script>`);

        expect(html).toContain(`<img src="x">`);
        expect(html).not.toContain("onerror");
        expect(html).not.toContain("<script>");
    });

    it("highlights expressions after escaping sentence text", () => {
        const html = highlightExpression(`<b>Cat</b> catches cat`, "cat");

        expect(html).toContain("&lt;b&gt;<em>Cat</em>&lt;/b&gt;");
        expect(html).toContain("catches <em>cat</em>");
        expect(html).not.toContain("<b>");
    });
});
