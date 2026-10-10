import { ItemView, WorkspaceLeaf, TFile, setIcon, debounce, Notice, Menu } from 'obsidian';
import FocusFirstPlugin from './main';
import { scanTasks, TaskItem, isHiddenTask } from './taskScanner';
import { Quadrant } from './matrixClassifier';
import { TaskSize, sizeTagList } from './settings';
import { isTasksPluginEnabled } from './tasksPlugin';
import { t } from './i18n';
import { renderTaskItem, taskTitle } from './taskRenderer';
import { TASK_PREFIX_RE } from './tasksFormat';
import { dueBucket, dueBucketLabel, DueBucket, DUE_BUCKETS } from './taskSorting';
import { BoardLane, BOARD_LABELS, boardLane, boardLine, focusCapacity, moveBoardTask, setFocusCapacity } from './workBoard';
import { BoardDragSort } from './boardDragSort';
import { showUndoNotice } from './undo';
import { commitTask, isInboxConfigured } from './quickAdd';

export const FOCUS_FIRST_VIEW_TYPE = 'put-first-things-first-view';

const SIZE_FILTER_OPTIONS: TaskSize[] = ['small', 'medium', 'large'];

/**
 * Builds the stable per-task key behind the manual focus order (#37): file path
 * plus display title, which survives the task moving up or down as the note is
 * edited (a line number would not).
 *
 * Two tasks in one file can share a title, though, and they used to collapse
 * onto one key: dragging either of them moved both, since neither the rank
 * lookup nor the reorder could tell them apart. Repeats therefore get an
 * occurrence suffix, assigned in line order so it stays put when text elsewhere
 * in the note changes. The first occurrence keeps the bare key, so orders saved
 * before this existed keep resolving.
 */
export function focusKeyResolver(tasks: TaskItem[]): (filePath: string, lineNumber: number) => string {
	const byPosition = new Map<string, string>();
	const seen = new Map<string, number>();
	const inLineOrder = [...tasks].sort(
		(a, b) => a.file.path.localeCompare(b.file.path) || a.lineNumber - b.lineNumber,
	);
	for (const task of inLineOrder) {
		const base = `${task.file.path}::${taskTitle(task.line)}`;
		const n = (seen.get(base) ?? 0) + 1;
		seen.set(base, n);
		byPosition.set(`${task.file.path}::${task.lineNumber}`, n === 1 ? base : `${base}::${n}`);
	}
	// Unknown position (a task dragged in from outside the focus list) resolves to
	// '', which reorderFocus rejects because it is not among the shown keys.
	return (filePath, lineNumber) => byPosition.get(`${filePath}::${lineNumber}`) ?? '';
}

/**
 * Caps a task list at the height of its first `rows` task rows (group headers
 * in between included), so a long quadrant shows about that many and scrolls
 * inside itself for the rest — the heading's count stays the honest total. The
 * rows are measured after render, so one-line and two-line cards (with a latest
 * note) both fit exactly. 0 leaves the list uncapped; so does a list that is
 * not laid out (no measurable heights).
 */
export function capListHeight(list: HTMLElement, rows: number): void {
	list.classList.remove('is-capped');
	list.setCssProps({ '--ff-list-max-height': '' });
	if (rows <= 0) return;
	let counted = 0;
	let height = 0;
	for (const child of Array.from(list.children)) {
		const el = child as HTMLElement;
		const h = el.offsetHeight;
		if (!h) return;
		height += h;
		if (el.classList.contains('focus-first-task-item')) counted++;
		if (counted === rows) break;
	}
	if (counted < rows) return; // everything fits: nothing to cap
	if (list.children.length === counted) return; // exactly the limit: no scrollbar needed
	list.classList.add('is-capped');
	list.setCssProps({ '--ff-list-max-height': `${height}px` });
}

export class FocusFirstView extends ItemView {
	private plugin: FocusFirstPlugin;
	private tasks: TaskItem[] = [];
	private searchQuery = '';
	private activeDateFilters = new Set<DueBucket>();
	private activeSizeFilters = new Set<TaskSize>();
	private searchVisible = false;
	private debouncedRefresh = debounce(() => this.refresh(), 500, true);

	constructor(leaf: WorkspaceLeaf, plugin: FocusFirstPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return FOCUS_FIRST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t().view.title;
	}

	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('focus-first-view');
		this.contentEl.style.setProperty('--focus-first-font-scale', String(this.plugin.settings.fontSize / 100));
		this.registerEvent(
			this.app.metadataCache.on('changed', (_file: TFile) => {
				this.debouncedRefresh();
			}),
		);
		await this.refresh();
	}

	private boardDrag = new BoardDragSort(
		(task, lane, anchor, after) => { void this.moveTo(task, lane, anchor, after); },
		() => { void this.refresh(); },
	);

	async onClose(): Promise<void> {
		this.boardDrag.reset();
	}

	async refresh(): Promise<void> {
		if (this.boardDrag.active) return;
		const tasks = await scanTasks(this.app, this.plugin.settings);
		if (this.boardDrag.active) return;
		this.tasks = tasks;
		const scroll = Array.from(this.contentEl.querySelectorAll?.('.focus-first-task-list') ?? []).map(list => list.scrollTop);
		const top = this.contentEl.scrollTop;
		this.render();
		Array.from(this.contentEl.querySelectorAll?.('.focus-first-task-list') ?? []).forEach((list, index) => { list.scrollTop = scroll[index] ?? 0; });
		this.contentEl.scrollTop = top;
	}

	private render(): void {
		if (this.boardDrag.active) return;
		this.boardDrag.reset();
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv({ cls: 'focus-first-header' });
		header.createEl('h4', { text: t().view.title });
		const headerActions = header.createDiv({ cls: 'focus-first-header-actions' });
		const logBtn = headerActions.createEl('button', { text: 'Daily log' });
		logBtn.addEventListener('click', () => { void this.plugin.openDailyLog(); });
		const planningBtn = headerActions.createEl('button', { text: '每日规划' });
		planningBtn.addEventListener('click', () => { void this.plugin.activatePlanningView(); });
		const dailyBtn = headerActions.createEl('button', { text: '今日工作' });
		dailyBtn.addEventListener('click', () => { void this.plugin.activateDailyView(); });


		const searchToggleBtn = headerActions.createEl('button', {
			cls: 'mod-cta focus-first-search-toggle',
		});
		setIcon(searchToggleBtn, 'search');
		searchToggleBtn.createSpan({ text: String(t().view.searchToggle) });
		searchToggleBtn.setAttribute('aria-label', String(t().view.searchToggle));
		const addBtn = headerActions.createEl('button', { cls: 'focus-first-add-btn' });
		setIcon(addBtn, 'plus');
		addBtn.createSpan({ text: String(t().view.add) });
		addBtn.setAttribute('aria-label', String(t().quickAdd.addTaskButton));
		addBtn.addEventListener('click', () => { this.plugin.openQuickAdd(); });
		const refreshBtn = headerActions.createEl('button', { cls: 'focus-first-refresh-btn' });
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.setAttribute('aria-label', String(t().view.refresh));
		refreshBtn.setAttribute('title', String(t().view.refresh));

		// Focus First works standalone, but the Tasks plugin makes creating dated
		// and prioritised tasks much easier — nudge the user if it's missing,
		// unless they've dismissed the notice.
		if (!isTasksPluginEnabled(this.app) && !this.plugin.settings.tasksPluginWarningDismissed) {
			const warning = contentEl.createDiv({ cls: 'focus-first-warning' });
			const icon = warning.createSpan({ cls: 'focus-first-warning-icon' });
			setIcon(icon, 'alert-triangle');
			warning.createSpan({ text: String(t().view.tasksPluginWarning), cls: 'focus-first-warning-text' });

			const dismiss = warning.createEl('button', { cls: 'focus-first-warning-dismiss' });
			setIcon(dismiss, 'x');
			dismiss.setAttribute('aria-label', String(t().view.tasksPluginWarningDismiss));
			dismiss.addEventListener('click', () => {
				this.plugin.settings.tasksPluginWarningDismissed = true;
				void this.plugin.saveSettings();
				warning.remove();
			});
		}
		refreshBtn.addEventListener('click', () => { void this.refresh(); });

		// Cards wrapper stacks the search + focus cards above the matrix, all
		// sharing the same native card look (--background-secondary + border).
		const cardsWrapper = contentEl.createDiv({ cls: 'focus-first-cards-wrapper' });

		// Search area groups the search input and the date filters. It stays
		// collapsed by default (toggled from the header) so it doesn't take up
		// permanent vertical space; when opened it reveals the input and all filter
		// options at once, and it auto-opens when a search or filter is active so
		// the current state stays visible.
		this.searchVisible = this.searchVisible
			|| this.searchQuery !== ''
			|| this.activeDateFilters.size > 0
			|| this.activeSizeFilters.size > 0;
		const searchArea = cardsWrapper.createDiv({
			cls: `focus-first-search-area${this.searchVisible ? '' : ' focus-first-hidden'}`,
		});
		searchToggleBtn.classList.toggle('is-active', this.searchVisible);
		const searchBar = searchArea.createDiv({ cls: 'focus-first-search-bar' });
		const searchInput = searchBar.createEl('input', {
			cls: 'focus-first-search-input',
			attr: {
				type: 'text',
				placeholder: t().view.searchPlaceholder,
				value: this.searchQuery,
			},
		});

		const filterPanel = searchArea.createDiv({ cls: 'focus-first-filter-panel' });

		// Declare containers before closures reference them
		const focusContainer = cardsWrapper.createDiv({ cls: 'focus-first-focus-container' });
		const matrixContainer = contentEl.createDiv({ cls: 'focus-first-matrix-container' });

		this.renderFilterPanel(filterPanel, () => {
			this.renderFocusTasks(focusContainer);
			this.renderMatrix(contentEl, matrixContainer);
		});

		searchToggleBtn.addEventListener('click', () => {
			this.searchVisible = !this.searchVisible;
			searchArea.classList.toggle('focus-first-hidden', !this.searchVisible);
			searchToggleBtn.classList.toggle('is-active', this.searchVisible);
			if (this.searchVisible) searchInput.focus();
		});

		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value;
			this.renderFocusTasks(focusContainer);
			this.renderMatrix(contentEl, matrixContainer);
		});

		this.renderFocusTasks(focusContainer);
		this.renderMatrix(contentEl, matrixContainer);
	}

	private renderFilterPanel(panel: HTMLElement, onChange: () => void): void {
		panel.empty();
		// Every bucket dueBucket() can produce is offered, otherwise tasks in a
		// missing one would silently vanish as soon as any date filter is active.
		const dateGroup = panel.createDiv({ cls: 'focus-first-filter-group' });
		for (const bucket of DUE_BUCKETS) {
			const label = dateGroup.createEl('label', { cls: 'focus-first-filter-option' });
			const cb = label.createEl('input');
			cb.type = 'checkbox';
			cb.checked = this.activeDateFilters.has(bucket);
			label.createSpan({ text: dueBucketLabel(bucket, this.plugin.settings.urgencyDays) });
			cb.addEventListener('change', () => {
				if (cb.checked) this.activeDateFilters.add(bucket);
				else this.activeDateFilters.delete(bucket);
				onChange();
			});
		}

		// Size filter (#30/#35): narrows to tasks of the chosen size(s), reusing the
		// #s/#m/#l tags. Only shown when the user has size tags configured. Checking
		// only "small" is the "quick wins" lens.
		if (sizeTagList(this.plugin.settings).length > 0) {
			const sizeGroup = panel.createDiv({ cls: 'focus-first-filter-group focus-first-size-filter-group' });
			const sizeLabels: Record<TaskSize, string> = {
				small: String(t().view.actions.sizeSmall),
				medium: String(t().view.actions.sizeMedium),
				large: String(t().view.actions.sizeLarge),
			};
			for (const size of SIZE_FILTER_OPTIONS) {
				const label = sizeGroup.createEl('label', { cls: 'focus-first-filter-option' });
				const cb = label.createEl('input');
				cb.type = 'checkbox';
				cb.checked = this.activeSizeFilters.has(size);
				label.createSpan({ text: sizeLabels[size] });
				cb.addEventListener('change', () => {
					if (cb.checked) this.activeSizeFilters.add(size);
					else this.activeSizeFilters.delete(size);
					onChange();
				});
			}
		}
	}

	private passesDateFilter(task: TaskItem): boolean {
		if (this.activeDateFilters.size === 0) return true;
		return this.activeDateFilters.has(dueBucket(task, this.plugin.settings.urgencyDays));
	}

	private passesSizeFilter(task: TaskItem): boolean {
		if (this.activeSizeFilters.size === 0) return true;
		return task.size !== undefined && this.activeSizeFilters.has(task.size);
	}

	/**
	 * Renders a section heading using Obsidian's native `.setting-item-heading`
	 * markup so it inherits the standard settings look (bold name, muted
	 * description, control on the right) without any bespoke styling.
	 */
	private renderHeading(
		parent: HTMLElement,
		title: string,
		opts: { subtitle?: string; count?: number } = {},
	): void {
		const head = parent.createDiv({ cls: 'setting-item setting-item-heading focus-first-heading' });
		const info = head.createDiv({ cls: 'setting-item-info' });
		info.createDiv({ text: title, cls: 'setting-item-name' });
		if (opts.subtitle) {
			info.createDiv({ text: opts.subtitle, cls: 'setting-item-description' });
		}
		const control = head.createDiv({ cls: 'setting-item-control' });
		if (opts.count !== undefined) {
			control.createSpan({ text: String(opts.count), cls: 'focus-first-quadrant-count' });
		}
	}

	private laneTasks(lane: BoardLane): TaskItem[] {
		const keyOf = focusKeyResolver(this.tasks);
		const order = lane === 'focus' ? this.plugin.settings.focusOrder : (this.plugin.settings.boardOrder ?? []);
		const rank = (task: TaskItem) => {
			const i = order.indexOf(keyOf(task.file.path, task.lineNumber));
			return i < 0 ? Number.MAX_SAFE_INTEGER : i;
		};
		return this.tasks.filter(task => !task.completed && !isHiddenTask(task, this.plugin.settings)
			&& boardLane(task, this.plugin.settings) === lane).sort((a,b) => rank(a) - rank(b));
	}

	private matchesFilters(task: TaskItem): boolean {
		const query = this.searchQuery.toLowerCase();
		return (!query || task.line.toLowerCase().includes(query) || task.file.basename.toLowerCase().includes(query))
			&& this.passesDateFilter(task) && this.passesSizeFilter(task);
	}

	private renderFocusTasks(container: HTMLElement): void {
		container.empty();
		container.classList.remove('focus-first-hidden');
		container.classList.add('pftf-focus-board');
		const tasks = this.laneTasks('focus');
		const used = this.tasks.filter(task => !task.completed && boardLane(task, this.plugin.settings) === 'focus').length;
		const capacity = focusCapacity(this.plugin.settings.focusTargetCount);
		this.renderHeading(container, 'Focus', { subtitle: '把注意力留给最重要的事' });
		const controls = container.createDiv({ cls: 'pftf-capacity-controls' });
		controls.createSpan({ text: `${used} / ${capacity}`, cls: `pftf-capacity-count${used >= capacity ? ' is-full' : ''}` });
		const select = controls.createEl('select', { attr: { 'aria-label': 'Focus 容量' } });
		for (const n of [1, 2, 3]) select.createEl('option', { text: `${n} 个位置`, attr: { value: String(n) } });
		select.value = String(capacity);
		select.addEventListener('change', () => {
			void setFocusCapacity(this.app, this.plugin.settings, Number(select.value))
				.then(() => this.plugin.saveSettings()).then(() => this.plugin.refreshViews())
				.catch((error: Error) => { new Notice(error.message); select.value = String(capacity); });
		});
		const list = container.createEl('ul', { cls: 'focus-first-task-list pftf-focus-slots' });
		list.setCssProps({ '--pftf-focus-capacity': String(capacity) });
		tasks.filter(task => this.matchesFilters(task)).forEach((task, index) => this.renderBoardTask(list, task, 'focus', index + 1));
		for (let i = used; i < capacity; i++) list.createEl('li', { cls: 'pftf-focus-empty-slot', text: `0${i + 1}  拖入一个重点事项` });
		if (used > tasks.length) container.createDiv({ cls: 'pftf-board-notice', text: `另有 ${used - tasks.length} 项被隐藏，仍占用 Focus 容量。` });
		if (used > capacity) container.createDiv({ cls: 'pftf-board-notice', text: `现有 ${used} 项已完整保留。请移出 ${used - capacity} 项，让 Focus 回到容量内。` });
		if (tasks.length > 0 && !tasks.some(task => this.matchesFilters(task))) container.createDiv({ cls: 'pftf-board-notice', text: '没有符合筛选条件的 Focus 事项，容量仍按全部事项计算。' });
		this.wireBoardDrop(container, 'focus');
	}

	private async moveTo(task: TaskItem, lane: BoardLane, anchor?: TaskItem, after = false): Promise<void> {
		try {
			const keyOf = focusKeyResolver(this.tasks);
			const key = keyOf(task.file.path, task.lineNumber);
			const sameLane = boardLane(task, this.plugin.settings) === lane;
			const snapshot = sameLane ? undefined : await moveBoardTask(this.app, this.plugin.settings, task, lane);
			if (anchor) {
				const keys = this.laneTasks(lane).map(t => keyOf(t.file.path, t.lineNumber)).filter(k => k !== key);
				const index = keys.indexOf(keyOf(anchor.file.path, anchor.lineNumber));
				if (index >= 0) keys.splice(index + (after ? 1 : 0), 0, key);
				else keys.push(key);
				const oldFocus = this.plugin.settings.focusOrder;
				const oldBoard = this.plugin.settings.boardOrder;
				if (lane === 'focus') this.plugin.settings.focusOrder = keys;
				else this.plugin.settings.boardOrder = [...keys, ...(this.plugin.settings.boardOrder ?? []).filter(k => !keys.includes(k))];
				try { await this.plugin.saveSettings(); } catch (error) {
					this.plugin.settings.focusOrder = oldFocus;
					this.plugin.settings.boardOrder = oldBoard;
					throw error;
				}
			}
			if (snapshot) showUndoNotice(this.app, `已移到 ${BOARD_LABELS[lane]}`, snapshot);
			await this.refresh();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : '移动失败，请重试。');
			await this.refresh();
		}
	}

	private wireBoardDrop(el: HTMLElement, lane: BoardLane, anchor?: TaskItem): void {
		el.addEventListener('dragenter', event => { this.boardDrag.over(event, el, lane); });
		el.addEventListener('dragover', event => { if (this.boardDrag.over(event, el, lane)) return; event.preventDefault(); event.stopPropagation(); el.classList.add('is-drag-over'); });
		el.addEventListener('dragleave', event => { if (!el.contains(event.relatedTarget as Node)) el.classList.remove('is-drag-over'); });
		el.addEventListener('drop', event => {
			if (this.boardDrag.active) { this.boardDrag.over(event, el, lane); this.boardDrag.drop(event); return; }
			event.preventDefault(); event.stopPropagation(); el.classList.remove('is-drag-over');
			try {
				const data = JSON.parse(event.dataTransfer?.getData('application/json') ?? '{}') as { filePath?: unknown; lineNumber?: unknown; line?: unknown };
				const task = this.tasks.find(t => t.file.path === data.filePath && t.lineNumber === data.lineNumber && t.line === data.line);
				if (!task || task === anchor) return;
				const rect = el.getBoundingClientRect();
				void this.moveTo(task, lane, anchor, event.clientY > rect.top + rect.height / 2);
			} catch { /* Ignore foreign drag payloads. */ }
		});
	}

	private renderBoardTask(list: HTMLElement, task: TaskItem, lane: BoardLane, position?: number): void {
		const quadrant: Quadrant = lane === 'urgent' ? 'do' : lane === 'delegate' ? 'delegate' : 'schedule';
		const li = renderTaskItem(list, { ...task, quadrant, manual: true }, this.app, this.plugin.settings, {
			suppressWhyHere: true, position, boardMode: true,
			onToggleFocus: () => { void this.moveTo(task, lane === 'focus' ? 'work' : 'focus'); },
		});
		const move = li.createEl('button', { cls: 'pftf-card-move', attr: { 'aria-label': `移动 ${taskTitle(task.line)}`, title: '移动到…' } });
		setIcon(move, 'move');
		move.addEventListener('click', event => {
			event.stopPropagation();
			const menu = new Menu();
			for (const target of ['focus', 'work', 'urgent', 'delegate'] as BoardLane[]) {
				if (target !== lane) menu.addItem(item => item.setTitle(`移到 ${BOARD_LABELS[target]}`).onClick(() => { void this.moveTo(task, target); }));
			}
			menu.showAtMouseEvent(event);
		});
		this.boardDrag.bind(li, task, lane);
		this.wireBoardDrop(li, lane, task);
	}

	private renderMatrix(_contentEl: HTMLElement, container: HTMLElement): void {
		container.empty();
		const board = container.createDiv({ cls: 'pftf-work-board' });
		const subtitles = { work: '所有待推进的工作 · 拖动调整顺序', urgent: '需要立刻处理', delegate: '交给他人 · 持续跟进' };
		for (const lane of ['work', 'urgent', 'delegate'] as const) {
			const all = this.laneTasks(lane);
			const tasks = all.filter(task => this.matchesFilters(task));
			const cell = board.createDiv({ cls: `pftf-board-lane pftf-board-lane--${lane}` });
			this.renderHeading(cell, BOARD_LABELS[lane], { subtitle: subtitles[lane], count: all.length });
			this.wireBoardDrop(cell, lane);
			const list = cell.createEl('ul', { cls: 'focus-first-task-list' });
			for (const task of tasks) this.renderBoardTask(list, task, lane);
			if (!tasks.length) cell.createDiv({ cls: 'pftf-lane-empty', text: all.length ? '没有符合筛选条件的事项' : '拖入事项，或在下方添加' });
			capListHeight(list, this.plugin.settings.quadrantLimit);
			this.renderQuadrantAdd(cell.createDiv({ cls: 'focus-first-quadrant-add' }), lane === 'urgent' ? 'do' : lane === 'delegate' ? 'delegate' : 'schedule');
		}
	}

	/**
	 * The ghost row at the foot of a quadrant: "+ Add here". A click turns it
	 * into an input; Enter writes the task to the inbox, seeded so it lands in
	 * this very quadrant (see quadrantAdd.ts); Escape, or leaving it empty, puts
	 * the ghost row back. The input stays open after adding, for a run of tasks.
	 */
	private renderQuadrantAdd(row: HTMLElement, quadrant: Quadrant): void {
		row.empty();
		const btn = row.createEl('button', { cls: 'focus-first-quadrant-add-btn' });
		setIcon(btn.createSpan({ cls: 'focus-first-quadrant-add-icon' }), 'plus');
		btn.createSpan({ text: String(t().view.addHere) });
		btn.addEventListener('click', () => {
			if (!isInboxConfigured(this.plugin.settings)) { this.plugin.openQuickAdd(); return; }
			row.empty();
			const input = row.createEl('input', {
				cls: 'focus-first-quadrant-add-input',
				attr: { type: 'text', placeholder: String(t().view.addHerePlaceholder) },
			});
			const restore = () => this.renderQuadrantAdd(row, quadrant);
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Escape') { restore(); return; }
				if (e.key !== 'Enter' || e.isComposing) return;
				e.preventDefault();
				const text = input.value.trim();
				if (!text) { restore(); return; }
				const lane = quadrant === 'do' ? 'urgent' : quadrant === 'delegate' ? 'delegate' : 'work';
				const seeded = boardLine(`- [ ] ${text}`, lane, this.plugin.settings).replace(TASK_PREFIX_RE, '');
				void commitTask(this.app, this.plugin.settings, seeded).then((result) => {
					if (result !== 'added') return;
					input.value = '';
					void this.refresh();
				});
			});
			input.addEventListener('blur', () => { if (!input.value.trim()) restore(); });
			input.focus();
		});
	}

}
