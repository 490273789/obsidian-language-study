import type { DictionaryAdapter, DictionaryLookupReceipt } from "./interface";

export type LookupAllProgressCallback = (
    receipt: DictionaryLookupReceipt,
    isCurrent: boolean
) => void;

export type LookupAllResult = Readonly<{
    queryId: number;
    isCurrent: boolean;
    receipts: Record<string, DictionaryLookupReceipt>;
}>;

export class DictionaryHub {
    private readonly adapters = new Map<string, DictionaryAdapter>();
    private currentQueryId = 0;

    constructor(initialAdapters: readonly DictionaryAdapter[] = []) {
        for (const adapter of initialAdapters) {
            this.register(adapter);
        }
    }

    register(adapter: DictionaryAdapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    getAdapter(id: string): DictionaryAdapter | undefined {
        return this.adapters.get(id);
    }

    getAllAdapters(): readonly DictionaryAdapter[] {
        return [...this.adapters.values()];
    }

    getCurrentQueryId(): number {
        return this.currentQueryId;
    }

    async lookup(id: string, word: string): Promise<DictionaryLookupReceipt> {
        const adapter = this.adapters.get(id);
        if (!adapter) {
            return {
                id,
                status: "error",
                error: `Dictionary adapter '${id}' not found`,
            };
        }
        return adapter.lookup(word);
    }

    async lookupAll(
        word: string,
        enabledIds?: readonly string[],
        onProgress?: LookupAllProgressCallback
    ): Promise<LookupAllResult> {
        const queryId = ++this.currentQueryId;
        const targetIds = enabledIds
            ? enabledIds.filter((id) => this.adapters.has(id))
            : [...this.adapters.keys()];

        const receipts: Record<string, DictionaryLookupReceipt> = {};

        const promises = targetIds.map(async (id) => {
            const adapter = this.adapters.get(id)!;
            let receipt: DictionaryLookupReceipt;
            try {
                receipt = await adapter.lookup(word);
            } catch (error) {
                receipt = {
                    id,
                    status: "error",
                    error: error instanceof Error ? error.message : String(error),
                };
            }

            receipts[id] = receipt;
            if (onProgress) {
                const isCurrent = this.currentQueryId === queryId;
                onProgress(receipt, isCurrent);
            }
            return receipt;
        });

        await Promise.all(promises);

        return {
            queryId,
            isCurrent: this.currentQueryId === queryId,
            receipts,
        };
    }

    async translateSentence(sentence: string, preferredProviderId?: string): Promise<string> {
        const trimmed = sentence.trim();
        if (!trimmed) {
            return "";
        }

        if (preferredProviderId) {
            const preferred = this.adapters.get(preferredProviderId);
            if (preferred?.translate) {
                try {
                    const res = await preferred.translate(trimmed);
                    if (res) return res;
                } catch {
                    // Fall back to other providers
                }
            }
        }

        for (const adapter of this.adapters.values()) {
            if (adapter.translate) {
                try {
                    const res = await adapter.translate(trimmed);
                    if (res) return res;
                } catch {
                    continue;
                }
            }
        }

        return "";
    }
}
