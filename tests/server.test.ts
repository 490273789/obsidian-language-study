// @vitest-environment node

import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Server from "@/api/server";
import type { ExpressionInfo } from "@/db/interface";

describe("local server", () => {
    let server: Server;
    let baseUrl: string;
    const postExpression = vi.fn(async () => 200);

    beforeEach(async () => {
        const plugin = {
            db: {
                getExpression: vi.fn(async (expression: string) => ({ expression })),
                postExpression,
                getTags: vi.fn(async () => ["review"]),
            },
            settings: { auto_refresh_db: false },
            refreshTextDB: vi.fn(),
        };
        server = new Server(plugin as never, 0);
        await server.start();
        const address = server._server?.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await server.close();
        postExpression.mockClear();
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
});
