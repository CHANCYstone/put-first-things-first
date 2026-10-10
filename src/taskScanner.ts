import { App, ListItemCache, TFile } from 'obsidian';
import { FocusFirstSettings, Priority, TaskSize } from './settings';
import { parseIsoDate } from './dateUtils';
import { ProgressEntry, parseProgressLine, parseNoteProgress } from './progressLog';
import { resolveHomeNote } from './homeNote';

export interface TaskItem {
	file: TFile;
	line: string;
	lineNumber: number;
	completed: boolean;
	dueDate?: Date;
	priority?: Priority;
	/** Coarse size / effort, derived from the configured size tags (#35). */
	size?: TaskSize;
	tags: string[];
	/** The note the task's first wikilink points to, when it exists — its home. */
	homeNote?: TFile;
	/** Dated notes: from the home note's progress section, else the plain bullets under the task, in order. */
	progress: ProgressEntry[];
}

/**
 * Derives a task's size from its tags and the configured size tags. Matching is
 * case-insensitive; small wins over medium over large if several are present
 * (they shouldn't be — setting a size clears the others). Returns undefined when
 * the task carries no size tag ("un-sized" — honest, no defaulting).
 */
export function detectSize(tags: string[], settings: FocusFirstSettings): TaskSize | undefined {
	const lower = tags.map((tag) => tag.toLowerCase());
	const has = (tag: string) => { const t = tag.trim().toLowerCase(); return t !== '' && lower.includes(t); };
	if (has(settings.sizeTags.small)) return 'small';
	if (has(settings.sizeTags.medium)) return 'medium';
	if (has(settings.sizeTags.large)) return 'large';
	return undefined;
}

// Matches Tasks-plugin due date: 📅 YYYY-MM-DD. The only date this plugin reads:
// start (🛫) and scheduled (⏳) dates are left alone, so a note that carries them
// still parses, they just don't mean anything here.
const DUE_DATE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
// Matches Tasks-plugin priority emojis
const PRIORITY_RE = /(🔺|⏫|🔼|🔽|⏬)/;
// Matches Obsidian tags: #tag (no spaces, no #-only). The `#` must start the
// line or follow whitespace, like Obsidian's own tag parsing — without that
// guard any `#` inside a URL started a tag, so a task linking to
// `https://example.com/guide#hide` silently picked up the hide tag and vanished
// from the matrix (and `…#do` forced it into the Do quadrant).
const TAG_RE = /(?:^|\s)#([^\s#]\S*)/g;

/** A task checkbox that counts as done: checked (x/X) or cancelled (-). */
const DONE_MARKS = new Set(['x', 'X', '-']);

/**
 * Reads one task line into a TaskItem: due date, priority, tags, size, and the
 * home note its first wikilink points to. The progress log is attached by the
 * caller, which knows where it lives (the note or the lines below).
 */
export function parseTaskLine(
	app: App,
	file: TFile,
	line: string,
	lineNumber: number,
	settings: FocusFirstSettings,
	mark = ' ',
): TaskItem {
	const dueDateMatch = DUE_DATE_RE.exec(line);
	const dueDate = dueDateMatch?.[1] ? parseIsoDate(dueDateMatch[1]) : undefined;

	const priorityMatch = PRIORITY_RE.exec(line);
	const priority = priorityMatch?.[1] as Priority | undefined;

	const tags: string[] = [];
	let tagMatch: RegExpExecArray | null;
	TAG_RE.lastIndex = 0;
	while ((tagMatch = TAG_RE.exec(line)) !== null) {
		tags.push(`#${tagMatch[1]}`);
	}

	return {
		file,
		line,
		lineNumber,
		completed: DONE_MARKS.has(mark),
		dueDate,
		priority,
		size: detectSize(tags, settings),
		tags,
		homeNote: resolveHomeNote(app, line, file.path),
		progress: [],
	};
}

/**
 * Groups the plain (non-checkbox) bullets of a note under their parent line.
 * Obsidian encodes nesting in `parent`: >= 0 is the parent's line, negative
 * means top-level. Only direct children count as a task's log entries.
 */
function plainChildrenByParent(listItems: ListItemCache[]): Map<number, ListItemCache[]> {
	const byParent = new Map<number, ListItemCache[]>();
	for (const item of listItems) {
		if (item.task !== undefined || item.parent < 0) continue;
		const siblings = byParent.get(item.parent) ?? [];
		siblings.push(item);
		byParent.set(item.parent, siblings);
	}
	return byParent;
}

export async function scanTasks(app: App, settings: FocusFirstSettings): Promise<TaskItem[]> {
	const files = app.vault.getMarkdownFiles().filter((f) => {
		if (settings.taskScope === 'folder' && settings.taskFolder) {
			const folder = settings.taskFolder.endsWith('/')
				? settings.taskFolder
				: settings.taskFolder + '/';
			return f.path.startsWith(folder);
		}
		return true;
	});

	const results: TaskItem[] = [];

	// Several tasks may share one home note; read each note once per scan.
	const noteCache = new Map<string, Promise<string[]>>();
	const noteLines = (note: TFile): Promise<string[]> => {
		let cached = noteCache.get(note.path);
		if (!cached) {
			cached = app.vault.cachedRead(note).then((content) => content.split('\n'));
			noteCache.set(note.path, cached);
		}
		return cached;
	};

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const listItems = cache?.listItems;
		if (!listItems) continue;

		// A list item is a subtask when it has a parent list item.
		const taskItems = listItems.filter((item) =>
			item.task !== undefined && (settings.showSubtasks || item.parent < 0));
		if (taskItems.length === 0) continue;

		const content = await app.vault.cachedRead(file);
		const lines = content.split('\n');
		const childrenOf = plainChildrenByParent(listItems);

		for (const item of taskItems) {
			const lineNumber = item.position.start.line;
			const line = lines[lineNumber] ?? '';
			if (line.includes('<!-- pftf-daily:')) continue;
			const task = parseTaskLine(app, file, line, lineNumber, settings, item.task);

			task.progress = task.homeNote
				? parseNoteProgress(await noteLines(task.homeNote), settings.progressHeading)
				: (childrenOf.get(lineNumber) ?? [])
					.map((child) => {
						const childLine = child.position.start.line;
						return parseProgressLine(lines[childLine] ?? '', childLine);
					})
					.filter((entry): entry is ProgressEntry => entry !== undefined);

			results.push(task);
		}
	}

	return results;
}

/** Whether a task carries the hide tag and so stays out of every view. */
export function isHiddenTask(task: TaskItem, settings: FocusFirstSettings): boolean {
	const hideTag = settings.hideTag.trim().toLowerCase();
	if (!hideTag) return false;
	return task.tags.some((tag) => tag.toLowerCase() === hideTag);
}
