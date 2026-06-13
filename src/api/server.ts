import http from "node:http";
import type LanguageLearner from "@/plugin";
import { dict } from "@/constant";

const ALLOWED_HEADERS =
    "Authorization, Accept, X-Client-Id, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Hypothesis-Client-Version";
const MAX_BODY_BYTES = 1024 * 1024;

const mimeType = {
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
};

type RequestType = "LOAD" | "STORE" | "TAG" | "ECHO" | "OTHER";

type Route = {
    type: RequestType;
    methods: ReadonlySet<string>;
};

const routes: Record<string, Route> = {
    "/word": { type: "LOAD", methods: new Set(["POST"]) },
    "/update": { type: "STORE", methods: new Set(["POST"]) },
    "/tags": { type: "TAG", methods: new Set(["GET"]) },
    "/echo": { type: "ECHO", methods: new Set(["GET", "HEAD"]) },
};

function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) {
        return true;
    }
    try {
        const parsed = new URL(origin);
        return (
            parsed.protocol === "chrome-extension:" ||
            parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1" ||
            parsed.hostname === "[::1]"
        );
    } catch {
        return false;
    }
}

export default class Server {
    plugin: LanguageLearner;
    _server: http.Server | null = null;
    port: number;

    constructor(plugin: LanguageLearner, port: number) {
        this.plugin = plugin;
        this.port = port;
    }

    private async _startListen(port: number): Promise<void> {
        if (!this._server) {
            throw new Error("Server is not initialized");
        }
        return new Promise<void>((resolve, reject) => {
            this._server!.once("error", reject);
            this._server!.listen(port, "127.0.0.1", () => {
                this._server!.off("error", reject);
                resolve();
            });
        });
    }

    async start() {
        const server = http.createServer();
        this._server = server;
        server.on("request", this.process);
        await this._startListen(this.port);
        console.info(`${dict["NAME"]}: Server established on 127.0.0.1:${this.port}`);
    }

    private async _closeServer() {
        if (!this._server) {
            return;
        }
        return new Promise<void>((resolve, reject) => {
            this._server!.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    async close() {
        await this._closeServer();
        this._server = null;
        console.info(`${dict["NAME"]}: Server on port ${this.port} has closed`);
    }

    process = async (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (!this.setCorsHeaders(req, res)) {
            this.sendText(res, 403, "Forbidden");
            return;
        }

        const route = this.parseUrl(req.url);
        if (req.method === "OPTIONS") {
            this.sendText(res, 204, "");
            return;
        }
        if (route.type === "OTHER") {
            this.sendText(res, 404, "Not Found");
            return;
        }
        if (!req.method || !route.methods.has(req.method)) {
            res.setHeader("Allow", [...route.methods].join(", "));
            this.sendText(res, 405, "Method Not Allowed");
            return;
        }

        try {
            switch (route.type) {
                case "ECHO": {
                    res.setHeader("Keep-Alive", "timeout=0");
                    this.sendText(res, 200, "hi");
                    break;
                }
                case "LOAD": {
                    let data = await this.parseData<string>(req);
                    let expr = await this.plugin.db.getExpression(data);
                    this.sendJson(res, 200, expr);
                    break;
                }
                case "STORE": {
                    let data = await this.parseData<import("@/db/interface").ExpressionInfo>(req);
                    await this.plugin.db.postExpression(data);
                    this.sendText(res, 200, "");
                    if (this.plugin.settings.auto_refresh_db) {
                        void this.plugin.refreshTextDB();
                    }
                    break;
                }
                case "TAG": {
                    let tags = await this.plugin.db.getTags();
                    this.sendJson(res, 200, tags);
                    break;
                }
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                this.sendText(res, 400, "Invalid JSON");
                return;
            }
            if (error instanceof RangeError) {
                this.sendText(res, 413, error.message);
                return;
            }
            console.warn(`${dict["NAME"]}: server request failed`, error);
            this.sendText(res, 500, "Internal Server Error");
        }
    };

    private setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): boolean {
        const origin = req.headers.origin;
        if (!isAllowedOrigin(origin)) {
            return false;
        }
        if (origin) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
        }
        res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        return true;
    }

    private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
        res.setHeader("Content-Type", mimeType[".json"]);
        res.statusCode = statusCode;
        res.end(JSON.stringify(payload));
    }

    private sendText(res: http.ServerResponse, statusCode: number, payload: string): void {
        if (!res.hasHeader("Content-Type")) {
            res.setHeader("Content-Type", mimeType[".txt"]);
        }
        res.statusCode = statusCode;
        res.end(payload);
    }

    async parseData<T = unknown>(req: http.IncomingMessage): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalBytes = 0;
            let rejected = false;
            req.on("data", (chunk: Buffer) => {
                if (rejected) {
                    return;
                }
                totalBytes += chunk.byteLength;
                if (totalBytes > MAX_BODY_BYTES) {
                    rejected = true;
                    reject(new RangeError("Request body too large"));
                    return;
                }
                chunks.push(chunk);
            });
            req.on("error", (error) => {
                if (!rejected) {
                    rejected = true;
                    reject(error);
                }
            });
            req.on("end", () => {
                if (rejected) {
                    return;
                }
                const rawtext = Buffer.concat(chunks).toString("utf8");
                try {
                    resolve(JSON.parse(rawtext || "null") as T);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    parseUrl(_url: string | undefined): Route {
        const parsed = new URL(_url ?? "/", "http://127.0.0.1");
        return routes[parsed.pathname] ?? { type: "OTHER", methods: new Set() };
    }
}
