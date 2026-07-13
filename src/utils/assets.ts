/**
 * assets.ts
 * Resolves heavy WASM/model/data assets against a host-page prefetch cache.
 *
 * The host page may prefetch the big files (wasm, .data, .model) into the Cache API
 * and publish blob URLs on `window.__fileCacheUrls`, keyed by bare filename. The
 * engines must consult that map, otherwise Emscripten's locateFile — and our own
 * model fetch — pull each file over the network a SECOND time.
 */

/**
 * Return the prefetched blob URL for an asset if the host page has one,
 * otherwise `fallback`. `pathOrUrl` may be a bare filename ("cruncher.data")
 * or a full path ("/wasm/cruncher.data"); only the basename is matched.
 */
export function resolveAssetUrl(pathOrUrl: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const cacheUrls = (window as any).__fileCacheUrls;
  if (!cacheUrls) return fallback;
  const basename = pathOrUrl.split('/').pop() || pathOrUrl;
  return cacheUrls[basename] || fallback;
}
