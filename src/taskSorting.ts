import { MatrixTask } from './matrixClassifier';
import { TaskItem } from './taskScanner';
import { QuadrantSort, SortField } from './settings';
import { TASK_PREFIX_RE } from './tasksFormat';
import { daysBetween } from './dateUtils';
import { t } from './i18n';

/** Priority signifiers from most to least important; anything else sorts last. */
export const PRIORITY_ORDER = ['🔺', '⏫', '🔼', '🔽', '⏬'];

/** Strips the checkbox prefix so titles compare/group on their actual text. */
function taskText(task: TaskItem): string {
	return task.line.replace(TASK_PREFIX_RE, '');
}

/** A comparator for a single sort field (used as primary or secondary key). */
export function compareFn(field: SortField): (a: MatrixTask, b: MatrixTask) => number {
	switch (field) {
		case 'priority':
			return (a, b) => {
				const ai = a.priority ? PRIORITY_ORDER.indexOf(a.priority) : 99;
				const bi = b.priority ? PRIORITY_ORDER.indexOf(b.priority) : 99;
				return ai - bi;
			};
		case 'dueDate':
			return (a, b) => {
				if (!a.dueDate && !b.dueDate) return 0;
				if (!a.dueDate) return 1;
				if (!b.dueDate) return -1;
				return a.dueDate.getTime() - b.dueDate.getTime();
			};
		case 'alpha':
			return (a, b) => taskText(a).toLowerCase().localeCompare(taskText(b).toLowerCase());
	}
}

/** Sorts by the primary field, breaking ties with the secondary. Pure (copies input). */
export function sortTasks(tasks: MatrixTask[], sort: QuadrantSort): MatrixTask[] {
	const fns = [compareFn(sort.primary), compareFn(sort.secondary)];
	return [...tasks].sort((a, b) => {
		for (const fn of fns) {
			const r = fn(a, b);
			if (r !== 0) return r;
		}
		return 0;
	});
}

/**
 * Every bucket `dueBucket` can return. Exported so the date filter is forced to
 * cover all of them: typing this as a plain string once let a bucket fall
 * through the filter, hiding those tasks with no way to get them back.
 */
export type DueBucket = '__overdue__' | '__soon__' | '__later__' | '__nodate__';

/** Bucket order, from most to least pressing. Shared by the filter and the grouping. */
export const DUE_BUCKETS: DueBucket[] = ['__overdue__', '__soon__', '__later__', '__nodate__'];

/**
 * The due-date bucket a task falls into. Three horizons, cut at the same
 * urgency threshold that classifies the matrix: overdue, due within the
 * threshold (today included), and later. Shared by the date filter and the
 * dueDate grouping, so both stay in sync with each other and with the axes.
 */
export function dueBucket(task: TaskItem, urgencyDays: number): DueBucket {
	if (!task.dueDate) return '__nodate__';
	const diff = daysBetween(new Date(), task.dueDate);
	if (diff < 0) return '__overdue__';
	if (diff <= urgencyDays) return '__soon__';
	return '__later__';
}

/** The grouping key for a task under a given field. */
export function groupKey(task: MatrixTask, field: SortField, urgencyDays: number): string {
	switch (field) {
		case 'priority':
			return task.priority ?? '__none__';
		case 'dueDate':
			return dueBucket(task, urgencyDays);
		case 'alpha':
			return taskText(task).trim().charAt(0).toUpperCase() || '#';
	}
}

/** The human-readable label for a due bucket. */
export function dueBucketLabel(bucket: DueBucket, urgencyDays: number): string {
	const g = t().groups;
	switch (bucket) {
		case '__overdue__': return String(g.overdue);
		case '__soon__':    return String(g.soon).replace('{days}', String(urgencyDays));
		case '__later__':   return String(g.later);
		case '__nodate__':  return String(g.noDate);
	}
}

/** The human-readable label for a group key. */
export function groupLabel(key: string, field: SortField, urgencyDays: number): string {
	if (field === 'priority') {
		return key === '__none__' ? String(t().groups.noPriority) : key;
	}
	if (field === 'dueDate') {
		return DUE_BUCKETS.includes(key as DueBucket) ? dueBucketLabel(key as DueBucket, urgencyDays) : key;
	}
	return key;
}

/** A comparator that orders group keys sensibly for the given field. */
export function groupOrder(field: SortField): (a: string, b: string) => number {
	if (field === 'priority') {
		const order = [...PRIORITY_ORDER, '__none__'];
		return (a, b) => order.indexOf(a) - order.indexOf(b);
	}
	if (field === 'dueDate') {
		const order: string[] = DUE_BUCKETS;
		return (a, b) => order.indexOf(a) - order.indexOf(b);
	}
	return (a, b) => a.localeCompare(b);
}
