import { moveBoardTask } from './workBoard';
import { App, TFile, Menu, setIcon, Platform, Notice } from 'obsidian';
import { MatrixTask, ClassificationReason, explainTask } from './matrixClassifier';
import { TaskItem } from './taskScanner';
import { FocusFirstSettings, Priority, TaskSize, sizeTagList } from './settings';
import { getTasksApi } from './tasksPlugin';
import { setDueDate, clearDueDate, setPriority, addDaysToIso, setSize, taskTitle } from './tasksFormat';
import { DueDateModal } from './dueDateModal';
import { EditSnapshot, showUndoNotice } from './undo';
import { formatIsoDate } from './dateUtils';
import { openFile, openFileAtLine } from './noteNavigation';
import { latestEntry } from './progressLog';
import { ProgressModal, isStale, lastNoteText } from './progressModal';
import { t } from './i18n';

export { taskTitle } from './tasksFormat';

/** Runs a mutating action and, if it changed anything, shows an undo toast (#32). */
function undoable(app: App, label: string, edit: Promise<EditSnapshot | undefined>): void {
	void edit.then((snap) => showUndoNotice(app, label, snap)).catch((error: Error) => { new Notice(error.message); });
}

/**
 * Shared task-item rendering and the vault-mutating helpers behind its action
 * buttons. Kept separate from FocusFirstView so the rendering only needs
 * `app` + `settings` rather than the view/leaf.
 */

/** The five Tasks-plugin priorities with their localised labels, in order. */
function priorityOptions(): { emoji: Priority; label: string }[] {
	const a = t().view.actions;
	return [
		{ emoji: '🔺', label: String(a.priorityHighest) },
		{ emoji: '⏫', label: String(a.priorityHigh) },
		{ emoji: '🔼', label: String(a.priorityMedium) },
		{ emoji: '🔽', label: String(a.priorityLow) },
		{ emoji: '⏬', label: String(a.priorityLowest) },
	];
}

export function makeTaskDraggable(li: HTMLElement, task: MatrixTask): void {
	li.draggable = true;
	li.addEventListener('dragstart', (e) => {
		e.dataTransfer?.setData('application/json', JSON.stringify({
			filePath: task.file.path,
			lineNumber: task.lineNumber,
			quadrant: task.quadrant,
			line: task.line,
		}));
		li.classList.add('is-dragging');
	});
	li.addEventListener('dragend', () => {
		li.classList.remove('is-dragging');
	});
}

/** Opens the task's note with the cursor on its line. */
export async function openTaskFile(app: App, task: TaskItem): Promise<void> {
	await openFileAtLine(app, task.file, task.lineNumber);
}

/**
 * Removes every occurrence of a tag (together with its leading whitespace) from
 * a line, case-insensitively, leaving the rest of the line's whitespace — in
 * particular any leading indentation of nested tasks — untouched.
 */
export function removeTagFromLine(line: string, tag: string): string {
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return line.replace(new RegExp(`\\s*${escaped}(?=\\s|$)`, 'gi'), '');
}

// The date signifiers a created date (➕) sorts before, per the Tasks plugin's
// canonical order (start, scheduled, due, cancelled, done).
const DATE_SIGNIFIER_RE = /[🛫⏳📅❌✅]/u;

/** Appends `tag` to a line unless it's already present (case-insensitive). */
function addTagToLine(line: string, tag: string): string {
	const has = line.split(/\s+/).some((token) => token.toLowerCase() === tag.toLowerCase());
	return has ? line : `${line.replace(/[ \t]+$/, '')} ${tag}`;
}

/**
 * Adds a `➕ <today>` created date to a task line, matching what the Tasks plugin
 * writes on a newly generated recurrence instance. No-op if the line already has
 * a created date. Placed before the first other date signifier (canonical order)
 * so it reads like a native Tasks line; indentation is preserved.
 */
function withCreatedDate(line: string, today: string): string {
	if (line.includes('➕')) return line;
	const created = `➕ ${today}`;
	const match = DATE_SIGNIFIER_RE.exec(line);
	if (match) {
		return `${line.slice(0, match.index)}${created} ${line.slice(match.index)}`;
	}
	return `${line.trimEnd()} ${created}`;
}

export async function completeTaskLine(
	app: App,
	filePath: string,
	lineNumber: number,
	now: Date = new Date(),
	expectedLine?: string,
): Promise<EditSnapshot | undefined> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;
	const content = await app.vault.read(file);
	const lines = content.split('\n');
	const line = lines[lineNumber];
	if (line === undefined) return;
	// Guard against a stale line number: if the note shifted since the view was
	// scanned, this line no longer matches the task the user acted on (#27).
	if (expectedLine !== undefined && line !== expectedLine) return;

	// Delegate to the Tasks plugin when it's available: it applies the user's
	// done-date/status settings and, for recurring (🔁) tasks, generates the next
	// occurrence. The result can be multiple lines. Without the plugin, 🔁 has no
	// engine anyway — just flip the checkbox as before.
	const flip = () => line.replace(/\[\s\]/, '[x]');
	const api = getTasksApi(app);
	let after: string[];
	if (api) {
		const raw = api.executeToggleTaskDoneCommand(line, filePath);
		// A blank result would splice an empty line in place of the task (#28);
		// fall back to a plain checkbox flip instead.
		if (raw.trim() === '') {
			after = [flip()];
		} else {
			const today = formatIsoDate(now);
			// The newly generated next occurrence is the still-open `[ ]` line; give
			// it a created date like the Tasks plugin does. The completed line stays.
			after = raw.split('\n').map((l) => (/^\s*[-*+] \[ \]/.test(l) ? withCreatedDate(l, today) : l));
		}
	} else {
		after = [flip()];
	}
	lines.splice(lineNumber, 1, ...after);
	await app.vault.modify(file, lines.join('\n'));
	return { filePath, startLine: lineNumber, before: [line], after };
}

/**
 * Reads a file, applies `transform` to a single task line, and writes it back —
 * the shared read-modify-write behind the inline task edits. Skips the write if
 * the transform leaves the line unchanged.
 */
export async function updateTaskLine(
	app: App,
	filePath: string,
	lineNumber: number,
	transform: (line: string) => string,
	expectedLine?: string,
): Promise<EditSnapshot | undefined> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;
	const content = await app.vault.read(file);
	const lines = content.split('\n');
	const line = lines[lineNumber];
	if (line === undefined) return;
	// Stale-line guard (#27): bail if the line no longer matches the acted-on task.
	if (expectedLine !== undefined && line !== expectedLine) return;
	const next = transform(line);
	if (next === line) return;
	lines[lineNumber] = next;
	await app.vault.modify(file, lines.join('\n'));
	return { filePath, startLine: lineNumber, before: [line], after: [next] };
}

export async function toggleFocusTagLine(
	app: App,
	settings: FocusFirstSettings,
	filePath: string,
	lineNumber: number,
	focusTag: string,
	add: boolean,
	expectedLine?: string,
): Promise<EditSnapshot | undefined> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;
	const line = (await app.vault.read(file)).split('\n')[lineNumber];
	if (line === undefined || (expectedLine !== undefined && line !== expectedLine)) return;
	return moveBoardTask(app, settings, { file, lineNumber, line }, add ? 'focus' : 'work');
}

/**
 * Renders one interactive task row: the title (a click opens the task's page
 * with its progress log) and, when the task has a log, its latest entry on a
 * second line. Hovering a row reveals a floating popover with its metadata and
 * actions, which disappears when the pointer leaves — so the list stays calm
 * and never reflows. Identical markup for the matrix, the focus section, and
 * the embedded code block. Returns the created <li> so callers can wire extra
 * behaviour (e.g. the focus reorder drop target).
 */
export function renderTaskItem(
	parent: HTMLElement,
	task: MatrixTask,
	app: App,
	settings: FocusFirstSettings,
	opts: { suppressWhyHere?: boolean; position?: number; boardMode?: boolean; onToggleFocus?: () => void } = {},
): HTMLElement {
	const focusTag = settings.focusTag.trim().toLowerCase();
	const isFocused = focusTag
		? task.tags.some((tag) => tag.toLowerCase() === focusTag)
		: false;
	// Computed once and reused for both the pin badge/reset action and the "why
	// here" row, so they can never drift out of sync (#66).
	const reason = explainTask(task, settings);
	const hideTag = settings.hideTag.trim().toLowerCase();
	const li = parent.createEl('li', {
		cls: `focus-first-task-item${isFocused ? ' is-focused' : ''}`,
	});
	makeTaskDraggable(li, task);

	const text = taskTitle(task.line);

	// Position number for the ordered focus shortlist (#34); #1 is the "frog".
	if (opts.position !== undefined) {
		li.createSpan({ text: `${opts.position}.`, cls: 'focus-first-task-position' });
	}

	// The project title opens its detailed note; Progress stays one click away.
	const openProgress = (e: Event) => { e.stopPropagation(); new ProgressModal(app, task, settings).open(); };
	const openPage = (e: Event) => {
		e.stopPropagation();
		if (task.homeNote) void openFile(app, task.homeNote);
		else new ProgressModal(app, task, settings).open();
	};
	if (!Platform.isMobile) li.addEventListener('click', openPage);
	const titleEl = li.createSpan({ text, cls: 'focus-first-task-text' });
	titleEl.addEventListener('click', openPage);

	// A task with a home note shows a small link to it: one click opens the note
	// itself. The note is where its relations
	// live, so it deserves a direct door.
	const home = task.homeNote;
	if (home) {
		const homeEl = li.createSpan({ cls: 'focus-first-task-home' });
		setIcon(homeEl, 'file-text');
		homeEl.setAttribute('aria-label', String(t().progress.openHome).replace('{name}', home.basename));
		homeEl.addEventListener('click', (e) => { e.stopPropagation(); void openFile(app, home); });
	}

	// A manual quadrant tag pins the task, always visible (not just on hover) so
	// the override is never a surprise (#66). The "why" text is reused as the
	// tooltip, so the explanation can't drift from the one in the detail popover.
	if (reason.override && !opts.boardMode) {
		const pinEl = li.createSpan({ cls: 'focus-first-pin-badge' });
		setIcon(pinEl, 'pin');
		pinEl.setAttribute('aria-label', classificationReasonText(reason, settings));
	}

	// Mobile has no hover: the collapsed row shows only the title plus a chevron
	// affordance. A tap expands the full details/actions (due date, priority,
	// size, tags, source, and the action buttons) in place below.
	if (Platform.isMobile) {
		setIcon(li.createSpan({ cls: 'focus-first-expand-chevron' }), 'chevron-down');
		li.addEventListener('click', () => { li.classList.toggle('is-expanded'); });
	}

	// The actions sit on the card itself, at the right end of the title row —
	// faint until the pointer is over the card, so the matrix stays calm but
	// nothing has to be hunted for in a popover. On mobile, where there is no
	// hover, they stay inside the tap-to-expand details below.
	const progressBtn = li.createEl('button', { text: 'Progress', cls: 'pftf-card-progress', attr: { 'aria-label': `记录 ${text} 的计划或进展` } });
	progressBtn.addEventListener('click', openProgress);
	const cardActions = Platform.isMobile ? undefined : li.createDiv({ cls: 'focus-first-task-actions' });


	renderLatestNote(li, task, settings)?.addEventListener('click', openProgress);

	// Detail popover — the task metadata as aligned label/value rows (so it's calm
	// and easy to scan). The title isn't repeated here (it's right there in the
	// list). Hidden until the row is hovered; showTaskDetail floats it next to
	// the row.
	const detail = li.createDiv({ cls: 'focus-first-task-detail' });
	const actions = cardActions ?? detail.createDiv({ cls: 'focus-first-task-actions' });

	const meta = detail.createDiv({ cls: 'focus-first-task-meta' });
	const labels = t().view.detail;
	const priorityNames: Record<string, string> = Object.fromEntries(
		priorityOptions().map((o) => [o.emoji, o.label]),
	);
	// Label + value are appended straight into the grid (grid-template-columns:
	// auto 1fr places them in the two columns), so no row wrapper is needed.
	const addRow = (label: string, build: (value: HTMLElement) => void): void => {
		meta.createDiv({ cls: 'focus-first-detail-label', text: label });
		build(meta.createDiv({ cls: 'focus-first-detail-value' }));
	};
	// Why-here reason first, so the automatic classification is transparent
	// (unless the user turned it off, or this is a focus task — a focus task is
	// here because of the #focus tag, not the quadrant logic, so the reason is
	// irrelevant there regardless of the setting, issue #31).
	if (settings.showWhyHere && !opts.suppressWhyHere) {
		addRow(String(labels.why), (v) => {
			v.setText(classificationReasonText(reason, settings));
			v.addClass('focus-first-detail-why');
		});
	}
	const priority = task.priority;
	if (priority) addRow(String(labels.priority), (v) => v.setText(priorityNames[priority] ?? priority));
	if (task.size) addRow(String(labels.size), (v) => v.setText(sizeLabel(task.size!)));
	if (task.dueDate) {
		const due = task.dueDate;
		addRow(String(labels.due), (v) => { v.setText(due.toLocaleDateString()); v.addClass('focus-first-task-due'); });
	}
	if (task.tags.length > 0) {
		addRow(String(labels.tags), (v) => {
			v.addClass('focus-first-task-tags');
			for (const tag of task.tags) v.createSpan({ text: tag, cls: 'focus-first-task-tag' });
		});
	}
	addRow(String(labels.note), (v) => { v.setText(task.file.basename); v.addClass('focus-first-task-source'); });

	const focusRun = opts.onToggleFocus ?? (focusTag
		? () => undoable(
			app,
			String(isFocused ? t().view.undoLabels.unfocused : t().view.undoLabels.focused),
			toggleFocusTagLine(app, settings, task.file.path, task.lineNumber, focusTag, !isFocused, task.line),
		)
		: null);

	const doneBtn = actionButton(actions, 'check', String(t().view.focusDone), 'focus-first-done-btn');
	doneBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		undoable(app, String(t().view.undoLabels.completed),
			completeTaskLine(app, task.file.path, task.lineNumber, undefined, task.line));
	});

	if (focusRun) {
		const focusBtn = actionButton(actions, 'star',
			String(isFocused ? t().view.focusRemove : t().view.focusAdd),
			`focus-first-focus-btn${isFocused ? ' is-active' : ''}`);
		focusBtn.addEventListener('click', (e) => { e.stopPropagation(); focusRun(); });
	}
	if (reason.override && !opts.boardMode) {
		const tag = settings.quadrants[reason.override].tag.trim();
		const unpinBtn = actionButton(actions, 'pin-off', String(t().view.unpinTask), 'focus-first-unpin-btn');
		unpinBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			undoable(app, String(t().view.undoLabels.unpinned),
				updateTaskLine(app, task.file.path, task.lineNumber, (line) => removeTagFromLine(line, tag), task.line));
		});
	}
	if (!opts.boardMode) {
		const postponeBtn = actionButton(actions, 'calendar-clock', String(t().view.actions.postpone), 'focus-first-postpone-btn');
		postponeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const menu = new Menu();
			buildPostponeMenu(menu, task, app);
			menu.showAtMouseEvent(e);
		});

		const priorityBtn = actionButton(actions, 'flag', String(t().view.actions.priority), 'focus-first-priority-btn');
		priorityBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const menu = new Menu();
			buildPriorityMenu(menu, task, app);
			menu.showAtMouseEvent(e);
		});

		const openBtn = actionButton(actions, 'file-text', String(t().view.actions.openNote), 'focus-first-open-btn');
		openBtn.addEventListener('click', (e) => { e.stopPropagation(); void openTaskFile(app, task); });
	}

	// Board cards keep the direct actions compact; date, priority and note access
	// join size and hide in the more menu. Other views keep their existing buttons.
	const hasSize = sizeTagList(settings).length > 0;
	if (opts.boardMode || hasSize || hideTag) {
		const moreBtn = actionButton(actions, 'ellipsis', String(t().view.actions.more), 'focus-first-more-btn');
		moreBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const menu = new Menu();
			if (opts.boardMode) {
				menu.addItem((item) => item.setTitle(String(t().view.actions.openNote)).setIcon('file-text')
					.onClick(() => { void openTaskFile(app, task); }));
				menu.addSeparator();
				buildPostponeMenu(menu, task, app);
				menu.addSeparator();
				buildPriorityMenu(menu, task, app);
				if (hasSize || hideTag) menu.addSeparator();
			}
			if (hasSize) buildSizeMenu(menu, task, app, settings);
			if (hasSize && hideTag) menu.addSeparator();
			if (hideTag) {
				const tag = settings.hideTag.trim();
				menu.addItem((item) => item.setTitle(String(t().view.hideTask)).setIcon('eye-off')
					.onClick(() => undoable(app, String(t().view.undoLabels.hidden),
						updateTaskLine(app, task.file.path, task.lineNumber, (line) => addTagToLine(line, tag), task.line))));
			}
			menu.showAtMouseEvent(e);
		});
	}

	// Desktop only: reveal the popover on hover. An open delay means it only
	// appears when you actually rest on a row (so it doesn't flicker while you scan
	// the list). A short hide delay plus the popover's own hover form a bridge so
	// you can move from the row into the popover to use its buttons. On mobile this
	// is skipped entirely — touch fires synthetic mouse events that would move the
	// detail to the view root and defeat the tap-to-expand handled above.
	if (!Platform.isMobile) wireDetailHover(li, detail);

	return li;
}

/**
 * The card's second line: the task's most recent log entry, so the matrix reads
 * like a notebook page — what happened last, at a glance. An alert (⚠) reads
 * red; an entry older than the stale threshold reads amber. A task without a
 * log adds nothing, so untouched cards look exactly as they always did.
 */
function renderLatestNote(li: HTMLElement, task: TaskItem, settings: FocusFirstSettings): HTMLElement | undefined {
	const latest = latestEntry(task.progress);
	if (!latest) return undefined;
	const cls = ['focus-first-task-latest'];
	if (latest.alert) cls.push('is-alert');
	if (isStale(latest, settings.staleDays)) cls.push('is-stale');
	const row = li.createDiv({ cls: cls.join(' ') });
	setIcon(row.createSpan({ cls: 'focus-first-task-latest-icon' }), latest.alert ? 'alert-triangle' : 'corner-down-right');
	if (latest.date) row.createSpan({ text: formatIsoDate(latest.date).slice(5), cls: 'focus-first-task-latest-date' });
	row.createSpan({ text: latest.text, cls: 'focus-first-task-latest-text' });
	row.setAttribute('title', lastNoteText(latest));
	return row;
}

/**
 * Wires the desktop hover-reveal for a floating detail popover: open on hover
 * after a short delay, hide on leave after a shorter one, with a bridge so the
 * pointer can travel from the row into the popover without it closing. Shared by
 * the matrix rows and the triage rows, so both hover identically.
 */
export function wireDetailHover(li: HTMLElement, detail: HTMLElement): void {
	let hideTimer = 0;
	let showTimer = 0;
	let mouseX = 0;
	let mouseY = 0;
	const scheduleHide = () => {
		window.clearTimeout(showTimer);
		window.clearTimeout(hideTimer);
		hideTimer = window.setTimeout(() => hideTaskDetail(detail), 150);
	};
	const scheduleReveal = (e: MouseEvent) => {
		mouseX = e.clientX;
		mouseY = e.clientY;
		window.clearTimeout(hideTimer);
		window.clearTimeout(showTimer);
		showTimer = window.setTimeout(() => showTaskDetail(li, detail, mouseX, mouseY), 400);
	};
	li.addEventListener('mouseenter', scheduleReveal);
	li.addEventListener('mousemove', (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; });
	li.addEventListener('mouseleave', scheduleHide);
	detail.addEventListener('mouseenter', () => { window.clearTimeout(hideTimer); });
	detail.addEventListener('mouseleave', scheduleHide);
}

/**
 * One-line, localised reason a task sits in its quadrant, built from the same
 * classification logic (explainTask) so the explanation never drifts from the
 * placement. A manual quadrant tag short-circuits to an override message.
 */
function classificationReasonText(r: ClassificationReason, settings: FocusFirstSettings): string {
	const d = t().view.detail;
	if (r.mode === 'valueEffort') return valueEffortReasonText(r, settings);
	if (r.override) {
		const tag = settings.quadrants[r.override].tag.trim();
		return String(d.whyOverride).replace('{tag}', tag);
	}
	const threshold = String(settings.urgencyDays);
	const days = r.daysUntilDue ?? 0;
	let urgencyText: string;
	switch (r.urgencyCause) {
		case 'overdue':          urgencyText = String(d.causeOverdue).replace('{days}', String(Math.abs(days))); break;
		case 'due-today':        urgencyText = String(d.causeToday); break;
		case 'within-threshold': urgencyText = String(d.causeWithin).replace('{days}', String(days)).replace('{threshold}', threshold); break;
		case 'beyond-threshold': urgencyText = String(d.causeBeyond).replace('{days}', String(days)).replace('{threshold}', threshold); break;
		default:                 urgencyText = String(d.causeNoDue); break;
	}
	let importanceText: string;
	if (r.important) importanceText = String(d.causePriority).replace('{priority}', r.priority ?? '');
	else if (r.priority) importanceText = String(d.causePriorityNotImportant).replace('{priority}', r.priority);
	else importanceText = String(d.causeNoPriority);
	const urgentPrefix = String(r.urgent ? d.whyUrgent : d.whyNotUrgent);
	const importantPrefix = String(r.important ? d.whyImportant : d.whyNotImportant);
	return `${urgentPrefix}: ${urgencyText} · ${importantPrefix}: ${importanceText}`;
}

/** The "why here" line for the Value/Effort matrix, built from the same explain logic. */
function valueEffortReasonText(r: ClassificationReason, settings: FocusFirstSettings): string {
	const d = t().view.detail;
	let valueText: string;
	switch (r.valueCause) {
		case 'tag-high': valueText = settings.highValueTag.trim(); break;
		case 'tag-low':  valueText = settings.lowValueTag.trim(); break;
		case 'no-tag':   valueText = String(d.causeValueNoTag).replace('{tag}', settings.highValueTag.trim()); break;
		default: // 'priority' — reuse the importance phrasing
			if (r.important) valueText = String(d.causePriority).replace('{priority}', r.priority ?? '');
			else if (r.priority) valueText = String(d.causePriorityNotImportant).replace('{priority}', r.priority);
			else valueText = String(d.causeNoPriority);
			break;
	}
	const effortText = r.size === undefined
		? String(d.causeUnsized)
		: String(d.causeSize).replace('{size}', sizeLabel(r.size));
	const valuePrefix = String(r.highValue ? d.whyHighValue : d.whyLowValue);
	const effortPrefix = String(r.lowEffort ? d.whyLowEffort : d.whyHighEffort);
	return `${valuePrefix}: ${valueText} · ${effortPrefix}: ${effortText}`;
}

/**
 * Shows the detail popover for a row. It's appended to the view root
 * (`.focus-first-view`) and positioned absolutely relative to it, so it floats
 * over the list without pushing rows (no reflow) and — crucially — isn't clipped
 * by the scrolling quadrant (unlike `position: fixed`, which Obsidian's
 * transformed pane ancestors break).
 *
 * It's placed next to the mouse cursor: to the right of it by default, flipping
 * to the left when there's no room on the right; vertically it starts at the
 * cursor and shifts up if it would overflow the bottom. Everything is clamped
 * inside the view. An open delay on the row hover keeps it from flickering while
 * scanning the list. No-op in non-DOM tests.
 */
function showTaskDetail(li: HTMLElement, detail: HTMLElement, mouseX: number, mouseY: number): void {
	if (typeof li.getBoundingClientRect !== 'function') return;
	const root = li.closest('.focus-first-view');
	if (!root) return;
	root.appendChild(detail);
	// The static "shown" styles live in the .is-open CSS class; only the
	// cursor-relative placement is dynamic, so it goes through CSS custom
	// properties (the one escape hatch the styling rules allow).
	detail.classList.add('is-open');
	const rootRect = root.getBoundingClientRect();
	// The root is the scroll surface, so an absolutely positioned child sits in
	// its scrolled content box: add the scroll offset to the viewport maths.
	const scrollX = root.scrollLeft || 0;
	const scrollY = root.scrollTop || 0;
	detail.setCssProps({ '--ff-detail-max-width': `${Math.max(rootRect.width - 16, 160)}px` });
	const width = detail.offsetWidth;
	const height = detail.offsetHeight;
	const gap = 12;
	// Horizontal: right of the cursor, flipping left when it wouldn't fit; then
	// clamp inside the view.
	let left = mouseX + gap;
	if (left + width > rootRect.right) left = mouseX - gap - width;
	left = Math.max(rootRect.left, Math.min(left, rootRect.right - width)) - rootRect.left + scrollX;
	// Vertical: start at the cursor, shift up if it would overflow the bottom.
	let top = mouseY;
	if (top + height > rootRect.bottom) top = rootRect.bottom - height;
	top = Math.max(rootRect.top, top) - rootRect.top + scrollY;
	detail.setCssProps({ '--ff-detail-left': `${left}px`, '--ff-detail-top': `${top}px` });
}

function hideTaskDetail(detail: HTMLElement): void {
	detail.classList.remove('is-open');
	detail.remove();
}

/** Creates one action button (icon + aria-label) in the actions row. */
function actionButton(parent: HTMLElement, icon: string, ariaLabel: string, extraCls = ''): HTMLElement {
	const btn = parent.createEl('button', { cls: `focus-first-task-btn${extraCls ? ` ${extraCls}` : ''}` });
	setIcon(btn, icon);
	btn.setAttribute('aria-label', ariaLabel);
	btn.setAttribute('title', ariaLabel);
	return btn;
}

/**
 * Populates the due-date menu: the two quick moves (tomorrow, a week from
 * today — absolute dates, so a task three weeks overdue lands on tomorrow, not
 * on three weeks ago plus a day), a date picker for anything else, and, when
 * the task has a date, the option to drop it.
 */
function buildPostponeMenu(menu: Menu, task: MatrixTask, app: App): void {
	const a = t().view.actions;
	const edit = (transform: (line: string) => string) =>
		undoable(app, String(t().view.undoLabels.updated),
			updateTaskLine(app, task.file.path, task.lineNumber, transform, task.line));
	const today = formatIsoDate(new Date());
	menu.addItem((item) => item.setTitle(String(a.dueTomorrow)).setIcon('chevron-right')
		.onClick(() => edit((l) => setDueDate(l, addDaysToIso(today, 1)))));
	menu.addItem((item) => item.setTitle(String(a.dueNextWeek)).setIcon('chevrons-right')
		.onClick(() => edit((l) => setDueDate(l, addDaysToIso(today, 7)))));
	menu.addItem((item) => item.setTitle(String(a.pickDate)).setIcon('calendar')
		.onClick(() => {
			const current = task.dueDate ? formatIsoDate(task.dueDate) : undefined;
			new DueDateModal(app, current, (iso) => edit((l) => setDueDate(l, iso))).open();
		}));
	if (task.dueDate) {
		menu.addItem((item) => item.setTitle(String(a.clearDue)).setIcon('calendar-off')
			.onClick(() => edit(clearDueDate)));
	}
}

/** Populates a menu with the priority options for a task. */
function buildPriorityMenu(menu: Menu, task: MatrixTask, app: App): void {
	const options: { emoji: Priority | null; label: string }[] = [
		...priorityOptions(),
		{ emoji: null, label: String(t().view.actions.priorityNone) },
	];
	for (const opt of options) {
		menu.addItem((item) => item
			.setTitle(opt.label)
			.setChecked(task.priority === (opt.emoji ?? undefined))
			.onClick(() => undoable(app, String(t().view.undoLabels.updated),
				updateTaskLine(app, task.file.path, task.lineNumber, (l) => setPriority(l, opt.emoji), task.line))));
	}
}

/** Localised label for a task size. */
export function sizeLabel(size: TaskSize): string {
	const a = t().view.actions;
	return String(size === 'small' ? a.sizeSmall : size === 'medium' ? a.sizeMedium : a.sizeLarge);
}

/** Populates a menu with the size options, writing the matching configured tag. */
function buildSizeMenu(menu: Menu, task: MatrixTask, app: App, settings: FocusFirstSettings): void {
	const allTags = sizeTagList(settings);
	const options: { size: TaskSize | null; tag: string | null; label: string }[] = [
		{ size: 'small', tag: settings.sizeTags.small.trim(), label: sizeLabel('small') },
		{ size: 'medium', tag: settings.sizeTags.medium.trim(), label: sizeLabel('medium') },
		{ size: 'large', tag: settings.sizeTags.large.trim(), label: sizeLabel('large') },
		{ size: null, tag: null, label: String(t().view.actions.sizeNone) },
	];
	for (const opt of options) {
		// Skip a bucket whose tag the user blanked out (nothing to write).
		if (opt.size !== null && !opt.tag) continue;
		menu.addItem((item) => item
			.setTitle(opt.label)
			.setChecked(task.size === (opt.size ?? undefined))
			.onClick(() => undoable(app, String(t().view.undoLabels.updated),
				updateTaskLine(app, task.file.path, task.lineNumber, (l) => setSize(l, opt.tag, allTags), task.line))));
	}
}
