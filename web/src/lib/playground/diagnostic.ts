/** A problem in a project file, located the way an editor shows it (1-based line and column). */
export type Diagnostic = {
	file: string;
	line: number;
	column: number;
	message: string;
	severity: 'error' | 'warning';
	/** Who found it. */
	source: 'solc' | 'typescript';
};

/** 1-based line and column of a 0-based character offset. */
export function lineAndColumn(
	text: string,
	offset: number,
): {line: number; column: number} {
	let line = 1;
	let lineStart = 0;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text.charCodeAt(i) === 10) {
			line++;
			lineStart = i + 1;
		}
	}
	return {line, column: offset - lineStart + 1};
}

export function formatDiagnostic(d: Diagnostic): string {
	return `${d.file}:${d.line}:${d.column} ${d.message}`;
}
