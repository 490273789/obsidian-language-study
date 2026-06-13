import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizePort, normalizeSettings } from "@/settings";

describe("settings normalization", () => {
    it("returns defaults for missing or invalid data", () => {
        const settings = normalizeSettings({
            port: "bad",
            self_port: 80,
            function_key: "shiftKey",
            col_delimiter: ";",
            review_prons: "3",
        });

        expect(settings.port).toBe(DEFAULT_SETTINGS.port);
        expect(settings.self_port).toBe(DEFAULT_SETTINGS.self_port);
        expect(settings.function_key).toBe(DEFAULT_SETTINGS.function_key);
        expect(settings.col_delimiter).toBe(DEFAULT_SETTINGS.col_delimiter);
        expect(settings.review_prons).toBe(DEFAULT_SETTINGS.review_prons);
    });

    it("preserves valid persisted settings and merges dictionaries", () => {
        const settings = normalizeSettings({
            use_server: true,
            port: "9000",
            self_port: 3005,
            function_key: "altKey",
            dictionaries: {
                youdao: { enable: false, priority: 9 },
            },
        });

        expect(settings.use_server).toBe(true);
        expect(settings.port).toBe(9000);
        expect(settings.self_port).toBe(3005);
        expect(settings.function_key).toBe("altKey");
        expect(settings.dictionaries.youdao).toEqual({ enable: false, priority: 9 });
        expect(settings.dictionaries.cambridge).toEqual(DEFAULT_SETTINGS.dictionaries.cambridge);
    });

    it("normalizes port boundaries", () => {
        expect(normalizePort(65535, 1)).toBe(65535);
        expect(normalizePort(65536, 1)).toBe(1);
        expect(normalizePort("3000", 1, 1024)).toBe(3000);
    });
});
