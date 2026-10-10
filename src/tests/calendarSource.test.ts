/**
 * Tests for calendarSource.ts — the day index and the metadata handed to the
 * Calendar plugin. Pure logic: no DOM, no Obsidian runtime, and no Calendar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	buildDayIndex, dayMetadata, weekDays, weekMetadata, FocusFirstCalendarSource,
	type DayIndex,
} from '../calendarSource';
import { DEFAULT_SETTINGS, type FocusFirstSettings } from '../settings';
import type { TaskItem } from '../taskScanner';
import { parseIsoDate } from '../dateUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = parseIsoDate('2026-09-16')!;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

function settings(overrides: Partial<FocusFirstSettings> = {}): FocusFirstSettings {
	return structuredClone({ ...DEFAULT_SETTINGS, ...overrides });
}

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
	return {
		file: { path: 'Tasks/Inbox.md', basename: 'Inbox' } as never,
		line: '- [ ] Sample task',
		lineNumber: 0,
		completed: false,
		tags: [],
		progress: [],
		...overrides,
	};
}

/** A task due on `iso`, important and urgent enough to land in "do" by default. */
function dueTask(iso: string, overrides: Partial<TaskItem> = {}): TaskItem {
	return makeTask({ dueDate: parseIsoDate(iso), priority: '⏫', ...overrides });
}

function entry(iso: string, alert = false, lineNumber = 1) {
	return { lineNumber, date: parseIsoDate(iso), alert, text: 'note' };
}

// ---------------------------------------------------------------------------
// buildDayIndex
// ---------------------------------------------------------------------------

describe('buildDayIndex', () => {
	it('buckets a due task on its due day, tagged with its quadrant', () => {
		const index = buildDayIndex([dueTask('2026-09-20')], settings(), NOW);
		expect(index.get('2026-09-20')?.due).toEqual([{ quadrant: 'schedule', overdue: false }]);
	});

	it('marks a due day already past as overdue', () => {
		const index = buildDayIndex([dueTask('2026-09-10')], settings(), NOW);
		expect(index.get('2026-09-10')?.due).toEqual([{ quadrant: 'do', overdue: true }]);
	});

	it('does not mark today as overdue', () => {
		const index = buildDayIndex([dueTask('2026-09-16')], settings(), NOW);
		expect(index.get('2026-09-16')?.due[0]?.overdue).toBe(false);
	});

	it('leaves completed tasks off the grid', () => {
		const index = buildDayIndex([dueTask('2026-09-20', { completed: true })], settings(), NOW);
		expect(index.get('2026-09-20')).toBeUndefined();
	});

	it('leaves hidden tasks off the grid, as the matrix does', () => {
		const task = dueTask('2026-09-20', { tags: ['#hide'] });
		const index = buildDayIndex([task], settings(), NOW);
		expect(index.get('2026-09-20')).toBeUndefined();
	});

	it('ignores a task with no due date', () => {
		const index = buildDayIndex([makeTask({ priority: '⏫' })], settings(), NOW);
		expect([...index.keys()]).toEqual([]);
	});

	it('buckets progress entries on the day they were written', () => {
		const task = makeTask({ progress: [entry('2026-09-14'), entry('2026-09-15', true, 2)] });
		const index = buildDayIndex([task], settings(), NOW);
		expect(index.get('2026-09-14')?.progress).toEqual([{ alert: false }]);
		expect(index.get('2026-09-15')?.progress).toEqual([{ alert: true }]);
	});

	it('keeps the progress log of a completed task — finishing does not erase the days worked', () => {
		const task = makeTask({ completed: true, progress: [entry('2026-09-14')] });
		const index = buildDayIndex([task], settings(), NOW);
		expect(index.get('2026-09-14')?.progress).toHaveLength(1);
	});

	it('skips an undated progress entry', () => {
		const task = makeTask({ progress: [{ lineNumber: 1, alert: false, text: 'no date' }] });
		expect([...buildDayIndex([task], settings(), NOW).keys()]).toEqual([]);
	});

	it('counts a shared home note\'s log once, not once per task pointing at it', () => {
		const home = { path: 'Tasks/事项/Bridge.md', basename: 'Bridge' } as never;
		const log = [entry('2026-09-14')];
		const index = buildDayIndex(
			[makeTask({ homeNote: home, progress: log }), makeTask({ lineNumber: 5, homeNote: home, progress: log })],
			settings(),
			NOW,
		);
		expect(index.get('2026-09-14')?.progress).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// dayMetadata
// ---------------------------------------------------------------------------

describe('dayMetadata', () => {
	function indexWith(tasks: TaskItem[]): DayIndex {
		return buildDayIndex(tasks, settings(), NOW);
	}

	it('says nothing at all about an empty day', () => {
		const meta = dayMetadata(indexWith([]), '2026-09-20', settings());
		expect(meta).toEqual({ classes: [], dataAttributes: {}, dots: [] });
	});

	it('gives a due task a filled dot in its quadrant class', () => {
		const meta = dayMetadata(indexWith([dueTask('2026-09-20')]), '2026-09-20', settings());
		expect(meta.dots).toHaveLength(1);
		expect(meta.dots[0]?.isFilled).toBe(true);
		expect(meta.dots[0]?.className).toContain('ff-dot-schedule');
		expect(meta.dots[0]?.className).not.toContain('ff-dot-overdue');
		expect(meta.classes).toContain('ff-has-due');
	});

	it('marks an overdue dot and its cell', () => {
		const meta = dayMetadata(indexWith([dueTask('2026-09-10')]), '2026-09-10', settings());
		expect(meta.dots[0]?.className).toContain('ff-dot-overdue');
		expect(meta.classes).toContain('ff-has-overdue');
	});

	it('gives a progress note a hollow dot', () => {
		const task = makeTask({ progress: [entry('2026-09-14')] });
		const meta = dayMetadata(indexWith([task]), '2026-09-14', settings());
		expect(meta.dots[0]?.isFilled).toBe(false);
		expect(meta.dots[0]?.className).toContain('ff-dot-progress');
		expect(meta.classes).toEqual(['ff-has-progress']);
	});

	it('marks an alert entry', () => {
		const task = makeTask({ progress: [entry('2026-09-14', true)] });
		const meta = dayMetadata(indexWith([task]), '2026-09-14', settings());
		expect(meta.dots[0]?.className).toContain('ff-dot-alert');
		expect(meta.classes).toContain('ff-has-alert');
	});

	it('reports the honest totals even when the dots are capped', () => {
		const tasks = [0, 1, 2, 3, 4].map((n) => dueTask('2026-09-20', { lineNumber: n }));
		const meta = dayMetadata(indexWith(tasks), '2026-09-20', settings());
		expect(meta.dots).toHaveLength(DEFAULT_SETTINGS.calendar.maxDots);
		expect(meta.dataAttributes['data-ff-due']).toBe('5');
	});

	it('never drops below one dot, however the cap is configured', () => {
		const opts = settings();
		opts.calendar.maxDots = 0;
		const meta = dayMetadata(indexWith([dueTask('2026-09-20')]), '2026-09-20', opts);
		expect(meta.dots).toHaveLength(1);
	});

	it('puts due dots before progress dots, so the cap keeps what is owed', () => {
		const opts = settings();
		opts.calendar.maxDots = 1;
		const index = buildDayIndex(
			[dueTask('2026-09-20'), makeTask({ progress: [entry('2026-09-20')] })],
			opts,
			NOW,
		);
		const meta = dayMetadata(index, '2026-09-20', opts);
		expect(meta.dots).toHaveLength(1);
		expect(meta.dots[0]?.isFilled).toBe(true);
	});

	it('drops due dots when showDue is off, keeping the progress ones', () => {
		const opts = settings();
		opts.calendar.showDue = false;
		const index = buildDayIndex(
			[dueTask('2026-09-20'), makeTask({ progress: [entry('2026-09-20')] })],
			opts,
			NOW,
		);
		const meta = dayMetadata(index, '2026-09-20', opts);
		expect(meta.dots).toHaveLength(1);
		expect(meta.dots[0]?.isFilled).toBe(false);
		expect(meta.classes).not.toContain('ff-has-due');
	});

	it('drops progress dots when showProgress is off', () => {
		const opts = settings();
		opts.calendar.showProgress = false;
		const index = buildDayIndex([makeTask({ progress: [entry('2026-09-20')] })], opts, NOW);
		expect(dayMetadata(index, '2026-09-20', opts).dots).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The week strip
// ---------------------------------------------------------------------------

describe('weekDays', () => {
	it('returns the seven days from the one given', () => {
		expect(weekDays('2026-09-14')).toEqual([
			'2026-09-14', '2026-09-15', '2026-09-16',
			'2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
		]);
	});

	it('crosses a month boundary by calendar day, not by arithmetic on the number', () => {
		expect(weekDays('2026-09-28')).toContain('2026-10-01');
		expect(weekDays('2026-09-28')).toHaveLength(7);
	});

	it('returns nothing for a malformed date', () => {
		expect(weekDays('not-a-date')).toEqual([]);
	});
});

describe('weekMetadata', () => {
	it('sums the week and carries no dots of its own', () => {
		const index = buildDayIndex(
			[dueTask('2026-09-15'), dueTask('2026-09-17', { lineNumber: 2 }), makeTask({ progress: [entry('2026-09-18')] })],
			settings(),
			NOW,
		);
		const meta = weekMetadata(index, '2026-09-14', settings());
		expect(meta.dots).toEqual([]);
		expect(meta.dataAttributes['data-ff-due']).toBe('2');
		expect(meta.dataAttributes['data-ff-progress']).toBe('1');
		expect(meta.classes).toContain('ff-has-due');
	});

	it('says nothing about an empty week', () => {
		const meta = weekMetadata(buildDayIndex([], settings(), NOW), '2026-09-14', settings());
		expect(meta).toEqual({ classes: [], dataAttributes: {}, dots: [] });
	});
});

// ---------------------------------------------------------------------------
// The source Calendar actually calls
// ---------------------------------------------------------------------------

describe('FocusFirstCalendarSource', () => {
	const date = (iso: string) => ({ format: () => iso });

	it('scans once for a whole tick, however many cells ask', async () => {
		const scan = vi.fn().mockResolvedValue([dueTask('2026-09-20')]);
		const source = new FocusFirstCalendarSource(scan, () => settings());

		const metas = await Promise.all([
			source.getDailyMetadata(date('2026-09-20')),
			source.getDailyMetadata(date('2026-09-21')),
			source.getDailyMetadata(date('2026-09-22')),
		]);

		expect(scan).toHaveBeenCalledTimes(1);
		expect(metas[0]?.dots).toHaveLength(1);
		expect(metas[1]?.dots).toEqual([]);
	});

	it('rescans after invalidate', async () => {
		const scan = vi.fn().mockResolvedValue([]);
		const source = new FocusFirstCalendarSource(scan, () => settings());
		await source.getDailyMetadata(date('2026-09-20'));
		source.invalidate();
		await source.getDailyMetadata(date('2026-09-20'));
		expect(scan).toHaveBeenCalledTimes(2);
	});

	it('says nothing when the integration is switched off', async () => {
		const opts = settings();
		opts.calendar.enabled = false;
		const scan = vi.fn().mockResolvedValue([dueTask('2026-09-20')]);
		const source = new FocusFirstCalendarSource(scan, () => opts);
		expect(await source.getDailyMetadata(date('2026-09-20'))).toEqual({
			classes: [], dataAttributes: {}, dots: [],
		});
		expect(scan).not.toHaveBeenCalled();
	});

	it('answers with an empty day rather than throwing when the scan fails', async () => {
		const source = new FocusFirstCalendarSource(
			() => Promise.reject(new Error('vault unreadable')),
			() => settings(),
		);
		await expect(source.getDailyMetadata(date('2026-09-20'))).resolves.toEqual({
			classes: [], dataAttributes: {}, dots: [],
		});
	});

	it('implements getWeeklyMetadata, which Calendar calls without a guard', async () => {
		const source = new FocusFirstCalendarSource(
			() => Promise.resolve([dueTask('2026-09-15')]),
			() => settings(),
		);
		const meta = await source.getWeeklyMetadata(date('2026-09-14'));
		expect(meta.dataAttributes['data-ff-due']).toBe('1');
	});
});
