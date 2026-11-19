/**
 * How the language service names the project's files, shared by the worker
 * (`./language-service.ts`) and the editor on the page (`../editor/code-editor.ts`). A file of its
 * own, so the page imports these two functions and not the language service with TypeScript.
 */

/** The language service's path for a project path: `deploy/01_deploy_counter.ts` is `/deploy/01_deploy_counter.ts`. */
export const vfsPath = (path: string) => `/${path}`;

/** The project files the language service types: TypeScript, and the artifact declarations. */
export const isTyped = (path: string) => /\.[cm]?ts$/.test(path);
