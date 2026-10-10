import { describe, it, expect, vi } from 'vitest';
import { linkTaskLine, noteTemplate, promoteTask, archiveTask } from '../promote';
import { DEFAULT_SETTINGS, FocusFirstSettings } from '../settings';
import { TFile } from './__mocks__/obsidian';
import type { TaskItem } from '../taskScanner';

const NOW = new Date(2026, 8, 3);

function settings(overrides: Partial<FocusFirstSettings> = {}): FocusFirstSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

/** A tiny vault: files by path, with folders tracked so ensureFolder is observable. */
function makeVault(files: Record<string, string>) {
	const store: Record<string, string> = { ...files };
	const folders = new Set<string>();
	const renames: [string, string][] = [];
	const vault = {
		getAbstractFileByPath: (path: string) => {
			if (path in store) return new TFile(path);
			return folders.has(path) ? { path } : null;
		},
		read: vi.fn(async (file: { path: string }) => store[file.path] ?? ''),
		modify: vi.fn(async (file: { path: string }, content: string) => { store[file.path] = content; }),
		create: vi.fn(async (path: string, content: string) => { store[path] = content; return new TFile(path); }),
		createFolder: vi.fn(async (path: string) => { folders.add(path); }),
	};
	const app = {
		vault,
		fileManager: {
			renameFile: vi.fn(async (file: { path: string }, to: string) => {
				store[to] = store[file.path] ?? '';
				delete store[file.path];
				renames.push([file.path, to]);
			}),
		},
	} as unknown as import('obsidian').App;
	return { app, store, folders, renames };
}

function task(line: string, overrides: Partial<TaskItem> = {}): TaskItem {
	const file = new TFile('Tasks/Inbox.md');
	(file as unknown as { parent: { path: string } }).parent = { path: 'Tasks' };
	return { file: file as never, line, lineNumber: 0, completed: false, tags: [], progress: [], ...overrides };
}

describe('linkTaskLine', () => {
	it('turns the description into a link and keeps the metadata in place', () => {
		expect(linkTaskLine('- [ ] Build the bridge 📅 2026-09-20 ⏫ #l', 'Build the bridge'))
			.toBe('- [ ] [[Build the bridge]] 📅 2026-09-20 ⏫ #l');
		expect(linkTaskLine('\t- [ ] Sub task', 'Sub task')).toBe('\t- [ ] [[Sub task]]');
	});

	it('prepends the link when the description is interleaved with metadata', () => {
		expect(linkTaskLine('- [ ] Call 📅 2026-09-20 the mayor', 'Call the mayor'))
			.toBe('- [ ] [[Call the mayor]] Call 📅 2026-09-20 the mayor');
	});
});

describe('noteTemplate', () => {
	it('has frontmatter, a title, and the progress section with the moved entries', () => {
		expect(noteTemplate('Bridge', 'Progress', ['- 2026-09-01 Called'], NOW)).toBe([
			'---', 'title: Bridge', 'date: 2026-09-03', 'tags:', '  - task', '---', '', '# Bridge', '', '## Progress', '- 2026-09-01 Called', '',
		].join('\n'));
	});
});

describe('promoteTask', () => {
	it('creates the note in the notes folder, moves the inline log, and links the line', async () => {
		const { app, store, folders } = makeVault({
			'Tasks/Inbox.md': '- [ ] Build the bridge 📅 2026-09-20 ⏫\n    - 2026-09-01 Called the village\n    - [ ] Subtask stays\n    - 2026-09-02 ⚠ Money short\n- [ ] Other',
		});
		const result = await promoteTask(app, settings({ notesFolder: 'Tasks/Notes', progressHeading: 'Progress' }), task('- [ ] Build the bridge 📅 2026-09-20 ⏫'), NOW);
		expect(result.status).toBe('created');
		expect(folders.has('Tasks/Notes')).toBe(true);
		expect(store['Tasks/Notes/Build the bridge.md']).toContain('## Progress\n- 2026-09-01 Called the village\n- 2026-09-02 ⚠ Money short\n');
		expect(store['Tasks/Inbox.md']).toBe('- [ ] [[Build the bridge]] 📅 2026-09-20 ⏫\n    - [ ] Subtask stays\n- [ ] Other');
	});

	it('links an existing note instead of overwriting it, appending the log to its section', async () => {
		const { app, store } = makeVault({
			'Tasks/Inbox.md': '- [ ] Learn AI ⏫\n    - 2026-09-01 Started the course',
			'Tasks/Learn AI.md': '# Learn AI\n\nMy notes.\n',
		});
		const result = await promoteTask(app, settings({ progressHeading: 'Progress' }), task('- [ ] Learn AI ⏫'), NOW);
		expect(result.status).toBe('linked');
		// The note's trailing newline is kept; the section goes in front of it.
		expect(store['Tasks/Learn AI.md']).toBe('# Learn AI\n\nMy notes.\n\n## Progress\n- 2026-09-01 Started the course\n');
		expect(store['Tasks/Inbox.md']).toBe('- [ ] [[Learn AI]] ⏫');
	});

	it('falls back to the task\'s own folder when no notes folder is set', async () => {
		const { app, store } = makeVault({ 'Tasks/Inbox.md': '- [ ] Solo' });
		await promoteTask(app, settings(), task('- [ ] Solo'), NOW);
		expect(store['Tasks/Solo.md']).toBeDefined();
	});

	it('does nothing for a task that already has a note, or whose line moved', async () => {
		const home = new TFile('Tasks/Bridge.md');
		const { app } = makeVault({ 'Tasks/Inbox.md': '- [ ] [[Bridge]]' });
		expect((await promoteTask(app, settings(), task('- [ ] [[Bridge]]', { homeNote: home as never }), NOW)).status).toBe('already');
		const moved = makeVault({ 'Tasks/Inbox.md': '- [ ] Something else' });
		expect((await promoteTask(moved.app, settings(), task('- [ ] Bridge'), NOW)).status).toBe('stale');
	});
});

describe('archiveTask', () => {
	const home = new TFile('Tasks/Notes/Bridge.md');

	it('checks the line off, adds the review section once, and moves the note', async () => {
		const { app, store, renames } = makeVault({
			'Tasks/Inbox.md': '- [ ] [[Bridge]] ⏫',
			'Tasks/Notes/Bridge.md': '# Bridge\n\n## Progress\n- 2026-09-01 Done\n',
		});
		const result = await archiveTask(app, settings({ archiveFolder: 'Archive', reviewHeading: 'Review' }), task('- [ ] [[Bridge]] ⏫', { homeNote: home as never }), NOW);
		expect(result).toBe('archived');
		expect(store['Tasks/Inbox.md']).toBe('- [x] [[Bridge]] ⏫');
		expect(renames).toEqual([['Tasks/Notes/Bridge.md', 'Archive/Bridge.md']]);
		expect(store['Archive/Bridge.md']).toBe('# Bridge\n\n## Progress\n- 2026-09-01 Done\n\n## Review\n- \n');
	});

	it('only completes the task when no archive folder is set', async () => {
		const { app, renames } = makeVault({ 'Tasks/Inbox.md': '- [ ] [[Bridge]]', 'Tasks/Notes/Bridge.md': '# Bridge\n' });
		expect(await archiveTask(app, settings({ archiveFolder: '' }), task('- [ ] [[Bridge]]', { homeNote: home as never }), NOW)).toBe('completed-only');
		expect(renames).toEqual([]);
	});

	it('refuses a task without a note, and does not move onto an existing file', async () => {
		const { app } = makeVault({ 'Tasks/Inbox.md': '- [ ] Plain' });
		expect(await archiveTask(app, settings(), task('- [ ] Plain'), NOW)).toBe('needs-note');
		const clash = makeVault({ 'Tasks/Inbox.md': '- [ ] [[Bridge]]', 'Tasks/Notes/Bridge.md': '# B\n', 'Archive/Bridge.md': 'old' });
		expect(await archiveTask(clash.app, settings({ archiveFolder: 'Archive' }), task('- [ ] [[Bridge]]', { homeNote: home as never }), NOW)).toBe('target-exists');
		expect(clash.store['Archive/Bridge.md']).toBe('old');
	});
});
