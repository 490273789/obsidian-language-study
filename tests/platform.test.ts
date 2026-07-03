import { describe, expect, it } from "vitest";

import { getLocalFilePrefix, getVaultBasePath, resolveLocalResourcePath } from "@/utils/platform";

describe("platform path helpers", () => {
    it("normalizes vault adapter base paths", () => {
        const app = {
            vault: {
                adapter: {
                    basePath: "C:\\Users\\ethan\\Vault",
                },
            },
        };

        expect(getVaultBasePath(app as never)).toBe("C:/Users/ethan/Vault");
    });

    it("falls back to an empty base path when adapter path is unavailable", () => {
        const app = {
            vault: {
                adapter: {},
            },
        };

        expect(getVaultBasePath(app as never)).toBe("");
    });

    it("keeps already-addressable resources unchanged", () => {
        expect(resolveLocalResourcePath("", "/vault")).toBe("");
        expect(resolveLocalResourcePath("https://example.com/a.png", "/vault")).toBe(
            "https://example.com/a.png"
        );
        expect(resolveLocalResourcePath("app://local/a.png", "/vault")).toBe("app://local/a.png");
        expect(resolveLocalResourcePath("file:///tmp/a.png", "/vault")).toBe("file:///tmp/a.png");
    });

    it("resolves vault-relative and plugin-relative local resources", () => {
        expect(getLocalFilePrefix()).toBe("app://local/");
        expect(resolveLocalResourcePath("~/assets/a.png", "/Users/ethan/Vault")).toBe(
            "app://local//Users/ethan/Vault/assets/a.png"
        );
        expect(resolveLocalResourcePath("assets/a.png", "/Users/ethan/Vault")).toBe(
            "app://local/assets/a.png"
        );
    });
});
