import { describe, it, expect } from 'vitest';
import { firstWikiLink, unlinkText, resolveHomeNote } from '../homeNote';
import { readSection, sectionInsertion } from '../noteSection';
import { taskTitle } from '../tasksFormat';
import { TFile } from './__mocks__/obsidian';

describe('firstWikiLink / unlinkText', () => {
	it('reads target and alias, ignoring a heading anchor', () => {
		expect(firstWikiLink('- [ ] [[Learn AI|AI]] ⏫')).toEqual({ target: 'Learn AI', alias: 'AI' });
		expect(firstWikiLink('- [ ] [[Bridge#Plan]] 📅 2026-09-20')).toEqual({ target: 'Bridge', alias: undefined });
		expect(firstWikiLink('- [ ] No link here')).toBeUndefined();
	});

	it('shows links as their text', () => {
		expect(unlinkText('Read [[Deep Work|the book]] and [[Notes]]')).toBe('Read the book and Notes');
	});

	it('taskTitle shows a linked task by its link text', () => {
		expect(taskTitle('- [ ] [[Learn AI]] 📅 2026-12-31 ⏫ #l')).toBe('Learn AI');
		expect(taskTitle('- [ ] [[Learn AI|AI]] ⏫')).toBe('AI');
	});
});

describe('resolveHomeNote', () => {
	const bridge = new TFile('Tasks/Bridge.md');
	const app = {
		metadataCache: {
			getFirstLinkpathDest: (link: string) => (link === 'Bridge' ? bridge : null),
		},
	} as unknown as import('obsidian').App;

	it('returns the note the first link resolves to', () => {
		expect(resolveHomeNote(app, '- [ ] [[Bridge]] ⏫', 'Tasks/Inbox.md')).toBe(bridge);
	});

	it('returns undefined for a dangling link or no link', () => {
		expect(resolveHomeNote(app, '- [ ] [[Nowhere]]', 'Tasks/Inbox.md')).toBeUndefined();
		expect(resolveHomeNote(app, '- [ ] Plain', 'Tasks/Inbox.md')).toBeUndefined();
	});
});

describe('readSection / sectionInsertion', () => {
	const lines = ['# Title', '', '## Progress', '- a', '- b', '', '### Sub', '- c', '## Review', '- '];

	it('finds a section and ends it at the next heading of the same or higher level', () => {
		expect(readSection(lines, 'Progress')).toEqual({ start: 2, end: 8, level: 2 });
		expect(readSection(lines, 'review')).toEqual({ start: 8, end: 10, level: 2 });
		expect(readSection(lines, 'Nope')).toBeUndefined();
	});

	it('inserts at the end of an existing section, before trailing blank lines', () => {
		expect(sectionInsertion(['## Progress', '- a', '', '', '## Next'], 'Progress', ['- b'])).toEqual({ insertAt: 2, inserted: ['- b'] });
	});

	it('creates a missing section at the end of the note, after a blank separator', () => {
		expect(sectionInsertion(['# Title', 'text', ''], 'Progress', ['- a'])).toEqual({
			insertAt: 2, inserted: ['', '## Progress', '- a'],
		});
		expect(sectionInsertion([], 'Progress', ['- a'])).toEqual({ insertAt: 0, inserted: ['## Progress', '- a'] });
	});
});
