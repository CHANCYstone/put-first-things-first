/**
 * Tests for taskSorting.ts — the pure sorting / grouping / date-bucketing logic
 * extracted from the view. No DOM or Obsidian runtime needed.
 */

import { describe, it, expect } from 'vitest';
import {
	compareFn, sortTasks, dueBucket, groupKey, groupLabel, groupOrder,
} from '../taskSorting';

import type { MatrixTask } from '../matrixClassifier';
import type { QuadrantSort } from '../settings';
import { parseIsoDate } from '../dateUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromToday(offset: number): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return d;
}

function makeMatrixTask(overrides: Partial<MatrixTask> = {}): MatrixTask {
	return {
		file: { path: 'Notes/test.md', basename: 'test' } as never,
		line: '- [ ] Sample task',
		lineNumber: 0,
		completed: false,
		tags: [],
		progress: [],
		quadrant: 'do',
		manual: false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// compareFn
// ---------------------------------------------------------------------------

describe('compareFn — priority', () => {
	const cmp = compareFn('priority');

	it('orders Highest before High', () => {
		expect(cmp(makeMatrixTask({ priority: '🔺' }), makeMatrixTask({ priority: '⏫' }))).toBeLessThan(0);
	});

	it('orders any priority before no priority', () => {
		expect(cmp(makeMatrixTask({ priority: '⏬' }), makeMatrixTask({ priority: undefined }))).toBeLessThan(0);
	});

	it('treats equal priorities as equal', () => {
		expect(cmp(makeMatrixTask({ priority: '🔼' }), makeMatrixTask({ priority: '🔼' }))).toBe(0);
	});
});

describe('compareFn — dueDate', () => {
	const cmp = compareFn('dueDate');

	it('orders earlier date before later date', () => {
		expect(cmp(makeMatrixTask({ dueDate: daysFromToday(0) }), makeMatrixTask({ dueDate: daysFromToday(5) }))).toBeLessThan(0);
	});

	it('orders any date before no date', () => {
		expect(cmp(makeMatrixTask({ dueDate: daysFromToday(10) }), makeMatrixTask({ dueDate: undefined }))).toBeLessThan(0);
	});

	it('treats two undated tasks as equal', () => {
		expect(cmp(makeMatrixTask({ dueDate: undefined }), makeMatrixTask({ dueDate: undefined }))).toBe(0);
	});
});

describe('compareFn — alpha', () => {
	const cmp = compareFn('alpha');

	it('orders alphabetically, ignoring the checkbox prefix', () => {
		expect(cmp(makeMatrixTask({ line: '- [ ] Apple task' }), makeMatrixTask({ line: '- [ ] Banana task' }))).toBeLessThan(0);
	});

	it('is case-insensitive', () => {
		expect(cmp(makeMatrixTask({ line: '- [ ] apple' }), makeMatrixTask({ line: '- [ ] Banana' }))).toBeLessThan(0);
	});
});

// ---------------------------------------------------------------------------
// sortTasks
// ---------------------------------------------------------------------------

describe('sortTasks', () => {
	it('sorts by primary field, falling back to secondary on ties', () => {
		const sort: QuadrantSort = { primary: 'priority', secondary: 'dueDate' };
		const tasks = [
			makeMatrixTask({ priority: '🔺', dueDate: daysFromToday(5), line: '- [ ] later' }),
			makeMatrixTask({ priority: '🔺', dueDate: daysFromToday(1), line: '- [ ] sooner' }),
			makeMatrixTask({ priority: '⏬', dueDate: daysFromToday(0), line: '- [ ] low prio' }),
		];
		expect(sortTasks(tasks, sort).map((t) => t.line)).toEqual([
			'- [ ] sooner', '- [ ] later', '- [ ] low prio',
		]);
	});

	it('does not mutate the input array', () => {
		const tasks = [makeMatrixTask({ line: '- [ ] b' }), makeMatrixTask({ line: '- [ ] a' })];
		const original = [...tasks];
		sortTasks(tasks, { primary: 'alpha', secondary: 'priority' });
		expect(tasks).toEqual(original);
	});
});

// ---------------------------------------------------------------------------
// groupKey / groupLabel / groupOrder
// ---------------------------------------------------------------------------

const URGENCY_DAYS = 3;

describe('groupKey — priority field', () => {
	it('returns the priority emoji when present', () => {
		expect(groupKey(makeMatrixTask({ priority: '🔺' }), 'priority', URGENCY_DAYS)).toBe('🔺');
	});

	it('returns "__none__" when no priority', () => {
		expect(groupKey(makeMatrixTask({ priority: undefined }), 'priority', URGENCY_DAYS)).toBe('__none__');
	});
});

describe('groupKey — dueDate field', () => {
	it('buckets overdue tasks', () => {
		expect(groupKey(makeMatrixTask({ dueDate: daysFromToday(-1) }), 'dueDate', URGENCY_DAYS)).toBe('__overdue__');
	});

	it('buckets tasks due today and within the urgency threshold as __soon__', () => {
		expect(groupKey(makeMatrixTask({ dueDate: daysFromToday(0) }), 'dueDate', URGENCY_DAYS)).toBe('__soon__');
		expect(groupKey(makeMatrixTask({ dueDate: daysFromToday(3) }), 'dueDate', URGENCY_DAYS)).toBe('__soon__');
	});

	it('buckets tasks due past the urgency threshold as __later__', () => {
		expect(groupKey(makeMatrixTask({ dueDate: daysFromToday(4) }), 'dueDate', URGENCY_DAYS)).toBe('__later__');
		expect(groupKey(makeMatrixTask({ dueDate: daysFromToday(30) }), 'dueDate', URGENCY_DAYS)).toBe('__later__');
	});

	it('follows the configured threshold, so grouping and the urgency axis agree', () => {
		expect(dueBucket(makeMatrixTask({ dueDate: daysFromToday(6) }), 7)).toBe('__soon__');
		expect(dueBucket(makeMatrixTask({ dueDate: daysFromToday(1) }), 0)).toBe('__later__');
	});

	it('buckets undated tasks as __nodate__', () => {
		expect(groupKey(makeMatrixTask({ dueDate: undefined }), 'dueDate', URGENCY_DAYS)).toBe('__nodate__');
	});
});

describe('groupKey — alpha field', () => {
	it('returns the uppercased first letter, ignoring the checkbox prefix', () => {
		expect(groupKey(makeMatrixTask({ line: '- [ ] zebra task' }), 'alpha', URGENCY_DAYS)).toBe('Z');
	});

	it('ignores the checkbox prefix for every Markdown list marker', () => {
		// "+" used to fall through the prefix regex, grouping the task under "+".
		for (const marker of ['-', '*', '+']) {
			expect(groupKey(makeMatrixTask({ line: `${marker} [ ] zebra task` }), 'alpha', URGENCY_DAYS)).toBe('Z');
		}
	});
});

describe('groupLabel', () => {
	it('maps "__none__" priority key to the no-priority label', () => {
		expect(groupLabel('__none__', 'priority', URGENCY_DAYS)).toBeTruthy();
	});

	it('returns the priority emoji unchanged otherwise', () => {
		expect(groupLabel('🔺', 'priority', URGENCY_DAYS)).toBe('🔺');
	});

	it('maps known dueDate bucket keys to labels', () => {
		expect(groupLabel('__overdue__', 'dueDate', URGENCY_DAYS)).toBeTruthy();
		expect(groupLabel('__soon__', 'dueDate', URGENCY_DAYS)).toContain('3');
	});

	it('falls back to the raw key for alpha grouping', () => {
		expect(groupLabel('Z', 'alpha', URGENCY_DAYS)).toBe('Z');
	});
});

describe('groupOrder', () => {
	it('orders priority groups by severity, with "__none__" last', () => {
		expect(['__none__', '🔺', '🔽'].sort(groupOrder('priority'))).toEqual(['🔺', '🔽', '__none__']);
	});

	it('orders dueDate buckets chronologically', () => {
		expect(['__nodate__', '__soon__', '__overdue__'].sort(groupOrder('dueDate')))
			.toEqual(['__overdue__', '__soon__', '__nodate__']);
	});

	it('orders alpha groups alphabetically', () => {
		expect(['B', 'A', 'C'].sort(groupOrder('alpha'))).toEqual(['A', 'B', 'C']);
	});
});

// ---------------------------------------------------------------------------
// dueBucket
// ---------------------------------------------------------------------------

describe('dueBucket', () => {
	it('returns "__nodate__" when there is no due date', () => {
		expect(dueBucket(makeMatrixTask({ dueDate: undefined }), URGENCY_DAYS)).toBe('__nodate__');
	});

	it('returns "__overdue__" for a date in the past', () => {
		expect(dueBucket(makeMatrixTask({ dueDate: daysFromToday(-3) }), URGENCY_DAYS)).toBe('__overdue__');
	});

	it('returns "__soon__" from today up to the urgency threshold', () => {
		for (const d of [0, 1, 3]) {
			expect(dueBucket(makeMatrixTask({ dueDate: daysFromToday(d) }), URGENCY_DAYS)).toBe('__soon__');
		}
	});

	it('returns "__later__" past the threshold', () => {
		for (const d of [4, 14, 30]) {
			expect(dueBucket(makeMatrixTask({ dueDate: daysFromToday(d) }), URGENCY_DAYS)).toBe('__later__');
		}
	});

	it('does not depend on the weekday: a task due tomorrow is always "__soon__"', () => {
		// The windows are rolling from today, never anchored to a calendar week.
		expect(dueBucket(makeMatrixTask({ dueDate: daysFromToday(1) }), URGENCY_DAYS)).toBe('__soon__');
	});
});

// ---------------------------------------------------------------------------
// Timezone regression (issue #25) — a date parsed from a string is bucketed by
// its calendar day, not shifted by the UTC/local mismatch.
// ---------------------------------------------------------------------------

describe('dueBucket — timezone regression (#25)', () => {
	const localToday = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	it("buckets a task due today (parsed from its string date) as '__soon__', never overdue", () => {
		const task = makeMatrixTask({ dueDate: parseIsoDate(localToday()) });
		expect(dueBucket(task, URGENCY_DAYS)).toBe('__soon__');
	});
});
