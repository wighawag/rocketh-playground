/** Types for `follow-releases.mjs`, so the tests can import it from TypeScript. */
export type Bump = {name: string; from: string; to: string; file: 'package.json' | 'project-template.json'};
export type FetchJson = (url: string) => Promise<unknown>;
export type FollowResult = {status: 'nothing' | 'exists' | 'bumped'; bumps: Bump[]; branch?: string; title?: string; body?: string};

export declare const REGISTRY: string;
export declare const BRANCH_PREFIX: string;
export declare const MAX_BRANCH_LENGTH: number;
export declare function isRelease(version: unknown): boolean;
export declare function compareReleases(a: string, b: string): -1 | 0 | 1;
export declare function followedPackages(packageJson: {dependencies?: Record<string, string>; devDependencies?: Record<string, string>}): {name: string; version: string}[];
export declare function latestVersion(name: string, fetchJson: FetchJson): Promise<string>;
export declare function planBumps(options: {
	packageJson: {dependencies?: Record<string, string>; devDependencies?: Record<string, string>};
	templateRecord: {package: string; version: string};
	fetchJson: FetchJson;
}): Promise<Bump[]>;
export declare function branchName(bumps: Bump[]): string;
export declare function pinVersions(text: string, bumps: Bump[]): string;
export declare function configSolcVersions(configText: string): string[];
export declare function pullRequestTitle(bumps: Bump[]): string;
export declare function pullRequestBody(options: {bumps: Bump[]; pinnedSolc: string; templateSolc: string[]}): string;
export declare function followReleases(options: {
	webDir: string;
	fetchJson: FetchJson;
	branchExists: (branch: string) => Promise<boolean>;
	updateTemplate: (version: string) => Promise<void>;
}): Promise<FollowResult>;
