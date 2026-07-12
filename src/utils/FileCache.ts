/**
 * FileCache.ts
 * Caches large binary files (WASM, data, models) via the Cache API.
 * Enables offline-capable loading of heavy WASM resources on repeat visits.
 */

// Keep in sync with WASM_CACHE in index.html — bump when public/wasm/ changes
const DEFAULT_CACHE_NAME = 'wasm-files-v2';

export class FileCache {
  private cacheName: string;
  private ready: Promise<boolean>;

  constructor(cacheName?: string) {
    this.cacheName = cacheName || DEFAULT_CACHE_NAME;
    this.ready = this.init();
  }

  private async init(): Promise<boolean> {
    if (typeof caches === 'undefined') return false;
    try {
      await caches.open(this.cacheName);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureReady(): Promise<boolean> {
    return this.ready;
  }

  /**
   * Check if a file is cached
   */
  async has(path: string): Promise<boolean> {
    if (!(await this.ensureReady())) return false;
    const cache = await caches.open(this.cacheName);
    const match = await cache.match(path);
    return !!match;
  }

  /**
   * Get cached file as Blob
   */
  async getBlob(path: string): Promise<Blob | undefined> {
    if (!(await this.ensureReady())) return undefined;
    const cache = await caches.open(this.cacheName);
    const match = await cache.match(path);
    if (!match) return undefined;
    return match.blob();
  }

  /**
   * Store a file in cache
   */
  async put(path: string, blobOrResponse: Blob | Response): Promise<void> {
    if (!(await this.ensureReady())) return;
    const cache = await caches.open(this.cacheName);
    const response = blobOrResponse instanceof Blob
      ? new Response(blobOrResponse)
      : blobOrResponse;
    await cache.put(path, response);
  }

  /**
   * Fetch and cache a file if not already cached
   */
  async fetchAndCache(path: string): Promise<Blob> {
    const cached = await this.getBlob(path);
    if (cached) return cached;

    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);

    // Clone so we can cache and return simultaneously
    const [forCache, forReturn] = [response.clone(), response];
    this.put(path, forCache); // fire-and-forget

    return forReturn.blob();
  }

  /**
   * Get an object URL for a cached file
   */
  async createObjectURL(path: string): Promise<string | undefined> {
    const blob = await this.getBlob(path);
    if (!blob) return undefined;
    return URL.createObjectURL(blob);
  }

  /**
   * Clear all cached files
   */
  async clear(): Promise<void> {
    if (typeof caches === 'undefined') return;
    await caches.delete(this.cacheName);
    this.ready = this.init();
  }

  /**
   * List all cached file paths
   */
  async list(): Promise<string[]> {
    if (!(await this.ensureReady())) return [];
    const cache = await caches.open(this.cacheName);
    const keys = await cache.keys();
    return keys.map(r => r.url);
  }
}
