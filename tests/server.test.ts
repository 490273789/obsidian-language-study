// @vitest-environment node

import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Server from "@/api/server";
import type { ExpressionInfo } from "@/db/interface";

describe("local server", () => {
    let server: Server;
    let baseUrl: string;
    const postExpression = vi.fn(async () => 200);
    const getExpression = vi.fn(async (expression: string) => ({ expression }));
    const getTags = vi.fn(async () => ["review"]);
    const refreshTextDB = vi.fn();
    let autoRefreshDb = false;

    beforeEach(async () => {
        autoRefreshDb = false;
        postExpression.mockClear();
        getExpression.mockClear();
        getTags.mockClear();
        refreshTextDB.mockClear();
        const plugin = {
            db: {
                getExpression,
                postExpression,
                getTags,
            },
            settings: {
                get auto_refresh_db() {
                    return autoRefreshDb;
                },
            },
            refreshTextDB,
        };
        server = new Server(plugin as never, 0);
        await server.start();
        const address = server._server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await server.close();
    });

    it("binds locally and answers echo with allowed localhost origin", async () => {
        const response = await fetch(`${baseUrl}/echo`, {
            headers: { Origin: "http://localhost" },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost");
        expect(await response.text()).toBe("hi");
    });

    it("rejects disallowed origins", async () => {
        const response = await fetch(`${baseUrl}/echo`, {
            headers: { Origin: "https://example.com" },
        });

        expect(response.status).toBe(403);
    });

    it("enforces route methods and invalid json responses", async () => {
        const wrongMethod = await fetch(`${baseUrl}/word`);
        expect(wrongMethod.status).toBe(405);

        const badJson = await fetch(`${baseUrl}/word`, {
            method: "POST",
            body: "{",
        });
        expect(badJson.status).toBe(400);
    });

    it("rejects oversized request bodies", async () => {
        const payload = "x".repeat(1024 * 1024 + 1);
        const response = await fetch(`${baseUrl}/update`, {
            method: "POST",
            body: payload,
        });

        expect(response.status).toBe(413);
    });

    it("stores valid expression payloads", async () => {
        const payload: ExpressionInfo = {
            expression: "test",
            meaning: "测试",
            status: 1,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
        };
        const response = await fetch(`${baseUrl}/update`, {
            method: "POST",
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        expect(postExpression).toHaveBeenCalledWith(payload);
    });

    it("loads expressions and returns tag lists as json", async () => {
        const word = await fetch(`${baseUrl}/word?ignored=true`, {
            method: "POST",
            body: JSON.stringify("alpha"),
        });
        const tags = await fetch(`${baseUrl}/tags`);

        expect(word.status).toBe(200);
        expect(await word.json()).toEqual({ expression: "alpha" });
        expect(getExpression).toHaveBeenCalledWith("alpha");
        expect(tags.headers.get("content-type")).toBe("application/json");
        expect(await tags.json()).toEqual(["review"]);
    });

    it("handles preflight, missing routes, and HEAD echo", async () => {
        const options = await fetch(`${baseUrl}/word`, { method: "OPTIONS" });
        const missing = await fetch(`${baseUrl}/missing`);
        const head = await fetch(`${baseUrl}/echo`, { method: "HEAD" });

        expect(options.status).toBe(204);
        expect(missing.status).toBe(404);
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
    });

    it("triggers text database refresh after writes when enabled", async () => {
        autoRefreshDb = true;
        const payload: ExpressionInfo = {
            expression: "refresh",
            meaning: "",
            status: 1,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
        };

        const response = await fetch(`${baseUrl}/update`, {
            method: "POST",
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        expect(refreshTextDB).toHaveBeenCalledTimes(1);
    });
});
