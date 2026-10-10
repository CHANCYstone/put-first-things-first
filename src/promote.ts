/**
 * The two moves at either end of a task's life once it has outgrown a line:
 *
 * - promote: give the task its own note. The line keeps its checkbox and
 *   metadata but its text becomes a `[[wikilink]]`; any log kept under the line
 *   moves into the note's progress section. An existing note with that name is
 *   linked rather than overwritten.
 * - archive: the task is done. Its line is checked off, the note gets a review
 *   section to fill in, and the note moves to the archive folder — links keep
 *   working, the record stays.
 */
import { App, TFile, normalizePath } from 'obsidian';
import type { TaskItem } from './taskScanner';
import { FocusFirstSettings } from './settings';
import { TASK_PREFIX_RE, taskTitle } from './tasksFormat';
import { blockEnd, parseProgressLine, formatProgressLine, ProgressEntry } from './progressLog';
import { readSection, sectionInsertion } from './noteSection';
import { formatIsoDate } from './dateUtils';
import { completeTaskLine } from './taskRenderer';

export type PromoteResult =
	| { status: 'created' | 'linked'; note: TFile }
	| { status: 'already'; note: TFile }
	| { status: 'no-title' | 'stale' };

export type ArchiveResult = 'archived' | 'completed-only' | 'needs-note' | 'stale' | 'target-exists';

// Metadata tokens a task line carries besides its text: priority, dated
// signifiers, recurrence, and tags. Removing them leaves the description.
const METADATA_RE = /(🔺|⏫|🔼|🔽|⏬)|[📅🛫⏳➕❌✅]\s*\d{4}-\d{2}-\d{2}|🔁[^#📅🛫⏳➕❌✅🔺⏫🔼🔽⏬]*|(?:^|\s)#[^\s#]\S*/gu;

/** Characters a note name cannot contain on any platform Obsidian runs on. */
function safeNoteName(title: string): string {
	return title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Rewrites the task line so its description becomes `[[title]]`, keeping the
 * checkbox, indentation, and every metadata token where it was.
 */
export function linkTaskLine(line: string, title: string): string {
	const prefix = TASK_PREFIX_RE.exec(line)?.[0] ?? '';
	const body = line.slice(prefix.length);
	const description = body.replace(METADATA_RE, ' ').replace(/\s{2,}/g, ' ').trim();
	const link = `[[${title}]]`;
	if (description && body.includes(description)) return prefix + body.replace(description, link);
	return `${prefix}${link} ${body.trim()}`.trimEnd();
}

/** The starter content of a promoted task's note. */
export function noteTemplate(title: string, heading: string, entries: string[], now: Date): string {
	const lines = [
		'---',
		`title: ${title}`,
		`date: ${formatIsoDate(now)}`,
		'tags:',
		'  - task',
		'---',
		'',
		`# ${title}`,
		'',
		`## ${heading}`,
		...entries,
		'',
	];
	return lines.join('\n');
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	if (!folder || app.vault.getAbstractFileByPath(folder)) return;
	await app.vault.createFolder(folder).catch(() => {});
}

/** Gives a task its own note (or links an existing one) and moves its inline log there. */
export async function promoteTask(
	app: App,
	settings: FocusFirstSettings,
	task: TaskItem,
	now: Date = new Date(),
): Promise<PromoteResult> {
	if (task.homeNote) return { status: 'already', note: task.homeNote };
	const title = safeNoteName(taskTitle(task.line));
	if (!title) return { status: 'no-title' };

	const source = app.vault.getAbstractFileByPath(task.file.path);
	if (!(source instanceof TFile)) return { status: 'stale' };
	const content = await app.vault.read(source);
	const lines = content.split('\n');
	if (lines[task.lineNumber] !== task.line) return { status: 'stale' };

	// Lift the inline log out of the source note: the plain bullets directly
	// under the task (subtasks stay where they are).
	const end = blockEnd(lines, task.lineNumber);
	const moved: { index: number; entry: ProgressEntry }[] = [];
	for (let i = task.lineNumber + 1; i < end; i++) {
		const line = lines[i] ?? '';
		if (/^\s*[-*+]\s+\[.\]/.test(line)) continue;
		const entry = parseProgressLine(line, i);
		if (entry) moved.push({ index: i, entry });
	}
	const entryLines = moved.map(({ entry }) =>
		formatProgressLine('', entry.date ? formatIsoDate(entry.date) : formatIsoDate(now), entry.text, entry.alert));

	const folder = settings.notesFolder.trim() || task.file.parent?.path || '';
	const path = normalizePath(folder ? `${folder}/${title}.md` : `${title}.md`);
	const existing = app.vault.getAbstractFileByPath(path);
	let note: TFile;
	let status: 'created' | 'linked';
	if (existing instanceof TFile) {
		note = existing;
		status = 'linked';
		if (entryLines.length > 0) {
			const noteLines = (await app.vault.read(note)).split('\n');
			const { insertAt, inserted } = sectionInsertion(noteLines, settings.progressHeading, entryLines);
			noteLines.splice(insertAt, 0, ...inserted);
			await app.vault.modify(note, noteLines.join('\n'));
		}
	} else {
		await ensureFolder(app, folder);
		note = await app.vault.create(path, noteTemplate(title, settings.progressHeading, entryLines, now));
		status = 'created';
	}

	// Rewrite the source last, from the bottom up so indices stay valid.
	for (const { index } of [...moved].reverse()) lines.splice(index, 1);
	lines[task.lineNumber] = linkTaskLine(task.line, note.basename);
	await app.vault.modify(source, lines.join('\n'));
	return { status, note };
}

/**
 * Closes a task that has a home note: checks the line off, adds an empty review
 * section to the note (once), and moves the note into the archive folder when
 * one is configured. Links to the note keep resolving after the move.
 */
export async function archiveTask(
	app: App,
	settings: FocusFirstSettings,
	task: TaskItem,
	now: Date = new Date(),
): Promise<ArchiveResult> {
	const note = task.homeNote;
	if (!note) return 'needs-note';

	const snap = await completeTaskLine(app, task.file.path, task.lineNumber, now, task.line);
	if (!snap) return 'stale';

	const reviewHeading = settings.reviewHeading.trim();
	if (reviewHeading) {
		const lines = (await app.vault.read(note)).split('\n');
		if (!readSection(lines, reviewHeading)) {
			const { insertAt, inserted } = sectionInsertion(lines, reviewHeading, ['- ']);
			lines.splice(insertAt, 0, ...inserted);
			await app.vault.modify(note, lines.join('\n'));
		}
	}

	const folder = settings.archiveFolder.trim();
	if (!folder) return 'completed-only';
	const target = normalizePath(`${folder}/${note.name}`);
	if (target === note.path) return 'archived';
	if (app.vault.getAbstractFileByPath(target)) return 'target-exists';
	await ensureFolder(app, folder);
	await app.fileManager.renameFile(note, target);
	return 'archived';
}
