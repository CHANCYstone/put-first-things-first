/**
 * Tests for TaskView.ts DOM rendering — render(), renderFilterPanel(),
 * renderFocusTasks(), renderMatrix(), renderTask(), and drag & drop.
 *
 * A minimal fake DOM element (FakeEl) replicates the subset of the Obsidian
 * HTMLElement extensions (createDiv/createEl/createSpan/empty/classList/
 * setCssProps/addEventListener) that TaskView.ts relies on, so the rendering
 * logic can be exercised and asserted on without a real browser DOM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', () => import('./__mocks__/obsidian'));

const { FocusFirstView, focusKeyResolver, capListHeight } = await import('../TaskView');
const { TriageView } = await import('../TriageView');
const { openTaskFile } = await import('../taskRenderer');
const { DEFAULT_SETTINGS } = await import('../settings');
const { TFile, MarkdownView, createdMenus, clearCreatedMenus, createdModals, clearCreatedModals, Platform } = await import('./__mocks__/obsidian');

import type { TaskItem } from '../taskScanner';
import type { FocusFirstSettings } from '../settings';

// ---------------------------------------------------------------------------
// FakeEl — minimal stand-in for Obsidian's extended HTMLElement
// ---------------------------------------------------------------------------

class FakeClassList {
	constructor(private el: FakeEl) {}
	add(...cls: string[]) { for (const c of cls) this.el.cls.add(c); }
	remove(...cls: string[]) { for (const c of cls) this.el.cls.delete(c); }
	toggle(cls: string, force?: boolean) {
		const has = this.el.cls.has(cls);
		const want = force === undefined ? !has : force;
		if (want) this.el.cls.add(cls); else this.el.cls.delete(cls);
		return want;
	}
	contains(cls: string) { return this.el.cls.has(cls); }
}

class FakeEl {
	tagName: string;
	children: FakeEl[] = [];
	text = '';
	value = '';
	type = '';
	checked = false;
	draggable = false;
	cls = new Set<string>();
	attrs: Record<string, string> = {};
	style: Record<string, string> = {};
	listeners: Record<string, Array<(e: unknown) => void>> = {};
	parentEl?: FakeEl;
	classList = new FakeClassList(this);

	constructor(tagName = 'div') {
		this.tagName = tagName;
	}

	empty() { this.children = []; }

	remove() {
		const siblings = this.parentEl?.children;
		if (siblings) {
			const i = siblings.indexOf(this);
			if (i >= 0) siblings.splice(i, 1);
		}
	}

	createDiv(o?: { cls?: string; text?: string }) { return this.createEl('div', o); }
	createSpan(o?: { cls?: string; text?: string }) { return this.createEl('span', o); }

	createEl(tag: string, o?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeEl {
		const el = new FakeEl(tag);
		if (o?.cls) for (const c of o.cls.split(' ').filter(Boolean)) el.cls.add(c);
		if (o?.text) el.text = o.text;
		if (o?.attr) {
			Object.assign(el.attrs, o.attr);
			if (o.attr.value !== undefined) el.value = o.attr.value;
		}
		el.parentEl = this;
		this.children.push(el);
		return el;
	}

	addEventListener(type: string, handler: (e: unknown) => void) {
		(this.listeners[type] ??= []).push(handler);
	}

	dispatch(type: string, event: Record<string, unknown> = {}) {
		for (const h of this.listeners[type] ?? []) h(event);
	}

	setAttribute(k: string, v: string) { this.attrs[k] = v; }
	getAttribute(k: string) { return this.attrs[k]; }
	addClass(...c: string[]) { for (const x of c) this.cls.add(x); }
	setText(t: string) { this.text = t; }
	setCssProps(props: Record<string, string>) { Object.assign(this.style, props); }

	contains(node: unknown): boolean {
		if (!(node instanceof FakeEl)) return false;
		let cur: FakeEl | undefined = node;
		while (cur) {
			if (cur === this) return true;
			cur = cur.parentEl;
		}
		return false;
	}

	// Recursively find descendants by class name (test helper, not part of Obsidian API)
	findAllByClass(cls: string): FakeEl[] {
		const result: FakeEl[] = [];
		for (const child of this.children) {
			if (child.cls.has(cls)) result.push(child);
			result.push(...child.findAllByClass(cls));
		}
		return result;
	}

	findByClass(cls: string): FakeEl | undefined {
		return this.findAllByClass(cls)[0];
	}

	// --- Extra DOM surface used by keyboard navigation (issue #11) ---
	findAll(selector: string): FakeEl[] {
		return this.findAllByClass(selector.replace(/^\./, ''));
	}

	closest(selector: string): FakeEl | null {
		const classes = selector.split(',').map((s) => s.trim().replace(/^\./, ''));
		const matches = (el: FakeEl) => classes.some((c) => el.cls.has(c));
		if (matches(this)) return this;
		let cur = this.parentEl;
		while (cur) {
			if (matches(cur)) return cur;
			cur = cur.parentEl;
		}
		return null;
	}

	get className(): string { return [...this.cls].join(' '); }
	get ownerDocument(): { activeElement: FakeEl | null } { return { activeElement: null }; }
	tabIndex = -1;
	focus() {}
	scrollIntoView() {}
	offsetHeight = 10;
	offsetWidth = 100;
	rect = { left: 10, top: 500, right: 210, bottom: 520, width: 200, height: 20 };
	getBoundingClientRect() { return this.rect; }
	appendChild(el: FakeEl) { el.parentEl = this; this.children.push(el); return el; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromToday(offset: number): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return d;
}

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
	return {
		file: new TFile('Notes/test.md') as never,
		line: '- [ ] Sample task',
		lineNumber: 0,
		completed: false,
		tags: [],
		progress: [],
		...overrides,
	};
}

function makeView(settings: Partial<FocusFirstSettings> = {}, tasks: TaskItem[] = []) {
	const vault = {
		getAbstractFileByPath: (_path: string): InstanceType<typeof TFile> | null => null,
		read: vi.fn(async (_file: unknown) => ''),
		modify: vi.fn(async (_file: unknown, _content: string) => {}),
	};
	const workspace = {
		getLeaf: vi.fn((_newLeaf?: boolean): { openFile: (f: unknown) => Promise<void>; view: unknown } => ({
			openFile: vi.fn(async (_f: unknown) => {}),
			view: undefined,
		})),
	};
	const app = { vault, workspace };
	const leaf = { app };
	const plugin = { settings: { ...DEFAULT_SETTINGS, ...settings }, saveSettings: vi.fn(async () => {}) };
	// @ts-expect-error — stub leaf/plugin, not real Obsidian types
	const view = new FocusFirstView(leaf, plugin);
	const contentEl = new FakeEl('div');
	contentEl.cls.add('focus-first-view'); // so the popover's closest('.focus-first-view') resolves
	// @ts-expect-error — FakeEl stands in for the real HTMLElement contentEl
	view.contentEl = contentEl;
	// @ts-expect-error — assign tasks directly, bypassing scanTasks()
	view.tasks = tasks;
	return { view, plugin, app, contentEl };
}

interface TestableView {
	render(): void;
	renderMatrix(contentEl: unknown, container: unknown): void;
	renderFocusTasks(container: unknown): void;
}

function priv(view: unknown): TestableView {
	return view as TestableView;
}

// ---------------------------------------------------------------------------
// render() — top-level wiring
// ---------------------------------------------------------------------------

describe('render()', () => {
	it('builds the header, search bar, focus container, and matrix container', () => {
		const { view, contentEl } = makeView();
		priv(view).render();

		expect(contentEl.findByClass('focus-first-header')).toBeDefined();
		expect(contentEl.findByClass('focus-first-search-bar')).toBeDefined();
		expect(contentEl.findByClass('focus-first-focus-container')).toBeDefined();
		expect(contentEl.findByClass('focus-first-matrix-container')).toBeDefined();
	});

	it('warns when the Tasks plugin is not enabled', () => {
		const { view, contentEl } = makeView(); // stub app has no plugins → not enabled
		priv(view).render();
		expect(contentEl.findByClass('focus-first-warning')).toBeDefined();
	});

	it('does not warn when the Tasks plugin is enabled', () => {
		const { view, contentEl, app } = makeView();
		(app as unknown as { plugins: { enabledPlugins: Set<string> } }).plugins = {
			enabledPlugins: new Set(['obsidian-tasks-plugin']),
		};
		priv(view).render();
		expect(contentEl.findByClass('focus-first-warning')).toBeUndefined();
	});

	it('dismissing the warning removes it and persists the choice', () => {
		const { view, contentEl, plugin } = makeView();
		priv(view).render();
		expect(contentEl.findByClass('focus-first-warning')).toBeDefined();

		contentEl.findByClass('focus-first-warning-dismiss')?.dispatch('click');

		expect(plugin.settings.tasksPluginWarningDismissed).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(contentEl.findByClass('focus-first-warning')).toBeUndefined();
	});

	it('does not warn again once the notice was dismissed', () => {
		const { view, contentEl } = makeView({ tasksPluginWarningDismissed: true });
		priv(view).render();
		expect(contentEl.findByClass('focus-first-warning')).toBeUndefined();
	});

	it('clicking refresh triggers a refresh', () => {
		const { view, contentEl } = makeView();
		priv(view).render();
		const refreshSpy = vi.spyOn(view, 'refresh').mockResolvedValue();

		const refreshBtn = contentEl.findByClass('focus-first-refresh-btn');
		refreshBtn?.dispatch('click');

		expect(refreshSpy).toHaveBeenCalledOnce();
	});

	it('typing in the search input updates searchQuery and re-renders', () => {
		const tasks = [makeTask({ line: '- [ ] Apple task' }), makeTask({ line: '- [ ] Banana task' })];
		const { view, contentEl } = makeView({}, tasks);
		priv(view).render();

		const searchInput = contentEl.findByClass('focus-first-search-input');
		expect(searchInput).toBeDefined();
		searchInput!.value = 'banana';
		searchInput!.dispatch('input');

		// @ts-expect-error — reading private searchQuery for assertion
		expect(view.searchQuery).toBe('banana');
	});

	it('shows the filter panel inside the search area with no separate filter toggle (#29)', () => {
		const { view, contentEl } = makeView();
		priv(view).render();

		// The date filters are part of the search area, not behind a second toggle.
		expect(contentEl.findByClass('focus-first-filter-panel')).toBeDefined();
		expect(contentEl.findByClass('focus-first-filter-option')).toBeDefined();
		expect(contentEl.findByClass('focus-first-filter-toggle')).toBeUndefined();
	});

	it('auto-opens the search area when a date filter is active (#29)', () => {
		const { view, contentEl } = makeView();
		// @ts-expect-error — seed a private active date filter
		view.activeDateFilters = new Set(['__overdue__']);
		priv(view).render();

		const searchArea = contentEl.findByClass('focus-first-search-area');
		expect(searchArea?.classList.contains('focus-first-hidden')).toBe(false);
	});

	it('collapses the search area by default and toggles it from the header', () => {
		const { view, contentEl } = makeView();
		priv(view).render();

		const searchArea = contentEl.findByClass('focus-first-search-area');
		const searchToggle = contentEl.findByClass('focus-first-search-toggle');
		expect(searchArea?.classList.contains('focus-first-hidden')).toBe(true);
		expect(searchToggle?.classList.contains('is-active')).toBe(false);

		searchToggle?.dispatch('click');
		expect(searchArea?.classList.contains('focus-first-hidden')).toBe(false);
		expect(searchToggle?.classList.contains('is-active')).toBe(true);

		searchToggle?.dispatch('click');
		expect(searchArea?.classList.contains('focus-first-hidden')).toBe(true);
		expect(searchToggle?.classList.contains('is-active')).toBe(false);
	});

	it('keeps the search area open when a search query is active', () => {
		const { view, contentEl } = makeView();
		// @ts-expect-error — set private searchQuery directly
		view.searchQuery = 'banana';
		priv(view).render();

		const searchArea = contentEl.findByClass('focus-first-search-area');
		const searchToggle = contentEl.findByClass('focus-first-search-toggle');
		expect(searchArea?.classList.contains('focus-first-hidden')).toBe(false);
		expect(searchToggle?.classList.contains('is-active')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// renderFilterPanel() (exercised indirectly via render())
// ---------------------------------------------------------------------------

describe('filter panel checkboxes', () => {
	it('checking a date filter adds it to activeDateFilters and re-renders the matrix', () => {
		const overdueTask = makeTask({ dueDate: daysFromToday(-2) });
		const futureTask = makeTask({ dueDate: daysFromToday(20) });
		const { view, contentEl } = makeView({}, [overdueTask, futureTask]);
		priv(view).render();

		const checkboxes = contentEl.findAllByClass('focus-first-filter-option')
			.map((label) => label.children.find((c) => c.tagName === 'input'))
			.filter((el): el is FakeEl => !!el);

		// First DATE_FILTER_OPTIONS entry is '__overdue__'
		const overdueCheckbox = checkboxes[0]!;
		overdueCheckbox.checked = true;
		overdueCheckbox.dispatch('change');

		// @ts-expect-error — reading private activeDateFilters for assertion
		expect(view.activeDateFilters.has('__overdue__')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Size filter (#30/#35)
// ---------------------------------------------------------------------------

describe('size filter', () => {
	it('renders a size filter with the configured sizes', () => {
		const { view, contentEl } = makeView();
		priv(view).render();

		const optionTexts = contentEl.findAllByClass('focus-first-filter-option')
			.map((label) => label.children.find((c) => c.tagName === 'span')?.text);
		expect(optionTexts).toEqual(expect.arrayContaining(['Small', 'Medium', 'Large']));
		expect(contentEl.findByClass('focus-first-size-filter-group')).toBeDefined();
	});

	it('omits the size filter when no size tags are configured', () => {
		const { view, contentEl } = makeView({ sizeTags: { small: '', medium: '', large: '' } });
		priv(view).render();
		expect(contentEl.findByClass('focus-first-size-filter-group')).toBeUndefined();
	});

	it('checking a size narrows the matrix to tasks of that size', () => {
		const tasks = [
			makeTask({ line: '- [ ] Small one #s', tags: ['#s'], size: 'small', dueDate: daysFromToday(0), priority: '🔺' }),
			makeTask({ line: '- [ ] Big one #l', tags: ['#l'], size: 'large', dueDate: daysFromToday(0), priority: '🔺' }),
		];
		const { view, contentEl } = makeView({ importantPriorities: ['🔺'] }, tasks);
		priv(view).render();

		// Find the "Small" box inside the size group, rather than counting past the
		// date boxes: that index broke as soon as a date bucket was added.
		const sizeGroup = contentEl.findByClass('focus-first-size-filter-group')!;
		const smallCheckbox = sizeGroup.findAllByClass('focus-first-filter-option')
			.map((label) => label.children.find((c) => c.tagName === 'input'))
			.filter((el): el is FakeEl => !!el)[0]!;
		smallCheckbox.checked = true;
		smallCheckbox.dispatch('change');

		// @ts-expect-error — reading private activeSizeFilters for assertion
		expect(view.activeSizeFilters.has('small')).toBe(true);
		const texts = contentEl.findAllByClass('focus-first-task-text').map((el) => el.text);
		expect(texts).toContain('Small one');
		expect(texts).not.toContain('Big one');
	});

	it('an un-sized task is excluded while a size filter is active', () => {
		const { view } = makeView();
		// @ts-expect-error — seed private state
		view.activeSizeFilters = new Set(['small']);
		// @ts-expect-error — call private predicate directly
		expect(view.passesSizeFilter(makeTask({ size: 'small' }))).toBe(true);
		// @ts-expect-error — call private predicate directly
		expect(view.passesSizeFilter(makeTask({}))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Latest progress note on the card
// ---------------------------------------------------------------------------

describe('latest note on the card', () => {
	function entry(daysAgo: number, text: string, alert = false, lineNumber = 1) {
		return { lineNumber, date: daysFromToday(-daysAgo), alert, text };
	}
	function renderWith(progress: TaskItem['progress'], settings: Partial<FocusFirstSettings> = {}) {
		const tasks = [makeTask({ line: '- [ ] Bridge', priority: '🔺', dueDate: daysFromToday(0), progress })];
		const { view, contentEl } = makeView({ importantPriorities: ['🔺'], ...settings }, tasks);
		const container = contentEl.createDiv();
		priv(view).renderMatrix(contentEl, container);
		return container;
	}

	it('adds nothing to a card without a log', () => {
		expect(renderWith([]).findByClass('focus-first-task-latest')).toBeUndefined();
	});

	it('shows only the most recent entry, with its short date', () => {
		const container = renderWith([entry(5, 'First call'), entry(1, 'Money arrived', false, 2)]);
		const latest = container.findByClass('focus-first-task-latest');
		expect(latest?.findByClass('focus-first-task-latest-text')?.text).toBe('Money arrived');
		expect(latest?.findByClass('focus-first-task-latest-date')?.text).toMatch(/^\d{2}-\d{2}$/);
		expect(container.findAllByClass('focus-first-task-latest')).toHaveLength(1);
	});

	it('marks an alert entry and a stale entry', () => {
		expect(renderWith([entry(0, 'Trouble', true)]).findByClass('focus-first-task-latest')?.classList.contains('is-alert')).toBe(true);
		expect(renderWith([entry(8, 'Old news')]).findByClass('focus-first-task-latest')?.classList.contains('is-stale')).toBe(true);
		expect(renderWith([entry(7, 'Fresh enough')]).findByClass('focus-first-task-latest')?.classList.contains('is-stale')).toBe(false);
	});

	it('follows the configured stale threshold', () => {
		expect(renderWith([entry(3, 'x')], { staleDays: 2 }).findByClass('focus-first-task-latest')?.classList.contains('is-stale')).toBe(true);
	});

	it('clicking the latest note opens the progress page', () => {
		clearCreatedModals();
		renderWith([entry(1, 'Money arrived')]).findByClass('focus-first-task-latest')?.dispatch('click', { stopPropagation: () => {} });
		expect(createdModals.at(-1)?.opened).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// renderTask() — action buttons (exercised via renderMatrix)
// ---------------------------------------------------------------------------

describe('task item actions in the matrix', () => {
	function renderSingleTaskMatrix(taskOverrides: Partial<TaskItem> = {}, settings: Partial<FocusFirstSettings> = {}) {
		const tasks = [makeTask({ dueDate: daysFromToday(0), priority: '🔺', ...taskOverrides })];
		const result = makeView({ importantPriorities: ['🔺'], ...settings }, tasks);
		const container = result.contentEl.createDiv();
		priv(result.view).renderMatrix(result.contentEl, container);
		return { ...result, container };
	}

	it('clicking the title opens the progress page, not the note', () => {
		const { container, app } = renderSingleTaskMatrix();
		const getLeaf = vi.fn(() => ({ openFile: vi.fn(async () => {}), view: undefined }));
		app.workspace.getLeaf = getLeaf;
		clearCreatedModals();

		container.findByClass('focus-first-task-text')?.dispatch('click', { stopPropagation: () => {} });

		expect(createdModals.at(-1)?.opened).toBe(true);
		expect(createdModals.at(-1)?.titleEl.text).toBe('Sample task');
		expect(getLeaf).not.toHaveBeenCalled();
	});

	it('opens a bound project note directly, while Progress opens the lightweight editor', () => {
		const homeNote = new TFile('Projects/Bridge.md');
		const { container, app } = renderSingleTaskMatrix({ homeNote: homeNote as never });
		const openFile = vi.fn(async () => {});
		app.workspace.getLeaf = vi.fn(() => ({ openFile, view: undefined }));
		clearCreatedModals();
		container.findByClass('focus-first-task-text')?.dispatch('click', { stopPropagation: () => {} });
		expect(openFile).toHaveBeenCalledWith(homeNote);
		expect(createdModals).toHaveLength(0);
		container.findByClass('pftf-card-progress')?.dispatch('click', { stopPropagation: () => {} });
		expect(createdModals.at(-1)?.opened).toBe(true);
	});

	it('every work lane ends with an "add here" row that turns into an input', () => {
		const { container } = renderSingleTaskMatrix({}, { quickAddInbox: 'Inbox.md' });
		const rows = container.findAllByClass('focus-first-quadrant-add');
		expect(rows).toHaveLength(3);
		rows[0]!.findByClass('focus-first-quadrant-add-btn')!.dispatch('click');
		expect(rows[0]!.findByClass('focus-first-quadrant-add-input')).toBeDefined();
		rows[0]!.findByClass('focus-first-quadrant-add-input')!.dispatch('keydown', { key: 'Escape', preventDefault: () => {} });
		expect(rows[0]!.findByClass('focus-first-quadrant-add-btn')).toBeDefined();
	});

	it('clicking the card body (not just the title) opens the progress page', () => {
		const { container } = renderSingleTaskMatrix();
		clearCreatedModals();
		container.findByClass('focus-first-task-item')?.dispatch('click', { stopPropagation: () => {} });
		expect(createdModals.at(-1)?.opened).toBe(true);
	});

	it('action buttons do not open the progress page as a side effect', async () => {
		const { container, app } = renderSingleTaskMatrix();
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task');
		clearCreatedModals();
		container.findByClass('focus-first-done-btn')?.dispatch('click', { stopPropagation: () => {} });
		await Promise.resolve();
		expect(createdModals).toHaveLength(0);
	});

	it('the more menu opens the task note', () => {
		const { container, app } = renderSingleTaskMatrix();
		const getLeaf = vi.fn(() => ({ openFile: vi.fn(async () => {}), view: undefined }));
		app.workspace.getLeaf = getLeaf;

		clearCreatedMenus();
		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });
		createdMenus.at(-1)?.items.find((i) => i.title === 'Open note')?.callback?.();

		expect(getLeaf).toHaveBeenCalled();
	});

	it('the done button marks the task complete', async () => {
		const { container, app } = renderSingleTaskMatrix();
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task');

		container.findByClass('focus-first-done-btn')?.dispatch('click', { stopPropagation: () => {} });
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), '- [x] Sample task');
	});

	it('the "more" menu hides a task with the hide tag', async () => {
		const { container, app } = renderSingleTaskMatrix({}, { focusTag: '', hideTag: '#hide' });
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task');
		clearCreatedMenus();

		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });
		createdMenus[createdMenus.length - 1]?.items.find((i) => i.title === 'Hide task')?.callback?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), '- [ ] Sample task #hide');
	});

	it('the more menu offers priority and writes the chosen priority', async () => {
		const { container, app } = renderSingleTaskMatrix({ line: '- [ ] Sample task 📅 2026-07-07' });
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task 📅 2026-07-07');
		clearCreatedMenus();

		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });

		const menu = createdMenus[createdMenus.length - 1];
		expect(menu?.items.map((i) => i.title)).toContain('⏫ High');
		menu?.items.find((i) => i.title === '⏫ High')?.callback?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), '- [ ] Sample task ⏫ 📅 2026-07-07');
	});

	it('the "more" menu offers the sizes (and hide) and writes the chosen size tag (#35)', async () => {
		const { container, app } = renderSingleTaskMatrix({ line: '- [ ] Sample task 📅 2026-07-07' });
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task 📅 2026-07-07');
		clearCreatedMenus();

		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });

		const menu = createdMenus[createdMenus.length - 1];
		expect(menu?.items.map((i) => i.title)).toEqual(expect.arrayContaining(['Open note', 'Due tomorrow', '⏫ High', 'Small', 'Medium', 'Large', 'No size', 'Hide task']));
		menu?.items.find((i) => i.title === 'Small')?.callback?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), '- [ ] Sample task 📅 2026-07-07 #s');
	});

	it('shows the size in the popover and omits the size button when size tags are disabled (#35)', () => {
		const sized = renderSingleTaskMatrix({ line: '- [ ] Sample task #m', tags: ['#m'], size: 'medium' });
		expect(sized.container.findByClass('focus-first-more-btn')).toBeDefined();
		const detailValues = sized.container.findAllByClass('focus-first-detail-value').map((v) => v.text);
		expect(detailValues).toContain('Medium');

		const off = renderSingleTaskMatrix({ line: '- [ ] Sample task' }, { sizeTags: { small: '', medium: '', large: '' }, hideTag: '' });
		expect(off.container.findByClass('focus-first-more-btn')).toBeDefined();
		clearCreatedMenus();
		off.container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });
		expect(createdMenus.at(-1)?.items.map((i) => i.title)).not.toContain('Small');
	});

	it('the postpone menu moves an overdue task to tomorrow — an absolute date, not a shift', async () => {
		const { container, app } = renderSingleTaskMatrix({ dueDate: daysFromToday(-20), line: '- [ ] Sample task 📅 2026-07-07' });
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task 📅 2026-07-07');
		clearCreatedMenus();

		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });

		const menu = createdMenus[createdMenus.length - 1];
		expect(menu?.items.map((i) => i.title)).toEqual(expect.arrayContaining(['Due tomorrow', 'Due next week', 'Pick a date…', 'Remove due date']));
		menu?.items.find((i) => i.title === 'Due tomorrow')?.callback?.();
		await Promise.resolve();
		await Promise.resolve();

		const tomorrow = daysFromToday(1);
		const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), `- [ ] Sample task 📅 ${iso}`);
	});

	it('opens the detail popover to the right of the cursor on row hover and hides it on leave', () => {
		vi.stubGlobal('window', { setTimeout: (fn: () => void) => { fn(); return 0; }, clearTimeout: () => {} });
		try {
			const { container, contentEl } = renderSingleTaskMatrix();
			contentEl.rect = { left: 0, top: 0, right: 400, bottom: 1000, width: 400, height: 1000 };
			const item = container.findByClass('focus-first-task-item');
			const detail = container.findByClass('focus-first-task-detail');
			item?.dispatch('mouseenter', { clientX: 100, clientY: 500 }); // stub fires the open delay synchronously
			expect(detail?.classList.contains('is-open')).toBe(true);
			expect(detail?.style['--ff-detail-left']).toBe('112px'); // right of the cursor (100 + 12 gap), room on the right
			expect(detail?.style['--ff-detail-top']).toBe('500px'); // at the cursor, room below
			item?.dispatch('mouseleave'); // stubbed setTimeout fires synchronously
			expect(detail?.classList.contains('is-open')).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('flips the popover to the left of the cursor when there is no room on the right', () => {
		vi.stubGlobal('window', { setTimeout: (fn: () => void) => { fn(); return 0; }, clearTimeout: () => {} });
		try {
			const { container, contentEl } = renderSingleTaskMatrix();
			contentEl.rect = { left: 0, top: 0, right: 400, bottom: 520, width: 400, height: 520 };
			const item = container.findByClass('focus-first-task-item');
			const detail = container.findByClass('focus-first-task-detail');
			item?.dispatch('mouseenter', { clientX: 350, clientY: 515 });
			// right of cursor (350+12=362, +width 100 = 462 > 400) → flip left: 350-12-100 = 238.
			expect(detail?.style['--ff-detail-left']).toBe('238px');
			// at cursor (515) + height 10 = 525 > bottom 520 → shift up to 520-10 = 510.
			expect(detail?.style['--ff-detail-top']).toBe('510px');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('stays open while the popover itself is hovered, then hides on leave', () => {
		vi.stubGlobal('window', { setTimeout: (fn: () => void) => { fn(); return 0; }, clearTimeout: () => {} });
		try {
			const { container, contentEl } = renderSingleTaskMatrix();
			contentEl.rect = { left: 0, top: 0, right: 400, bottom: 1000, width: 400, height: 1000 };
			const item = container.findByClass('focus-first-task-item');
			const detail = container.findByClass('focus-first-task-detail');
			item?.dispatch('mouseenter', { clientX: 100, clientY: 500 });
			expect(detail?.classList.contains('is-open')).toBe(true);
			detail?.dispatch('mouseenter'); // hover bridge cancels the hide
			detail?.dispatch('mouseleave'); // leaving hides it
			expect(detail?.classList.contains('is-open')).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('the detail popover lists the due date and tags', () => {
		const { container } = renderSingleTaskMatrix({ tags: ['#team', '#do'] });
		expect(container.findByClass('focus-first-task-tags')).toBeDefined();
		expect(container.findByClass('focus-first-task-tag')).toBeDefined();
		// why + priority + due + tags + note → five value rows.
		expect(container.findAllByClass('focus-first-detail-value').length).toBeGreaterThanOrEqual(4);
	});

	it('omits the pin badge and unpin button for an automatically classified task (#66)', () => {
		const { container } = renderSingleTaskMatrix(); // due today + priority, no override tag
		expect(container.findByClass('focus-first-pin-badge')).toBeUndefined();
		expect(container.findByClass('focus-first-unpin-btn')).toBeUndefined();
	});

	it('omits the pin badge in Value/Effort mode, where override tags are ignored (#66)', () => {
		// Regression guard: overrides are Eisenhower-only by design (#36 v1); this
		// pins the assumption the pin badge/reset button rely on.
		const { container } = renderSingleTaskMatrix(
			{ dueDate: undefined, priority: undefined, tags: ['#eliminate'] },
			{ axisMode: 'valueEffort' },
		);
		expect(container.findByClass('focus-first-pin-badge')).toBeUndefined();
		expect(container.findByClass('focus-first-unpin-btn')).toBeUndefined();
	});

	it('omits the why-here row when the setting is turned off', () => {
		const { container } = renderSingleTaskMatrix({}, { showWhyHere: false });
		expect(container.findByClass('focus-first-detail-why')).toBeUndefined();
	});

	it('the postpone menu omits "remove" for a task with no due date, and offers the picker', () => {
		const { container } = renderSingleTaskMatrix({ dueDate: undefined });
		clearCreatedMenus();
		clearCreatedModals();
		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });
		const menu = createdMenus[createdMenus.length - 1];
		expect(menu?.items.map((i) => i.title)).toEqual(expect.arrayContaining(['Due tomorrow', 'Due next week', 'Pick a date…']));
		expect(menu?.items.map((i) => i.title)).not.toContain('Remove due date');
		menu?.items.find((i) => i.title === 'Pick a date…')?.callback?.();
		expect(createdModals.at(-1)?.opened).toBe(true);
	});

	it('"remove due date" strips the 📅 token from the line', async () => {
		const { container, app } = renderSingleTaskMatrix({ dueDate: daysFromToday(0), line: '- [ ] Sample task 📅 2026-07-07 #s' });
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Sample task 📅 2026-07-07 #s');
		clearCreatedMenus();
		container.findByClass('focus-first-more-btn')?.dispatch('click', { stopPropagation: () => {} });
		createdMenus[createdMenus.length - 1]?.items.find((i) => i.title === 'Remove due date')?.callback?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), '- [ ] Sample task #s');
	});

});

// ---------------------------------------------------------------------------
// openTask()
// ---------------------------------------------------------------------------

describe('openTaskFile()', () => {
	it('opens the file in a leaf', async () => {
		const { app } = makeView();
		const openFile = vi.fn(async () => {});
		app.workspace.getLeaf = vi.fn(() => ({ openFile, view: undefined }));

		await openTaskFile(app as never, makeTask({ file: new TFile('Notes/x.md') as never }));

		expect(openFile).toHaveBeenCalled();
	});

	it('positions the cursor when the opened leaf is a MarkdownView', async () => {
		const { app } = makeView();
		const setCursor = vi.fn();
		const scrollIntoView = vi.fn();
		const markdownView = Object.assign(new MarkdownView(), { editor: { setCursor, scrollIntoView } });
		app.workspace.getLeaf = vi.fn(() => ({ openFile: vi.fn(async () => {}), view: markdownView }));

		await openTaskFile(app as never, makeTask({ lineNumber: 5 }));

		expect(setCursor).toHaveBeenCalledWith({ line: 5, ch: 0 });
		expect(scrollIntoView).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Mobile layout (compact chips + tap-to-expand)
// ---------------------------------------------------------------------------

describe('mobile layout', () => {
	beforeEach(() => { Platform.isMobile = true; });
	afterEach(() => { Platform.isMobile = false; });

	it('collapses to title-only with a chevron and expands/collapses on tap', () => {
		const task = makeTask({ line: '- [ ] Sample task', dueDate: daysFromToday(0), priority: '🔺' });
		const { view, contentEl } = makeView({ importantPriorities: ['🔺'] }, [task]);
		priv(view).render();

		// Collapsed row shows only the title + a chevron — no metadata chips.
		expect(contentEl.findByClass('focus-first-chip')).toBeUndefined();
		expect(contentEl.findByClass('focus-first-expand-chevron')).toBeDefined();
		expect(contentEl.findByClass('focus-first-task-text')?.text).toBe('Sample task');

		const item = contentEl.findByClass('focus-first-task-item')!;
		// The hover popover must NOT be wired on mobile — otherwise touch's synthetic
		// mouse events move the detail out of the row and defeat tap-to-expand.
		expect(item.listeners['mouseenter']).toBeUndefined();
		expect(item.classList.contains('is-expanded')).toBe(false);
		item.dispatch('click');
		expect(item.classList.contains('is-expanded')).toBe(true);
		item.dispatch('click');
		expect(item.classList.contains('is-expanded')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// TriageView — the dedicated, separate triage view
// ---------------------------------------------------------------------------

function makeTriageView(settings: Partial<FocusFirstSettings> = {}, tasks: TaskItem[] = []) {
	const vault = {
		getAbstractFileByPath: (_path: string): InstanceType<typeof TFile> | null => null,
		read: vi.fn(async (_file: unknown) => ''),
		modify: vi.fn(async (_file: unknown, _content: string) => {}),
	};
	const app = { vault, workspace: {} };
	const leaf = { app };
	const plugin = { settings: { ...DEFAULT_SETTINGS, ...settings }, saveSettings: vi.fn(async () => {}) };
	// @ts-expect-error — stub leaf/plugin, not real Obsidian types
	const view = new TriageView(leaf, plugin);
	const contentEl = new FakeEl('div');
	contentEl.cls.add('focus-first-view');
	// @ts-expect-error — FakeEl stands in for the real HTMLElement contentEl
	view.contentEl = contentEl;
	// @ts-expect-error — assign tasks directly, bypassing scanTasks()
	view.tasks = tasks;
	return { view, plugin, app, contentEl };
}

interface TestableTriage {
	render(): void;
	refresh(): Promise<void>;
	triageScope: 'eisenhower' | 'valueEffort' | 'both';
}
function trg(view: unknown): TestableTriage { return view as TestableTriage; }

describe('TriageView', () => {
	it('has its own view type and inbox icon', () => {
		const { view } = makeTriageView();
		expect(view.getViewType()).toBe('put-first-things-first-triage-view');
		expect(view.getIcon()).toBe('inbox');
	});

	it('renders a scope dropdown and a search toggle, but no Add button', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] Bare' })]);
		trg(view).render();
		expect(contentEl.findByClass('focus-first-triage-scope')).toBeDefined();
		expect(contentEl.findByClass('focus-first-search-toggle')).toBeDefined();
		expect(contentEl.findByClass('focus-first-add-btn')).toBeUndefined();
	});

	it('has no date or size filter panel — search is text only', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] Bare' })]);
		trg(view).render();
		expect(contentEl.findByClass('focus-first-search-input')).toBeDefined();
		expect(contentEl.findByClass('focus-first-filter-panel')).toBeUndefined();
		expect(contentEl.findByClass('focus-first-size-filter-group')).toBeUndefined();
	});

	it('lists the tasks no system has classified (scope "both")', () => {
		const tasks = [
			makeTask({ line: '- [ ] Bare one', lineNumber: 0 }),
			makeTask({ line: '- [ ] Bare two', lineNumber: 1 }),
		];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'both';
		trg(view).render();
		expect(contentEl.findByClass('focus-first-triage-list')).toBeDefined();
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(2);
	});

	it('a task complete for Eisenhower still shows under "both" and "valueEffort", not "eisenhower"', () => {
		// Dated + prioritised: both Eisenhower axes filled, but no value/size.
		const tasks = [makeTask({ line: '- [ ] Half done', dueDate: daysFromToday(30), priority: '🔺' })];

		const eis = makeTriageView({}, tasks);
		trg(eis.view).triageScope = 'eisenhower';
		trg(eis.view).render();
		expect(eis.contentEl.findAllByClass('focus-first-task-item')).toHaveLength(0);

		const ve = makeTriageView({}, tasks);
		trg(ve.view).triageScope = 'valueEffort';
		trg(ve.view).render();
		expect(ve.contentEl.findAllByClass('focus-first-task-item')).toHaveLength(1);

		const both = makeTriageView({}, tasks);
		trg(both.view).triageScope = 'both';
		trg(both.view).render();
		expect(both.contentEl.findAllByClass('focus-first-task-item')).toHaveLength(1);
	});

	it('shows a calm empty state when nothing needs classifying', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ tags: ['#do'] })]);
		trg(view).triageScope = 'eisenhower';
		trg(view).render();
		expect(contentEl.findByClass('focus-first-triage-empty')).toBeDefined();
		expect(contentEl.findByClass('focus-first-triage-list')).toBeUndefined();
	});

	it('offers four slot buttons per system, eight in scope "both"', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] Bare' })]);
		trg(view).triageScope = 'both';
		trg(view).render();
		expect(contentEl.findAllByClass('focus-first-slot-btn')).toHaveLength(8);
	});

	it('clicking a slot button writes the target tag to the task line', async () => {
		const tasks = [makeTask({ line: '- [ ] Bare', lineNumber: 0 })];
		const { view, contentEl, app } = makeTriageView({}, tasks);
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Bare');
		trg(view).refresh = vi.fn(async () => {}); // don't fall through to real scanTasks
		trg(view).triageScope = 'eisenhower';
		trg(view).render();

		const doBtn = contentEl.findAllByClass('focus-first-slot-btn--do')[0]!;
		doBtn.dispatch('click', { stopPropagation: () => {} });
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.modify).toHaveBeenCalledWith(expect.anything(), '- [ ] Bare #do');
	});

	it('has no selection checkboxes or batch action bar (single-task triage only)', () => {
		const tasks = [
			makeTask({ line: '- [ ] One', lineNumber: 0 }),
			makeTask({ line: '- [ ] Two', lineNumber: 1 }),
		];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'both';
		trg(view).render();
		expect(contentEl.findAllByClass('focus-first-select-box')).toHaveLength(0);
		expect(contentEl.findByClass('focus-first-triage-actionbar')).toBeUndefined();
		expect(contentEl.findByClass('focus-first-triage-selectall')).toBeUndefined();
	});
});

describe('TriageView — interactions', () => {
	it('getDisplayText returns the triage view title', () => {
		const { view } = makeTriageView();
		expect(typeof view.getDisplayText()).toBe('string');
		expect(view.getDisplayText().length).toBeGreaterThan(0);
	});

	it('typing in the search box narrows the list', () => {
		const tasks = [
			makeTask({ line: '- [ ] Alpha thing', lineNumber: 0 }),
			makeTask({ line: '- [ ] Beta thing', lineNumber: 1 }),
		];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).render();
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(2);

		const input = contentEl.findByClass('focus-first-search-input')!;
		input.value = 'alpha';
		input.dispatch('input');
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(1);
	});

	it('a search matching nothing offers to clear, which restores the list', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] Alpha' })]);
		trg(view).render();
		const input = contentEl.findByClass('focus-first-search-input')!;
		input.value = 'zzz-no-match';
		input.dispatch('input');
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(0);
		const clear = contentEl.findByClass('focus-first-info-clear');
		expect(clear).toBeDefined();
		clear!.dispatch('click');
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(1);
	});

	it('the search toggle reveals and hides the search area', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] X' })]);
		trg(view).render();
		const area = contentEl.findByClass('focus-first-search-area')!;
		expect(area.classList.contains('focus-first-hidden')).toBe(true);
		contentEl.findByClass('focus-first-search-toggle')!.dispatch('click');
		expect(area.classList.contains('focus-first-hidden')).toBe(false);
	});

	it('the scope dropdown switches which tasks are shown', () => {
		// Complete for Eisenhower (date + priority), incomplete for Value/Effort (no size).
		const tasks = [makeTask({ line: '- [ ] Half done', dueDate: daysFromToday(30), priority: '🔺' })];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).render(); // default scope 'both' → still incomplete on VE → shown
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(1);
		const scope = contentEl.findByClass('focus-first-triage-scope')!;
		scope.value = 'eisenhower';
		scope.dispatch('change');
		expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(0);
	});

	it('a Value/Effort slot click writes both the value tag and the size tag', async () => {
		const tasks = [makeTask({ line: '- [ ] Bare', lineNumber: 0 })];
		const { view, contentEl, app } = makeTriageView({}, tasks);
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => '- [ ] Bare');
		trg(view).refresh = vi.fn(async () => {});
		trg(view).triageScope = 'valueEffort';
		trg(view).render();

		// Quick Wins (the "do" slot) = high value + low effort.
		contentEl.findAllByClass('focus-first-slot-btn--do')[0]!.dispatch('click', { stopPropagation: () => {} });
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.modify).toHaveBeenCalledTimes(1);
		const written = app.vault.modify.mock.calls[0]![1];
		expect(written).toContain('#highvalue');
		expect(written).toContain('#s');
	});

	it('on mobile, tapping a row expands its inline picker', () => {
		Platform.isMobile = true;
		try {
			const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] One' })]);
			trg(view).triageScope = 'eisenhower';
			trg(view).render();
			const row = contentEl.findByClass('focus-first-triage-item')!;
			expect(row.classList.contains('is-expanded')).toBe(false);
			row.dispatch('click');
			expect(row.classList.contains('is-expanded')).toBe(true);
		} finally {
			Platform.isMobile = false;
		}
	});
});

describe('TriageView — row signals and sorting', () => {
	it('shows badges for the properties already set (still shown: no size, so effort is open)', () => {
		const tasks = [makeTask({
			line: '- [ ] Rich task',
			priority: '🔺',
			dueDate: daysFromToday(2),
			tags: ['#lowvalue'],
		})];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).render();
		const badges = contentEl.findAllByClass('focus-first-triage-badge');
		// priority + due + value tag = 3 badges (no size on this task).
		expect(badges).toHaveLength(3);
		expect(badges.some((b) => b.text === '🔺')).toBe(true);
		expect(badges.some((b) => b.text.startsWith('📅'))).toBe(true);
		expect(badges.some((b) => b.text === '#lowvalue')).toBe(true);
	});

	it('a bare task shows no badges', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] Bare' })]);
		trg(view).render();
		expect(contentEl.findAllByClass('focus-first-triage-badge')).toHaveLength(0);
	});

	it('orders the rows by title, A to Z', () => {
		const tasks = [
			makeTask({ line: '- [ ] Charlie', lineNumber: 0 }),
			makeTask({ line: '- [ ] alpha', lineNumber: 1 }),
			makeTask({ line: '- [ ] Bravo', lineNumber: 2 }),
		];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).render();
		const titles = contentEl.findAllByClass('focus-first-task-text').map((el) => el.text);
		expect(titles).toEqual(['alpha', 'Bravo', 'Charlie']);
	});
});

describe('TriageView — current choice and post-assign hover', () => {
	it('marks the quadrant a system has already placed the task in, and only that one', () => {
		// Priority (important) + far-off due date = complete for Eisenhower (Schedule:
		// important, not urgent); no size, so Value/Effort is still open.
		const tasks = [makeTask({ line: '- [ ] Half done', priority: '🔺', dueDate: daysFromToday(60) })];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'both';
		trg(view).render();

		const current = contentEl.findAllByClass('is-current');
		expect(current).toHaveLength(1);
		expect(current[0]!.classList.contains('focus-first-slot-btn--schedule')).toBe(true);
	});

	it('marks nothing when neither system is fully placed', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] Bare' })]);
		trg(view).triageScope = 'both';
		trg(view).render();
		expect(contentEl.findAllByClass('is-current')).toHaveLength(0);
	});

	it('marks the Value/Effort quadrant a value tag + size resolve to', () => {
		// High value + small (low effort) = Quick Wins (the "do" slot): complete for
		// Value/Effort. No date/priority, so Eisenhower is open and it shows in "both".
		const tasks = [makeTask({ line: '- [ ] Valued', tags: ['#highvalue'], size: 'small' })];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'both';
		trg(view).render();
		const current = contentEl.findAllByClass('is-current');
		expect(current).toHaveLength(1);
		expect(current[0]!.classList.contains('focus-first-slot-btn--do')).toBe(true);
	});

	it('marks the quadrant an Eisenhower override tag pins, over the auto axes', () => {
		// #delegate pins the slot; the picker shows Delegate as the current choice.
		// No size, so Value/Effort stays open and the task still shows.
		const tasks = [makeTask({ line: '- [ ] Pinned', tags: ['#delegate'] })];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'both';
		trg(view).render();
		const current = contentEl.findAllByClass('is-current');
		expect(current).toHaveLength(1);
		expect(current[0]!.classList.contains('focus-first-slot-btn--delegate')).toBe(true);
	});

	it('puts the picker in a floating detail popover, like the matrix rows', () => {
		const { view, contentEl } = makeTriageView({}, [makeTask({ line: '- [ ] One' })]);
		trg(view).triageScope = 'eisenhower';
		trg(view).render();
		// The slot grid lives inside the shared .focus-first-task-detail popover.
		const detail = contentEl.findByClass('focus-first-triage-detail');
		expect(detail).toBeDefined();
		expect(detail!.classList.contains('focus-first-task-detail')).toBe(true);
		expect(detail!.findByClass('focus-first-slot-grid')).toBeDefined();
	});

	it('shows an instruction line in the picker, worded for the scope', () => {
		const one = makeTriageView({}, [makeTask({ line: '- [ ] One' })]);
		trg(one.view).triageScope = 'eisenhower';
		trg(one.view).render();
		const hintOne = one.contentEl.findByClass('focus-first-triage-hint');
		expect(hintOne?.text).toBe('Click the matching quadrant.');

		const both = makeTriageView({}, [makeTask({ line: '- [ ] One' })]);
		trg(both.view).triageScope = 'both';
		trg(both.view).render();
		const hintBoth = both.contentEl.findByClass('focus-first-triage-hint');
		expect(hintBoth?.text).toBe('Pick one per matrix.');
	});

	it('gives every row its own picker popover', () => {
		const tasks = [
			makeTask({ line: '- [ ] One', lineNumber: 0 }),
			makeTask({ line: '- [ ] Two', lineNumber: 1 }),
		];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'eisenhower';
		trg(view).render();
		expect(contentEl.findAllByClass('focus-first-triage-detail')).toHaveLength(2);
	});

	it('removes an open hover popover left on the view root when the list re-renders', () => {
		const tasks = [makeTask({ line: '- [ ] One', lineNumber: 0 })];
		const { view, contentEl } = makeTriageView({}, tasks);
		trg(view).triageScope = 'eisenhower';
		trg(view).render();

		// Simulate showTaskDetail having reparented an open popover onto the root.
		const stray = contentEl.createDiv({ cls: 'focus-first-triage-detail is-open' });
		expect(stray.classList.contains('is-open')).toBe(true);

		// Any re-render (here: a search keystroke) must drop the stray.
		const input = contentEl.findByClass('focus-first-search-input')!;
		input.value = '';
		input.dispatch('input');
		const open = contentEl.findAllByClass('focus-first-triage-detail').filter((el) => el.classList.contains('is-open'));
		expect(open).toHaveLength(0);
	});
});

describe('TriageView — changing an already-set quadrant', () => {
	it('re-classifies an Eisenhower task that already has a quadrant', async () => {
		// The task is already "Do" (marked current); clicking Schedule must save.
		let content = '- [ ] Task #do';
		const tasks = [makeTask({ line: '- [ ] Task #do', tags: ['#do'], lineNumber: 0 })];
		const { view, contentEl, app } = makeTriageView({}, tasks);
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => content);
		app.vault.modify = vi.fn(async (_f: unknown, c: string) => { content = c; });
		trg(view).refresh = vi.fn(async () => {}); // avoid re-scanning the stubbed vault
		trg(view).triageScope = 'both';
		trg(view).render();

		expect(contentEl.findAllByClass('is-current')[0]!.classList.contains('focus-first-slot-btn--do')).toBe(true);
		contentEl.findAllByClass('focus-first-slot-btn--schedule')[0]!.dispatch('click', { stopPropagation: () => {} });
		for (let i = 0; i < 6; i++) await Promise.resolve();

		expect(content).toContain('#schedule');
		expect(content).not.toContain('#do');
	});
});

describe('TriageView — both-scope sequential assignment', () => {
	it('setting one system then the other in the same popover keeps both writes', async () => {
		let content = '- [ ] Bare';
		const tasks = [makeTask({ line: '- [ ] Bare', lineNumber: 0 })];
		const { view, contentEl, app } = makeTriageView({}, tasks);
		app.vault.getAbstractFileByPath = () => new TFile('Notes/test.md');
		app.vault.read = vi.fn(async () => content);
		app.vault.modify = vi.fn(async (_f: unknown, c: string) => { content = c; });
		trg(view).refresh = vi.fn(async () => {}); // avoid re-scanning the stubbed vault
		trg(view).triageScope = 'both';
		trg(view).render();

		// Both matrices share the class names; [0] is Eisenhower, [1] is Value/Effort.
		const doBtns = contentEl.findAllByClass('focus-first-slot-btn--do');
		doBtns[0]!.dispatch('click', { stopPropagation: () => {} }); // Eisenhower → Do
		for (let i = 0; i < 6; i++) await Promise.resolve();
		doBtns[1]!.dispatch('click', { stopPropagation: () => {} }); // Value/Effort → Quick Wins
		for (let i = 0; i < 6; i++) await Promise.resolve();

		// The second assignment must not be dropped by the stale-line guard.
		expect(content).toContain('#do');
		expect(content).toContain('#highvalue');
		expect(content).toContain('#s');
	});
});

describe('TriageView — marking is independent of the global axis mode', () => {
	it('marks the Eisenhower override quadrant (#do) even when axisMode is valueEffort', () => {
		// Regression: currentSlots used explainTask, whose override is gated on
		// axisMode === 'eisenhower'. In Value/Effort mode a #do task was mis-marked
		// as Eliminate (the priority/date fallback), so setting Do looked like Eliminate.
		const tasks = [makeTask({ line: '- [ ] T #do', tags: ['#do'], lineNumber: 0 })];
		const { view, contentEl } = makeTriageView({ axisMode: 'valueEffort' }, tasks);
		trg(view).triageScope = 'both';
		trg(view).render();
		const current = contentEl.findAllByClass('is-current');
		expect(current).toHaveLength(1);
		expect(current[0]!.classList.contains('focus-first-slot-btn--do')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// focusKeyResolver — the stable key behind the manual focus order (#37)
// ---------------------------------------------------------------------------

describe('focusKeyResolver', () => {
	it('keys a task by file path and display title', () => {
		const keyOf = focusKeyResolver([makeTask({ line: '- [ ] Buy milk 🔺 #focus', lineNumber: 3 })]);
		expect(keyOf('Notes/test.md', 3)).toBe('Notes/test.md::Buy milk');
	});

	it('gives two tasks with the same title in one file distinct keys', () => {
		const keyOf = focusKeyResolver([
			makeTask({ line: '- [ ] A', lineNumber: 0 }),
			makeTask({ line: '- [ ] A', lineNumber: 7 }),
		]);
		expect(keyOf('Notes/test.md', 0)).toBe('Notes/test.md::A');
		expect(keyOf('Notes/test.md', 7)).toBe('Notes/test.md::A::2');
	});

	it('numbers repeats by line order, not by the order tasks were passed in', () => {
		const keyOf = focusKeyResolver([
			makeTask({ line: '- [ ] A', lineNumber: 9 }),
			makeTask({ line: '- [ ] A', lineNumber: 2 }),
		]);
		expect(keyOf('Notes/test.md', 2)).toBe('Notes/test.md::A');
		expect(keyOf('Notes/test.md', 9)).toBe('Notes/test.md::A::2');
	});

	it('resolves an unknown position to an empty key', () => {
		const keyOf = focusKeyResolver([makeTask({ line: '- [ ] A', lineNumber: 0 })]);
		expect(keyOf('Notes/other.md', 5)).toBe('');
	});
});

describe('capListHeight', () => {
	function list(rows: { cls: string; h: number }[]) {
		const el = new FakeEl('ul');
		for (const r of rows) {
			const li = el.createEl('li', { cls: r.cls });
			(li as unknown as { offsetHeight: number }).offsetHeight = r.h;
		}
		return el;
	}
	const item = (h = 30) => ({ cls: 'focus-first-task-item', h });
	const header = (h = 20) => ({ cls: 'focus-first-group-header', h });

	it('caps at the measured height of the first N task rows, headers included', () => {
		const el = list([header(), item(), item(40), item(), item(), item()]);
		capListHeight(el as unknown as HTMLElement, 4);
		expect(el.classList.contains('is-capped')).toBe(true);
		expect(el.style['--ff-list-max-height']).toBe('150px');
	});

	it('leaves a list alone when it fits, when the limit is 0, or when rows have no height', () => {
		for (const [rows, limit] of [[[item(), item()], 4], [[item(), item(), item()], 0], [[item(0), item(0), item(0)], 2]] as const) {
			const el = list([...rows]);
			capListHeight(el as unknown as HTMLElement, limit);
			expect(el.classList.contains('is-capped')).toBe(false);
		}
	});
});

// Replaces the retired matrix/axis tests with the four exclusive work areas.
describe('work board layout and exclusive placement', () => {
 it('keeps empty Focus visible with three drop slots and only three work areas', () => {
  const {view, contentEl} = makeView(); priv(view).render();
  expect(contentEl.findAllByClass('pftf-focus-empty-slot')).toHaveLength(3);
  expect(contentEl.findByClass('pftf-capacity-count')?.text).toBe('0 / 3');
  expect(contentEl.findAllByClass('pftf-board-lane')).toHaveLength(3);
  expect(contentEl.findByClass('focus-first-axis-select')).toBeUndefined();
  expect(contentEl.findByClass('focus-first-matrix')).toBeUndefined();
 });
 it('renders each open project once, preserving legacy work and delegated projects', () => {
  const tasks = ['#focus','#do','#schedule','#eliminate','#delegate',''].map((tag,i) => makeTask({ line: `- [ ] Project ${i} ${tag}`, tags: tag ? [tag] : [], lineNumber: i }));
  const {view,contentEl} = makeView({},tasks); priv(view).render();
  expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(6);
  expect(contentEl.findByClass('pftf-focus-board')?.findAllByClass('focus-first-task-item')).toHaveLength(1);
  expect(contentEl.findByClass('pftf-board-lane--work')?.findAllByClass('focus-first-task-item')).toHaveLength(3);
  expect(contentEl.findByClass('pftf-board-lane--urgent')?.findAllByClass('focus-first-task-item')).toHaveLength(1);
  expect(contentEl.findByClass('pftf-board-lane--delegate')?.findAllByClass('focus-first-task-item')).toHaveLength(1);
 });
 it('does not hide legacy focus overflow and shows the actual capacity count', () => {
  const tasks = [0,1,2,3].map(i => makeTask({ line: `- [ ] Project ${i} #focus`, tags:['#focus'], lineNumber:i }));
  const {view,contentEl}=makeView({focusTargetCount:2},tasks);priv(view).render();
  expect(contentEl.findByClass('pftf-capacity-count')?.text).toBe('4 / 2');
  expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(4);
  expect(contentEl.findByClass('pftf-board-notice')?.text).toContain('完整保留');
 });
 it('offers all other areas through the card move menu', () => {
  clearCreatedMenus(); const {view,contentEl}=makeView({},[makeTask()]);priv(view).render();
  contentEl.findByClass('pftf-card-move')?.dispatch('click',{stopPropagation:()=>{}});
  expect(createdMenus.at(-1)?.items.map(item => item.title)).toEqual(['移到 Focus','移到 Urgent','移到 Delegate']);
 });
 it('retains all drop targets when filtered and keeps hidden Focus in capacity accounting', () => {
  const {view,contentEl}=makeView({},[makeTask({tags:['#focus','#hide']})]);priv(view).render();
  expect(contentEl.findAllByClass('pftf-board-lane')).toHaveLength(3);
  expect(contentEl.findByClass('pftf-capacity-count')?.text).toBe('1 / 3');
  expect(contentEl.findAllByClass('focus-first-task-item')).toHaveLength(0);
 });
 it('ignores foreign or malformed drag payloads without starting a move', () => {
  const {view,contentEl}=makeView();priv(view).render();
  const event={preventDefault:()=>{},stopPropagation:()=>{},dataTransfer:{getData:()=>'{bad'}};
  expect(()=>contentEl.findByClass('pftf-board-lane--work')?.dispatch('drop',event)).not.toThrow();
 });
});


describe('board sorting persistence', () => {
	const tasks = ['A', 'B', 'C'].map((title, lineNumber) => makeTask({ line: `- [ ] ${title}`, lineNumber }));
	type SortableView = { moveTo(task: TaskItem, lane: 'work', anchor: TaskItem, after?: boolean): Promise<void> };

	it('reorders both ways without rewriting the source note', async () => {
		const { view, plugin, app } = makeView({}, tasks);
		vi.spyOn(view, 'refresh').mockResolvedValue();
		const sortable = view as unknown as SortableView;
		await sortable.moveTo(tasks[2]!, 'work', tasks[0]!);
		expect(plugin.settings.boardOrder).toEqual(['Notes/test.md::C', 'Notes/test.md::A', 'Notes/test.md::B']);
		await sortable.moveTo(tasks[2]!, 'work', tasks[1]!, true);
		expect(plugin.settings.boardOrder).toEqual(['Notes/test.md::A', 'Notes/test.md::B', 'Notes/test.md::C']);
		expect(app.vault.read).not.toHaveBeenCalled();
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
	});

	it('restores the previous order if saving fails', async () => {
		const original = ['Notes/test.md::A', 'Notes/test.md::B', 'Notes/test.md::C'];
		const { view, plugin } = makeView({ boardOrder: original }, tasks);
		const refresh = vi.spyOn(view, 'refresh').mockResolvedValue();
		plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
		await (view as unknown as SortableView).moveTo(tasks[2]!, 'work', tasks[0]!);
		expect(plugin.settings.boardOrder).toEqual(original);
		expect(refresh).toHaveBeenCalledOnce();
	});

	it('retains filtered tasks and unrelated lane keys when sorting', async () => {
		const { view, plugin } = makeView({ boardOrder: ['other.md::Urgent'] }, tasks);
		vi.spyOn(view, 'refresh').mockResolvedValue();
		await (view as unknown as SortableView).moveTo(tasks[2]!, 'work', tasks[0]!);
		expect(plugin.settings.boardOrder).toEqual(['Notes/test.md::C', 'Notes/test.md::A', 'Notes/test.md::B', 'other.md::Urgent']);
	});
});
