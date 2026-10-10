/**
 * Tests for progressLog.ts — parsing log bullets, finding the end of a task's
 * block, choosing the indent for a new entry, and the guarded append.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	parseProgressLine, latestEntry, daysSinceEntry, formatProgressLine,
	blockEnd, childIndent, appendProgressEntry, parseNoteProgress,
} from '../progressLog';
import { TFile } from './__mocks__/obsidian';
import type { TaskItem } from '../taskScanner';

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
	return {
		file: new TFile('Notes/test.md') as never,
		line: '- [ ] Bridge',
		lineNumber: 0,
		completed: false,
		tags: [],
		progress: [],
		...overrides,
	};
}

function makeApp(content: string) {
	const store = { content };
	const modify = vi.fn(async (_file: unknown, next: string) => { store.content = next; });
	const app = {
		vault: {
			getAbstractFileByPath: (_path: string) => new TFile('Notes/test.md'),
			read: vi.fn(async () => store.content),
			modify,
		},
	};
	return { app: app as unknown as import('obsidian').App, store, modify };
}

const NOW = new Date(2026, 8, 3); // 2026-09-03, local

describe('parseProgressLine', () => {
	it('reads the date, the alert mark, and the text', () => {
		const entry = parseProgressLine('    - 2026-09-03 ⚠ Still 200k short', 4);
		expect(entry?.lineNumber).toBe(4);
		expect(entry?.date?.getDate()).toBe(3);
		expect(entry?.alert).toBe(true);
		expect(entry?.text).toBe('Still 200k short');
	});

	it('accepts an entry without a date, and without the mark', () => {
		expect(parseProgressLine('\t- Just a remark', 1)).toEqual({ lineNumber: 1, date: undefined, alert: false, text: 'Just a remark' });
	});

	it('accepts the emoji-presentation form of the mark', () => {
		expect(parseProgressLine('- 2026-09-03 ⚠️ Danger', 1)?.alert).toBe(true);
	});

	it('returns undefined for a blank bullet or a non-bullet line', () => {
		expect(parseProgressLine('- ', 1)).toBeUndefined();
		expect(parseProgressLine('plain paragraph', 1)).toBeUndefined();
	});
});

describe('latestEntry / daysSinceEntry', () => {
	it('picks the last entry in note order', () => {
		const a = { lineNumber: 1, alert: false, text: 'a' };
		const b = { lineNumber: 2, alert: false, text: 'b' };
		expect(latestEntry([a, b])).toBe(b);
		expect(latestEntry([])).toBeUndefined();
	});

	it('counts whole days since a dated entry, and nothing for an undated one', () => {
		expect(daysSinceEntry({ lineNumber: 1, alert: false, text: '', date: new Date(2026, 7, 31) }, NOW)).toBe(3);
		expect(daysSinceEntry({ lineNumber: 1, alert: false, text: '' }, NOW)).toBeUndefined();
	});
});

describe('formatProgressLine', () => {
	it('writes the canonical bullet, with the mark only when asked', () => {
		expect(formatProgressLine('    ', '2026-09-03', ' Called them ', false)).toBe('    - 2026-09-03 Called them');
		expect(formatProgressLine('\t', '2026-09-03', 'Short', true)).toBe('\t- 2026-09-03 ⚠ Short');
	});
});

describe('blockEnd / childIndent', () => {
	const lines = [
		'- [ ] Bridge',
		'    - [ ] Subtask',
		'        - deeper note',
		'    - 2026-09-01 A note',
		'- [ ] Next task',
	];

	it('ends the block at the next line that is not indented deeper', () => {
		expect(blockEnd(lines, 0)).toBe(4);
		expect(blockEnd(lines, 1)).toBe(3);
		expect(blockEnd(lines, 4)).toBe(5);
	});

	it('stops at a blank line', () => {
		expect(blockEnd(['- [ ] A', '    - note', '', '    - stray'], 0)).toBe(2);
	});

	it('reuses the indentation of an existing child', () => {
		expect(childIndent(lines, 0, 4)).toBe('    ');
		expect(childIndent(['- [ ] A', '\t- note'], 0, 2)).toBe('\t');
	});

	it('indents one level under a task with no children, in the note\'s style', () => {
		expect(childIndent(['- [ ] A'], 0, 1)).toBe('    ');
		expect(childIndent(['\t- [ ] A'], 0, 1)).toBe('\t\t');
		expect(childIndent(['- [ ] A', '- [ ] B', '\t- [ ] C'], 0, 1)).toBe('\t');
	});
});

describe('appendProgressEntry', () => {
	it('appends a dated bullet after the task\'s block and returns an insertion snapshot', async () => {
		const { app, store } = makeApp('- [ ] Bridge\n    - 2026-09-01 First\n- [ ] Next');
		const snap = await appendProgressEntry(app, makeTask(), 'Second', false, 'Progress', NOW);
		expect(store.content).toBe('- [ ] Bridge\n    - 2026-09-01 First\n    - 2026-09-03 Second\n- [ ] Next');
		expect(snap).toEqual({ filePath: 'Notes/test.md', startLine: 2, before: [], after: ['    - 2026-09-03 Second'] });
	});

	it('writes the alert mark when asked', async () => {
		const { app, store } = makeApp('- [ ] Bridge');
		await appendProgressEntry(app, makeTask(), 'Trouble', true, 'Progress', NOW);
		expect(store.content).toBe('- [ ] Bridge\n    - 2026-09-03 ⚠ Trouble');
	});

	it('writes nothing for blank text', async () => {
		const { app, modify } = makeApp('- [ ] Bridge');
		expect(await appendProgressEntry(app, makeTask(), '   ', false, 'Progress', NOW)).toBeUndefined();
		expect(modify).not.toHaveBeenCalled();
	});

	it('refuses to write when the task line has moved (stale guard)', async () => {
		const { app, modify } = makeApp('- [ ] Something else\n- [ ] Bridge');
		expect(await appendProgressEntry(app, makeTask(), 'Note', false, 'Progress', NOW)).toBeUndefined();
		expect(modify).not.toHaveBeenCalled();
	});
});

describe('progress kept in a home note', () => {
	const note = [
		'---', 'title: Bridge', '---', '', '# Bridge', '', '## Links', '- [[Mayor]]', '',
		'## Progress', '- 2026-09-01 Called the village', '- 2026-09-02 ⚠ Money short', '', '## Review', '- ',
	];

	it('reads the top-level bullets of the progress section only', () => {
		const entries = parseNoteProgress(note, 'Progress');
		expect(entries.map((e) => e.text)).toEqual(['Called the village', 'Money short']);
		expect(entries.map((e) => e.lineNumber)).toEqual([10, 11]);
		expect(parseNoteProgress(note, 'Missing')).toEqual([]);
	});

	it('appends into the note\'s section, not under the task line', async () => {
		const { app, store } = makeApp('- [ ] [[Bridge]] ⏫');
		const home = new TFile('Notes/Bridge.md');
		const noteStore = { content: note.join('\n') };
		app.vault.read = vi.fn(async (file: { path: string }) => (file.path === home.path ? noteStore.content : store.content));
		app.vault.modify = vi.fn(async (file: { path: string }, next: string) => {
			if (file.path === home.path) noteStore.content = next; else store.content = next;
		});
		const snap = await appendProgressEntry(app, makeTask({ line: '- [ ] [[Bridge]] ⏫', homeNote: home as never }), 'Third', false, 'Progress', NOW);
		const lines = noteStore.content.split('\n');
		expect(lines[12]).toBe('- 2026-09-03 Third');
		expect(lines[13]).toBe('');
		expect(lines[14]).toBe('## Review');
		expect(store.content).toBe('- [ ] [[Bridge]] ⏫');
		expect(snap).toEqual({ filePath: 'Notes/Bridge.md', startLine: 12, before: [], after: ['- 2026-09-03 Third'] });
	});
});


describe('multiline quick progress', () => {
	it('dates each nonempty line and keeps the next task outside the progress block', async () => {
		const { app, store, modify } = makeApp('- [ ] Bridge\n- [ ] Next task');
		const snapshot = await appendProgressEntry(app, makeTask(), '计划：学习第一章\n\n已推进：完成练习\n未推进：第二章', false, 'Progress', NOW);
		expect(snapshot?.after).toEqual([
			'    - 2026-09-03 计划：学习第一章',
			'    - 2026-09-03 已推进：完成练习',
			'    - 2026-09-03 未推进：第二章',
		]);
		expect(store.content.endsWith('\n- [ ] Next task')).toBe(true);
		expect(modify).toHaveBeenCalledOnce();
	});
	it('round-trips all lines through the linked note progress parser', async () => {
		const { app, store } = makeApp('# Bridge\n\nDetailed project description');
		await appendProgressEntry(app, makeTask({ homeNote: new TFile('Bridge.md') as never }), '准备：调研\r\n未推进：等资料', false, 'Progress', NOW);
		expect(parseNoteProgress(store.content.split('\n'), 'Progress').map(entry => entry.text)).toEqual(['准备：调研', '未推进：等资料']);
		expect(store.content).toContain('Detailed project description');
	});
});
