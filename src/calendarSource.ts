/**
 * The bridge into the Calendar plugin's month grid.
 *
 * Calendar (liamcain/obsidian-calendar-plugin) builds each day cell from a list
 * of "sources", and on opening its view it hands that very array out:
 *
 *     const sources = [customTagsSource, streakSource, wordCountSource, tasksSource];
 *     this.app.workspace.trigger("calendar:open", sources);
 *
 * A plugin that listens for `calendar:open` can push its own source in, which is
 * the supported way to put something on those cells — no DOM of theirs is
 * touched. Calendar's own four sources all start by looking up the daily note
 * for the date and say nothing about a day with no note. This one ignores daily
 * notes entirely and answers from the matrix instead: what is due that day, and
 * what was written in a progress log that day.
 *
 * The contract, read off their bundle rather than guessed:
 * - `dots[]` renders as `<svg class="dot filled ${className}">` (or `hollow`),
 *   so only `className` reaches the DOM — a dot's `color` field is never read,
 *   and the colours come from this plugin's own stylesheet.
 * - `classes[]` is joined into the cell's own `class="day ${...}"`.
 * - `dataAttributes{}` is set on the cell as-is.
 * - `getWeeklyMetadata` is called without a guard when week numbers are shown,
 *   so it must exist even though this plugin has nothing weekly to say.
 */
import { FocusFirstSettings } from './settings';
import { TaskItem, isHiddenTask } from './taskScanner';
import { classifyTasks, Quadrant } from './matrixClassifier';
import { formatIsoDate, parseIsoDate, daysBetween } from './dateUtils';

/** The shape Calendar hands to a source: a moment, of which only `format` is used. */
export interface CalendarDate {
	format(fmt: string): string;
}

export interface CalendarDot {
	/** Never rendered by Calendar; kept because their own sources all set it. */
	color: string;
	className: string;
	isFilled: boolean;
}

export interface CalendarDayMetadata {
	classes: string[];
	dataAttributes: Record<string, string>;
	dots: CalendarDot[];
}

export interface CalendarSource {
	getDailyMetadata(date: CalendarDate): Promise<CalendarDayMetadata>;
	getWeeklyMetadata(date: CalendarDate): Promise<CalendarDayMetadata>;
}

/** What the matrix knows about one calendar day. */
export interface DayFacts {
	/** Open tasks due that day, in quadrant order. */
	due: { quadrant: Quadrant; overdue: boolean }[];
	/** Progress entries written that day. */
	progress: { alert: boolean }[];
}

export type DayIndex = Map<string, DayFacts>;

const EMPTY: DayFacts = { due: [], progress: [] };

function factsFor(index: DayIndex, iso: string): DayFacts {
	let facts = index.get(iso);
	if (!facts) {
		facts = { due: [], progress: [] };
		index.set(iso, facts);
	}
	return facts;
}

/**
 * Buckets every task and progress entry by calendar day, once per scan. Calendar
 * asks a source about each visible day separately — about fifty calls per tick —
 * so the work happens here and each call is then a map lookup.
 *
 * Hidden and completed tasks stay out, exactly as they do in the matrix: a day
 * cell should agree with what the matrix shows, or the dot is a lie.
 */
export function buildDayIndex(
	tasks: TaskItem[],
	settings: FocusFirstSettings,
	now: Date = new Date(),
): DayIndex {
	const index: DayIndex = new Map();
	const visible = tasks.filter((task) => !isHiddenTask(task, settings));

	// classifyTasks drops completed tasks itself and is the single source of
	// truth for which quadrant a task sits in, so the dot's colour can never
	// disagree with the matrix.
	const quadrants = classifyTasks(visible, settings);
	for (const quadrant of ['do', 'schedule', 'delegate', 'eliminate'] as Quadrant[]) {
		for (const task of quadrants[quadrant]) {
			if (!task.dueDate) continue;
			factsFor(index, formatIsoDate(task.dueDate)).due.push({
				quadrant,
				overdue: daysBetween(task.dueDate, now) > 0,
			});
		}
	}

	// Progress entries, including those of completed tasks: finishing something
	// does not erase the days it was worked on. Two tasks pointing at one home
	// note would otherwise count its log twice, so entries are keyed by where
	// they actually live.
	const seen = new Set<string>();
	for (const task of visible) {
		const path = task.homeNote?.path ?? task.file.path;
		for (const entry of task.progress) {
			if (!entry.date) continue;
			const key = `${path}::${entry.lineNumber}`;
			if (seen.has(key)) continue;
			seen.add(key);
			factsFor(index, formatIsoDate(entry.date)).progress.push({ alert: entry.alert });
		}
	}

	return index;
}

function emptyMetadata(): CalendarDayMetadata {
	return { classes: [], dataAttributes: {}, dots: [] };
}

/**
 * The dots and classes for one day. Due tasks come first and are filled, in the
 * quadrant's colour; progress entries follow as hollow dots, the way a notebook
 * margin marks "something happened here" rather than "something is owed here".
 * The list is capped so a heavy day cannot burst the cell — the honest total
 * stays readable on the cell as a data attribute.
 */
export function dayMetadata(index: DayIndex, iso: string, settings: FocusFirstSettings): CalendarDayMetadata {
	const meta = emptyMetadata();
	const facts = index.get(iso) ?? EMPTY;
	const showDue = settings.calendar.showDue;
	const showProgress = settings.calendar.showProgress;

	const due = showDue ? facts.due : [];
	const progress = showProgress ? facts.progress : [];
	if (due.length === 0 && progress.length === 0) return meta;

	const max = Math.max(1, settings.calendar.maxDots);
	for (const item of due) {
		if (meta.dots.length >= max) break;
		meta.dots.push({
			color: 'default',
			className: `ff-dot ff-dot-due ff-dot-${item.quadrant}${item.overdue ? ' ff-dot-overdue' : ''}`,
			isFilled: true,
		});
	}
	for (const item of progress) {
		if (meta.dots.length >= max) break;
		meta.dots.push({
			color: 'default',
			className: `ff-dot ff-dot-progress${item.alert ? ' ff-dot-alert' : ''}`,
			isFilled: false,
		});
	}

	if (due.length > 0) meta.classes.push('ff-has-due');
	if (due.some((item) => item.overdue)) meta.classes.push('ff-has-overdue');
	if (progress.length > 0) meta.classes.push('ff-has-progress');
	if (progress.some((item) => item.alert)) meta.classes.push('ff-has-alert');

	if (due.length > 0) meta.dataAttributes['data-ff-due'] = String(due.length);
	if (progress.length > 0) meta.dataAttributes['data-ff-progress'] = String(progress.length);

	return meta;
}

/** The seven ISO days of the week starting at `iso`, as Calendar hands us its first day. */
export function weekDays(iso: string): string[] {
	const start = parseIsoDate(iso);
	if (!start) return [];
	const days: string[] = [];
	for (let i = 0; i < 7; i++) {
		days.push(formatIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
	}
	return days;
}

/**
 * The week strip beside the grid. It only carries the week's classes, not its
 * dots: seven days of dots in one narrow cell says nothing.
 */
export function weekMetadata(index: DayIndex, iso: string, settings: FocusFirstSettings): CalendarDayMetadata {
	const meta = emptyMetadata();
	const classes = new Set<string>();
	let due = 0;
	let progress = 0;
	for (const day of weekDays(iso)) {
		const dayMeta = dayMetadata(index, day, settings);
		for (const cls of dayMeta.classes) classes.add(cls);
		due += Number(dayMeta.dataAttributes['data-ff-due'] ?? 0);
		progress += Number(dayMeta.dataAttributes['data-ff-progress'] ?? 0);
	}
	meta.classes = [...classes];
	if (due > 0) meta.dataAttributes['data-ff-due'] = String(due);
	if (progress > 0) meta.dataAttributes['data-ff-progress'] = String(progress);
	return meta;
}

/**
 * The source handed to Calendar. It holds the index behind one shared promise so
 * that a tick's ~50 calls scan the vault once, and drops it whenever the tasks
 * may have changed.
 */
export class FocusFirstCalendarSource implements CalendarSource {
	private index: Promise<DayIndex> | null = null;

	constructor(
		private readonly scan: () => Promise<TaskItem[]>,
		private readonly getSettings: () => FocusFirstSettings,
	) {}

	/** Forgets the cached index; the next cell asked rebuilds it. */
	invalidate(): void {
		this.index = null;
	}

	private ensureIndex(): Promise<DayIndex> {
		if (!this.index) {
			const settings = this.getSettings();
			// Cache the promise, not its result, so concurrent cells share one scan.
			this.index = this.scan()
				.then((tasks) => buildDayIndex(tasks, settings))
				.catch(() => new Map<string, DayFacts>());
		}
		return this.index;
	}

	async getDailyMetadata(date: CalendarDate): Promise<CalendarDayMetadata> {
		const settings = this.getSettings();
		if (!settings.calendar.enabled) return emptyMetadata();
		return dayMetadata(await this.ensureIndex(), date.format('YYYY-MM-DD'), settings);
	}

	async getWeeklyMetadata(date: CalendarDate): Promise<CalendarDayMetadata> {
		const settings = this.getSettings();
		if (!settings.calendar.enabled) return emptyMetadata();
		return weekMetadata(await this.ensureIndex(), date.format('YYYY-MM-DD'), settings);
	}
}
