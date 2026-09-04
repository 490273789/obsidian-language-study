const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
};

Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
});

export {};
