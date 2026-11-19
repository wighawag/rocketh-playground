/** Types for `soljson.mjs`, so the vite plugin and the tests can import it from TypeScript. */
export declare const pinned: {version: string; path: string; sha256: string; source: string};
export declare const soljsonPath: string;
export declare function ensureSoljson(options?: {log?: (message: string) => void}): Promise<string>;
