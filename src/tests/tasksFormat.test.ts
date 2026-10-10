import { describe, it, expect } from 'vitest';
import {
	canonicalizeTaskLine,
	addDaysToIso,
	setDueDate,
	clearDueDate,
	setPriority,
	setSize,
} from '../tasksFormat';

const SIZE_TAGS = ['#s', '#m', '#l'];

describe('canonicalizeTaskLine', () => {
	it('moves priority and due date after the description and tags', () => {
		const line = '- [ ] Send the signed vendor contract back 📅 2026-07-05 ⏫ #focus #do';
		expect(canonicalizeTaskLine(line)).toBe(
			'- [ ] Send the signed vendor contract back #focus #do ⏫ 📅 2026-07-05',
		);
	});

	it('keeps already-canonical lines equivalent', () => {
		const line = '- [ ] Fix production bug #focus #do #hide 🔺 📅 2026-06-28';
		expect(canonicalizeTaskLine(line)).toBe(
			'- [ ] Fix production bug #focus #do #hide 🔺 📅 2026-06-28',
		);
	});

	it('orders multiple dates canonically (created, start, scheduled, due, done)', () => {
		const line = '- [ ] Task ✅ 2026-01-05 📅 2026-01-04 ➕ 2026-01-01 ⏳ 2026-01-03 🛫 2026-01-02';
		expect(canonicalizeTaskLine(line)).toBe(
			'- [ ] Task ➕ 2026-01-01 🛫 2026-01-02 ⏳ 2026-01-03 📅 2026-01-04 ✅ 2026-01-05',
		);
	});

	it('places priority before recurrence and dates', () => {
		const line = '- [ ] Water plants 🔁 every week 📅 2026-05-01 🔼';
		expect(canonicalizeTaskLine(line)).toBe(
			'- [ ] Water plants 🔼 🔁 every week 📅 2026-05-01',
		);
	});

	it('preserves the checkbox status character', () => {
		expect(canonicalizeTaskLine('- [x] Done task ⏫ 📅 2026-07-05')).toBe(
			'- [x] Done task ⏫ 📅 2026-07-05',
		);
	});

	it('normalizes the list marker and indentation to a flat "- [ ]"', () => {
		expect(canonicalizeTaskLine('    * [ ] Nested item ⏫')).toBe('- [ ] Nested item ⏫');
	});

	it('leaves a task without metadata unchanged (aside from marker)', () => {
		expect(canonicalizeTaskLine('- [ ] Just a plain task #focus')).toBe(
			'- [ ] Just a plain task #focus',
		);
	});

	it('returns non-task lines unchanged', () => {
		expect(canonicalizeTaskLine('Just a paragraph')).toBe('Just a paragraph');
		expect(canonicalizeTaskLine('- A bullet, not a task')).toBe('- A bullet, not a task');
	});
});

describe('addDaysToIso', () => {
	it('adds days within a month', () => {
		expect(addDaysToIso('2026-07-07', 1)).toBe('2026-07-08');
		expect(addDaysToIso('2026-07-07', 7)).toBe('2026-07-14');
	});

	it('rolls over month and year boundaries', () => {
		expect(addDaysToIso('2026-07-31', 1)).toBe('2026-08-01');
		expect(addDaysToIso('2026-12-31', 1)).toBe('2027-01-01');
	});
});

describe('setDueDate', () => {
	it('replaces an existing due date, preserving other tokens', () => {
		expect(setDueDate('- [ ] Task ⏫ 📅 2026-07-05 #do', '2026-07-10')).toBe(
			'- [ ] Task ⏫ 📅 2026-07-10 #do',
		);
	});

	it('appends a due date when there is none', () => {
		expect(setDueDate('- [ ] Task #do', '2026-07-10')).toBe('- [ ] Task #do 📅 2026-07-10');
	});

	it('preserves indentation of nested tasks', () => {
		expect(setDueDate('\t- [ ] Sub 📅 2026-07-05', '2026-07-10')).toBe('\t- [ ] Sub 📅 2026-07-10');
	});

	it('leaves non-task lines unchanged', () => {
		expect(setDueDate('Just text', '2026-07-10')).toBe('Just text');
	});
});

describe('setPriority', () => {
	it('adds a priority in canonical position (before recurrence and dates)', () => {
		expect(setPriority('- [ ] Task 🔁 every week 📅 2026-07-07', '⏫')).toBe(
			'- [ ] Task ⏫ 🔁 every week 📅 2026-07-07',
		);
	});

	it('replaces an existing priority', () => {
		expect(setPriority('- [ ] Task 🔺 📅 2026-07-07', '🔽')).toBe('- [ ] Task 🔽 📅 2026-07-07');
	});

	it('does not leave a double space when the text starts with a date', () => {
		// The head before the first signifier is empty here, which used to leave a
		// leading space and write "- [ ]  🔺 …" into the note.
		expect(setPriority('- [ ] 📅 2026-07-07', '🔺')).toBe('- [ ] 🔺 📅 2026-07-07');
	});

	it('does not leave a double space when the text is only a recurrence rule', () => {
		expect(setPriority('- [ ] 🔁 every week', '⏫')).toBe('- [ ] ⏫ 🔁 every week');
	});

	it('removes the priority when passed null', () => {
		expect(setPriority('- [ ] Task 🔺 📅 2026-07-07', null)).toBe('- [ ] Task 📅 2026-07-07');
	});

	it('appends the priority when there is no other metadata', () => {
		expect(setPriority('- [ ] Plain task', '🔼')).toBe('- [ ] Plain task 🔼');
	});

	it('preserves indentation', () => {
		expect(setPriority('    - [ ] Nested 📅 2026-07-07', '⏬')).toBe('    - [ ] Nested ⏬ 📅 2026-07-07');
	});

	it('leaves non-task lines unchanged', () => {
		expect(setPriority('Just text', '🔺')).toBe('Just text');
	});
});

describe('setSize', () => {
	it('appends the chosen size tag', () => {
		expect(setSize('- [ ] Task', '#s', SIZE_TAGS)).toBe('- [ ] Task #s');
	});

	it('replaces an existing size with the chosen one (never two sizes)', () => {
		expect(setSize('- [ ] Task #m 📅 2026-07-07', '#l', SIZE_TAGS)).toBe('- [ ] Task 📅 2026-07-07 #l');
	});

	it('clears every size tag when passed null', () => {
		expect(setSize('- [ ] Task #s more', null, SIZE_TAGS)).toBe('- [ ] Task more');
	});

	it('matches size tags case-insensitively when clearing', () => {
		expect(setSize('- [ ] Task #M', '#s', SIZE_TAGS)).toBe('- [ ] Task #s');
	});

	it('does not duplicate a size tag that is already present', () => {
		expect(setSize('- [ ] Task #s', '#s', SIZE_TAGS)).toBe('- [ ] Task #s');
	});

	it('preserves indentation', () => {
		expect(setSize('    - [ ] Nested', '#m', SIZE_TAGS)).toBe('    - [ ] Nested #m');
	});

	it('leaves non-task lines unchanged', () => {
		expect(setSize('Just #m text', '#s', SIZE_TAGS)).toBe('Just #m text');
	});
});

describe('clearDueDate', () => {
	it('removes the due date and closes the gap', () => {
		expect(clearDueDate('- [ ] Task 📅 2026-07-07 #do')).toBe('- [ ] Task #do');
		expect(clearDueDate('- [ ] Task ⏫ 📅 2026-07-07')).toBe('- [ ] Task ⏫');
		expect(clearDueDate('- [ ] Task #do')).toBe('- [ ] Task #do');
	});
});
