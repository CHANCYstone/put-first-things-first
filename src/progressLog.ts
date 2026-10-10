/**
 * The progress log of a task: dated notes kept as plain bullets indented under
 * the task line, the way a notebook keeps remarks in the margin next to an item.
 *
 *     - [ ] Build the bridge 📅 2026-09-20 ⏫
 *         - 2026-09-01 Called the village; work starts next week
 *         - 2026-09-03 ⚠ Still 200k short — talk to finance
 *
 * Plain bullets are invisible to the task scanner (no checkbox), so the log
 * never leaks into the matrix and existing notes need no migration. The ⚠ mark
 * flags an entry as an anomaly rather than ordinary progress.
 */
import { App, TFile } from 'obsidian';
import type { TaskItem } from './taskScanner';
import { readSection, sectionInsertion } from './noteSection';
import type { EditSnapshot } from './undo';
import { parseIsoDate, daysBetween, formatIsoDate } from './dateUtils';

export const ALERT_MARK = '⚠';

export interface ProgressEntry {
	lineNumber: number;
	/** Calendar day of the note, when the bullet starts with one. */
	date?: Date;
	/** True when the entry is flagged with the ⚠ mark. */
	alert: boolean;
	text: string;
}

// A log bullet: list marker, optional ISO date, optional ⚠ (with or without the
// emoji variation selector), then the note itself.
const ENTRY_RE = /^\s*[-*+]\s+(?:(\d{4}-\d{2}-\d{2})\s*)?(⚠️?\s*)?(.*)$/u;

/** Parses one child bullet of a task into a log entry; undefined for a blank bullet. */
export function parseProgressLine(line: string, lineNumber: number): ProgressEntry | undefined {
	const match = ENTRY_RE.exec(line);
	if (!match) return undefined;
	const text = (match[3] ?? '').replace(/\s*<!-- pftf-receipt:[a-z0-9-]+ -->/g, '').trim();
	const date = match[1] ? parseIsoDate(match[1]) : undefined;
	if (!text && !date) return undefined;
	return { lineNumber, date, alert: match[2] !== undefined, text };
}

/** The most recent entry — the last one in the note, since notes are appended in order. */
export function latestEntry(entries: ProgressEntry[]): ProgressEntry | undefined {
	return entries[entries.length - 1];
}

/** Whole days since the entry was written; undefined for an undated entry. */
export function daysSinceEntry(entry: ProgressEntry, now: Date = new Date()): number | undefined {
	return entry.date ? daysBetween(entry.date, now) : undefined;
}

/** Builds the bullet line for a new entry. */
export function formatProgressLine(indent: string, iso: string, text: string, alert: boolean): string {
	const mark = alert ? ` ${ALERT_MARK}` : '';
	return `${indent}- ${iso}${mark} ${text.trim()}`;
}

/** Visual indentation of a line, with a tab counted as four columns. */
function indentWidth(line: string): number {
	return leadingWhitespace(line).replace(/\t/g, '    ').length;
}

function leadingWhitespace(line: string): string {
	return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/**
 * Index of the first line after the task's nested block — every following line
 * that is non-blank and indented deeper than the task belongs to it (subtasks,
 * earlier log entries, nested notes). A new entry goes there, at the end.
 */
export function blockEnd(lines: string[], taskLine: number): number {
	const base = indentWidth(lines[taskLine] ?? '');
	let i = taskLine + 1;
	while (i < lines.length) {
		const line = lines[i] ?? '';
		if (line.trim() === '' || indentWidth(line) <= base) break;
		i++;
	}
	return i;
}

/**
 * The indentation for a new child of the task. Reuses what the note already
 * does: the first nested line's indent when there is one, otherwise the task's
 * own indent plus one level in the note's style (a tab if the note uses tabs
 * anywhere, else four spaces).
 */
export function childIndent(lines: string[], taskLine: number, end: number): string {
	const firstChild = lines[taskLine + 1];
	if (end > taskLine + 1 && firstChild !== undefined) return leadingWhitespace(firstChild);
	const usesTabs = lines.some((line) => line.startsWith('\t'));
	return leadingWhitespace(lines[taskLine] ?? '') + (usesTabs ? '\t' : '    ');
}

/** The log entries kept in a note's progress section: its top-level bullets, in order. */
export function parseNoteProgress(lines: string[], heading: string): ProgressEntry[] {
	const section = readSection(lines, heading);
	if (!section) return [];
	const entries: ProgressEntry[] = [];
	for (let i = section.start + 1; i < section.end; i++) {
		const line = lines[i] ?? '';
		if (!/^[-*+]\s/.test(line)) continue;
		const entry = parseProgressLine(line, i);
		if (entry) entries.push(entry);
	}
	return entries;
}

/**
 * Appends a dated entry to the task's log. A task with a home note keeps its
 * log there, under the progress heading (created at the end of the note if
 * missing); a plain task keeps it as indented bullets under its line. Guarded
 * like every other row edit: if the task line has moved since the view was
 * scanned, nothing is written. Returns an undo snapshot (an insertion).
 */
export async function appendProgressEntry(
	app: App,
	task: TaskItem,
	text: string,
	alert: boolean,
	heading: string,
	now: Date = new Date(),
): Promise<EditSnapshot | undefined> {
	const body = text.trim();
	if (!body) return;
	if (task.homeNote) return appendNoteProgressEntry(app, task.homeNote, heading, body, alert, now);
	const file = app.vault.getAbstractFileByPath(task.file.path);
	if (!(file instanceof TFile)) return;
	const content = await app.vault.read(file);
	const lines = content.split('\n');
	if (lines[task.lineNumber] !== task.line) return;

	const insertAt = blockEnd(lines, task.lineNumber);
	const entries = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
		.map(line => formatProgressLine(childIndent(lines, task.lineNumber, insertAt), formatIsoDate(now), line, alert));
	lines.splice(insertAt, 0, ...entries);
	await app.vault.modify(file, lines.join('\n'));
	return { filePath: task.file.path, startLine: insertAt, before: [], after: entries };
}

/** Appends one entry under the note's progress heading, creating the section if needed. */
async function appendNoteProgressEntry(
	app: App,
	note: TFile,
	heading: string,
	body: string,
	alert: boolean,
	now: Date,
): Promise<EditSnapshot | undefined> {
	const content = await app.vault.read(note);
	const lines = content.split('\n');
	const entries = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
		.map(line => formatProgressLine('', formatIsoDate(now), line, alert));
	const { insertAt, inserted } = sectionInsertion(lines, heading, entries);
	lines.splice(insertAt, 0, ...inserted);
	await app.vault.modify(note, lines.join('\n'));
	return { filePath: note.path, startLine: insertAt, before: [], after: inserted };
}
