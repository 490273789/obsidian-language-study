import { describe, expect, it } from "vitest";

import {
    externalLink,
    getFullLink,
    getHTML,
    getInnerHTML,
    getOuterHTML,
    getStaticSpeaker,
    getText,
    handleNetWorkError,
    handleNoResult,
    removeChild,
    removeChildren,
} from "@/dictionary/helpers";

describe("dictionary helper utilities", () => {
    it("creates speaker links only when audio source exists", () => {
        expect(getStaticSpeaker()).toBe("");

        const speaker = getStaticSpeaker("https://example.com/audio.mp3") as HTMLAnchorElement;
        expect(speaker.href).toBe("https://example.com/audio.mp3");
        expect(speaker.target).toBe("_blank");
        expect(speaker.className).toBe("speaker");
    });

    it("marks external links with safe browsing attributes", () => {
        const link = document.createElement("a");

        externalLink(link);

        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("nofollow noopener noreferrer");
    });

    it("extracts text from the selected element", () => {
        const parent = document.createElement("div");
        parent.innerHTML = `<span class="word">alpha</span>`;

        expect(getText(parent, ".word")).toBe("alpha");
        expect(getText(parent, ".missing")).toBe("");
        expect(getText(null)).toBe("");
    });

    it("resolves relative and protocol-relative resource links", () => {
        const link = document.createElement("a");

        link.setAttribute("href", "https://cdn.example.com/a.css");
        expect(getFullLink("https://example.com/base/", link, "href")).toBe(
            "https://cdn.example.com/a.css"
        );

        link.setAttribute("href", "//cdn.example.com/a.css");
        expect(getFullLink("https://example.com/base/", link, "href")).toBe(
            "https://cdn.example.com/a.css"
        );

        link.setAttribute("href", "/entry");
        expect(getFullLink("https://example.com/base/", link, "href")).toBe(
            "https://example.com/base/entry"
        );

        link.setAttribute("href", "entry");
        expect(getFullLink("http://example.com/base", link, "href")).toBe(
            "http://example.com/base/entry"
        );
    });

    it("sanitizes html and fills resource links", () => {
        const parent = document.createElement("div");
        parent.innerHTML = `
            <section class="entry">
                <a href="/word" onclick="bad()">word</a>
                <img src="//cdn.example.com/image.png" onerror="bad()">
                <script>bad()</script>
            </section>
        `;

        const html = getHTML(parent, {
            selector: ".entry",
            host: "https://dict.example.com",
            transform: (content) => content.replace(">word<", ">alpha<"),
        });

        expect(html).toContain(`href="https://dict.example.com/word"`);
        expect(html).toContain(`src="https://cdn.example.com/image.png"`);
        expect(html).toContain("alpha");
        expect(html).not.toContain("onclick");
        expect(html).not.toContain("onerror");
        expect(html).not.toContain("<script>");
    });

    it("returns inner and outer html with selector shorthand", () => {
        const parent = document.createElement("div");
        parent.innerHTML = `<article><strong>alpha</strong></article>`;

        expect(getInnerHTML("https://dict.example.com", parent, "article")).toBe(
            "<strong>alpha</strong>"
        );
        expect(getOuterHTML("https://dict.example.com", parent, "article")).toBe(
            "<article><strong>alpha</strong></article>"
        );
    });

    it("removes selected child nodes", () => {
        const parent = document.createElement("div");
        parent.innerHTML = `<span class="one"></span><span class="many"></span><span class="many"></span>`;

        removeChild(parent, ".one");
        removeChildren(parent, ".many");

        expect(parent.children.length).toBe(0);
    });

    it("rejects shared no-result and network-error paths", async () => {
        await expect(handleNoResult()).rejects.toThrow("NO_RESULT");
        await expect(handleNetWorkError()).rejects.toThrow("NETWORK_ERROR");
    });
});
