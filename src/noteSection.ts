/**
 * Reading and extending one Markdown section of a note by its heading text —
 * the mechanics behind keeping a task's progress log inside its home note.
 */

export interface Section {
	/** Line index of the heading. */
	start: number;
	/** Line index of the next heading of the same or a higher level (or the end of the note). */
	end: number;
	level: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/u;

/** Finds the section under the first heading whose text equals `heading` (case-insensitive). */
export function readSection(lines: string[], heading: string): Section | undefined {
	const wanted = heading.trim().toLowerCase();
	if (!wanted) return undefined;
	for (let i = 0; i < lines.length; i++) {
		const match = HEADING_RE.exec(lines[i] ?? '');
		if (!match || (match[2] ?? '').trim().toLowerCase() !== wanted) continue;
		const level = (match[1] ?? '').length;
		let end = i + 1;
		while (end < lines.length) {
			const next = HEADING_RE.exec(lines[end] ?? '');
			if (next && (next[1] ?? '').length <= level) break;
			end++;
		}
		return { start: i, end, level };
	}
	return undefined;
}

/**
 * Where to insert `newLines` so they land at the end of the section, and what
 * exactly to insert. When the section does not exist yet, it is created at the
 * end of the note: a blank separator, the heading, then the lines. Trailing
 * blank lines of the section (or the note) are skipped over so entries stay
 * contiguous under the heading.
 */
export function sectionInsertion(
	lines: string[],
	heading: string,
	newLines: string[],
): { insertAt: number; inserted: string[] } {
	const section = readSection(lines, heading);
	if (section) {
		let insertAt = section.end;
		while (insertAt > section.start + 1 && (lines[insertAt - 1] ?? '').trim() === '') insertAt--;
		return { insertAt, inserted: newLines };
	}
	let insertAt = lines.length;
	while (insertAt > 0 && (lines[insertAt - 1] ?? '').trim() === '') insertAt--;
	const separator = insertAt > 0 ? [''] : [];
	return { insertAt, inserted: [...separator, `## ${heading.trim()}`, ...newLines] };
}
