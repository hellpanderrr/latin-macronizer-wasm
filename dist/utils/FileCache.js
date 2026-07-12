/**
 * FileCache.ts
 * Caches large binary files (WASM, data, models) via the Cache API.
 * Enables offline-capable loading of heavy WASM resources on repeat visits.
 */
// Keep in sync with WASM_CACHE in index.html — bump when public/wasm/ changes
const DEFAULT_CACHE_NAME = 'wasm-files-v2';
export class FileCache {
    constructor(cacheName) {
        Object.defineProperty(this, "cacheName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ready", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.cacheName = cacheName || DEFAULT_CACHE_NAME;
        this.ready = this.init();
    }
    async init() {
        if (typeof caches === 'undefined')
            return false;
        try {
            await caches.open(this.cacheName);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    async ensureReady() {
        return this.ready;
    }
    /**
     * Check if a file is cached
     */
    async has(path) {
        if (!(await this.ensureReady()))
            return false;
        const cache = await caches.open(this.cacheName);
        const match = await cache.match(path);
        return !!match;
    }
    /**
     * Get cached file as Blob
     */
    async getBlob(path) {
        if (!(await this.ensureReady()))
            return undefined;
        const cache = await caches.open(this.cacheName);
        const match = await cache.match(path);
        if (!match)
            return undefined;
        return match.blob();
    }
    /**
     * Store a file in cache
     */
    async put(path, blobOrResponse) {
        if (!(await this.ensureReady()))
            return;
        const cache = await caches.open(this.cacheName);
        const response = blobOrResponse instanceof Blob
            ? new Response(blobOrResponse)
            : blobOrResponse;
        await cache.put(path, response);
    }
    /**
     * Fetch and cache a file if not already cached
     */
    async fetchAndCache(path) {
        const cached = await this.getBlob(path);
        if (cached)
            return cached;
        const response = await fetch(path);
        if (!response.ok)
            throw new Error(`Failed to fetch ${path}: ${response.status}`);
        // Clone so we can cache and return simultaneously
        const [forCache, forReturn] = [response.clone(), response];
        this.put(path, forCache); // fire-and-forget
        return forReturn.blob();
    }
    /**
     * Get an object URL for a cached file
     */
    async createObjectURL(path) {
        const blob = await this.getBlob(path);
        if (!blob)
            return undefined;
        return URL.createObjectURL(blob);
    }
    /**
     * Clear all cached files
     */
    async clear() {
        if (typeof caches === 'undefined')
            return;
        await caches.delete(this.cacheName);
        this.ready = this.init();
    }
    /**
     * List all cached file paths
     */
    async list() {
        if (!(await this.ensureReady()))
            return [];
        const cache = await caches.open(this.cacheName);
        const keys = await cache.keys();
        return keys.map(r => r.url);
    }
}
//# sourceMappingURL=FileCache.js.map