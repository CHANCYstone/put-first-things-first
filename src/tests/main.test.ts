import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';

vi.mock('obsidian', () => import('./__mocks__/obsidian'));

const { default: FocusFirstPlugin } = await import('../main');
const { TFile } = await import('./__mocks__/obsidian');
const { FOCUS_FIRST_VIEW_TYPE, FocusFirstView } = await import('../TaskView');
const { TriageView } = await import('../TriageView');
const { FocusDataBlock } = await import('../focusDataBlock');
const { WrappedTasksBlock } = await import('../wrappedTasksBlock');

// The real Workspace and MetadataCache always register listeners; the stub apps
// below only carry what each test needs, so `on` is supplied once for all of them.
const stubOn = () => ({}) as never;
const stubEvents = { on: stubOn };
const stubLayout = () => {};


// The obsidian mock's Plugin class records the last registered callbacks for
// inspection (lastViewCreator, lastSettingTab, lastRibbonCb, lastCommand).
// These don't exist on the real obsidian.Plugin type, so this cast gives test
// code access without `any`.
interface MockPluginExtras {
	lastViewCreator?: (leaf: unknown) => unknown;
	viewCreators?: Record<string, (leaf: unknown) => unknown>;
	lastSettingTab?: unknown;
	lastRibbonCb?: () => unknown;
	lastCommand?: { id: string; name: string; callback?: () => unknown };
	commands?: { id: string; name: string; callback?: () => unknown }[];
	lastCodeBlockLang?: string;
	lastCodeBlockProcessor?: (source: string, el: unknown, ctx: unknown) => unknown;
}

function withMockExtras(plugin: InstanceType<typeof FocusFirstPlugin>): MockPluginExtras {
	return plugin as unknown as MockPluginExtras;
}

function makePluginInstance() {
	const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
	const manifest = {};
	// @ts-expect-error — stub app/manifest, not real Obsidian types
	const plugin = new FocusFirstPlugin(app, manifest);
	plugin.settings = {
		...DEFAULT_SETTINGS,
		taskScope: 'folder',
		taskFolder: 'Custom',
		urgencyDays: 9,
		quadrants: { ...DEFAULT_SETTINGS.quadrants, do: { ...DEFAULT_SETTINGS.quadrants.do, color: '#ffffff' } },
	};
	return plugin;
}

describe('FocusFirstPlugin — resetSettings', () => {
	it('restores all settings to DEFAULT_SETTINGS values', async () => {
		const plugin = makePluginInstance();
		await plugin.resetSettings();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it('does not leave a shared reference with DEFAULT_SETTINGS.quadrants', async () => {
		const plugin = makePluginInstance();
		await plugin.resetSettings();
		plugin.settings.quadrants.do.color = '#000000';
		expect(DEFAULT_SETTINGS.quadrants.do.color).not.toBe('#000000');
	});

	it('persists the reset settings via saveSettings', async () => {
		const plugin = makePluginInstance();
		const saveSpy = vi.spyOn(plugin, 'saveSettings');
		await plugin.resetSettings();
		expect(saveSpy).toHaveBeenCalledOnce();
	});

	it('overwrites a custom taskFolder back to the default empty string', async () => {
		const plugin = makePluginInstance();
		expect(plugin.settings.taskFolder).toBe('Custom');
		await plugin.resetSettings();
		expect(plugin.settings.taskFolder).toBe('');
	});
});

// ---------------------------------------------------------------------------
// activateView
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — activateView', () => {
	it('reveals an existing leaf instead of creating a new one', async () => {
		const existingLeaf = { id: 'existing' };
		const revealLeaf = vi.fn();
		const getLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: () => [existingLeaf],
				getLeaf,
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };

		await plugin.activateView();

		expect(getLeaf).not.toHaveBeenCalled();
		expect(revealLeaf).toHaveBeenCalledWith(existingLeaf);
	});

	it('creates a new main-area tab and sets its view state when none exists', async () => {
		const newLeaf = { setViewState: vi.fn(async () => {}) };
		const revealLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: () => [],
				getLeaf: () => newLeaf,
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };

		await plugin.activateView();

		expect(newLeaf.setViewState).toHaveBeenCalledWith({ type: FOCUS_FIRST_VIEW_TYPE, active: true });
		expect(revealLeaf).toHaveBeenCalledWith(newLeaf);
	});

	it('does nothing when no leaf can be obtained', async () => {
		const revealLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: () => [],
				getLeaf: () => null,
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };

		await plugin.activateView();

		expect(revealLeaf).not.toHaveBeenCalled();
	});
});


describe('FocusFirstPlugin — activateTriageView', () => {
	it('reveals an existing triage leaf instead of creating one', async () => {
		const existingLeaf = { id: 'triage' };
		const revealLeaf = vi.fn();
		const getLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: (type: string) => (type === 'put-first-things-first-triage-view' ? [existingLeaf] : []),
				getLeaf,
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };

		await plugin.activateTriageView();

		expect(getLeaf).not.toHaveBeenCalled();
		expect(revealLeaf).toHaveBeenCalledWith(existingLeaf);
	});

	it('creates a new main-area tab with the triage view type when none exists', async () => {
		const newLeaf = { setViewState: vi.fn(async () => {}) };
		const revealLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: () => [],
				getLeaf: () => newLeaf,
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };

		await plugin.activateTriageView();

		expect(newLeaf.setViewState).toHaveBeenCalledWith({ type: 'put-first-things-first-triage-view', active: true });
		expect(revealLeaf).toHaveBeenCalledWith(newLeaf);
	});

	it('does nothing when no leaf can be obtained', async () => {
		const revealLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [], getLeaf: () => null, revealLeaf },
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };
		await plugin.activateTriageView();
		expect(revealLeaf).not.toHaveBeenCalled();
	});

	it('the open-triage command activates the triage view', async () => {
		const revealLeaf = vi.fn();
		const newLeaf = { setViewState: vi.fn(async () => {}) };
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [], getLeaf: () => newLeaf, revealLeaf },
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };
		await plugin.onload();
		const cmd = withMockExtras(plugin).commands?.find((c) => c.id === 'open-triage');
		expect(cmd).toBeDefined();
		await cmd?.callback?.();
		expect(revealLeaf).toHaveBeenCalledWith(newLeaf);
	});
});

// ---------------------------------------------------------------------------
// applyFontSize
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — applyFontSize', () => {
	it('sets the CSS scale variable on every Focus First view leaf', () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS, fontSize: 130 };

		const setProperty = vi.fn();
		// @ts-expect-error — stub leaf/plugin, not real Obsidian types
		const view = new FocusFirstView({ app }, plugin);
		view.contentEl.style.setProperty = setProperty;

		// @ts-expect-error — stub leaf, not a real WorkspaceLeaf
		plugin.app.workspace.getLeavesOfType = () => [{ view }];
		plugin.applyFontSize();

		expect(setProperty).toHaveBeenCalledWith('--focus-first-font-scale', '1.3');
	});

	it('ignores leaves whose view is not a FocusFirstView', () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [{ view: {} }] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS };

		expect(() => plugin.applyFontSize()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// onload
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — onload', () => {
	it('loads settings, registers the view, and applies font size without throwing', async () => {
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] },
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});

		await expect(plugin.onload()).resolves.toBeUndefined();
		expect(plugin.settings).toMatchObject(DEFAULT_SETTINGS);
		expect(plugin.settings.dailyLogStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('registers a view creator that builds a FocusFirstView', async () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		const extras = withMockExtras(plugin);
		const creator = extras.viewCreators?.['put-first-things-first-view'];
		expect(creator).toBeTypeOf('function');
		expect(creator?.({ app })).toBeInstanceOf(FocusFirstView);
	});

	it('registers a view creator that builds a TriageView', async () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		const creator = withMockExtras(plugin).viewCreators?.['put-first-things-first-triage-view'];
		expect(creator).toBeTypeOf('function');
		expect(creator?.({ app })).toBeInstanceOf(TriageView);
	});

	it('registers a settings tab', async () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		expect(withMockExtras(plugin).lastSettingTab).toBeDefined();
	});

	it('the ribbon icon callback opens daily planning by default', async () => {
		const revealLeaf = vi.fn();
		const getLeavesOfType = vi.fn(() => [{ id: 'existing' }]);
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType,
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		await withMockExtras(plugin).lastRibbonCb?.();

		expect(revealLeaf).toHaveBeenCalled();
		expect(getLeavesOfType).toHaveBeenCalledWith('pftf-daily-planning');
	});

	it('registers the "open-view" command whose callback activates the view', async () => {
		const revealLeaf = vi.fn();
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: () => [{ id: 'existing' }],
				revealLeaf,
			},
		};
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		const cmd = withMockExtras(plugin).commands?.find((c) => c.id === 'open-view');
		expect(cmd?.id).toBe('open-view');
		await cmd?.callback?.();

		expect(revealLeaf).toHaveBeenCalled();
	});

	it('registers the "add-task" command whose callback opens the quick-add dialog', async () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		const cmd = withMockExtras(plugin).commands?.find((c) => c.id === 'add-task');
		expect(cmd?.id).toBe('add-task');

		const openSpy = vi.spyOn(plugin, 'openQuickAdd').mockImplementation(() => {});
		cmd?.callback?.();
		expect(openSpy).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// focus-first-tasks code block processor
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — focus-first-tasks code block', () => {
	async function loadedPlugin() {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();
		return plugin;
	}

	function invoke(plugin: InstanceType<typeof FocusFirstPlugin>, source: string) {
		const el = { createEl: vi.fn() };
		const ctx = { addChild: vi.fn(), sourcePath: 'Note.md' };
		withMockExtras(plugin).lastCodeBlockProcessor?.(source, el, ctx);
		return { el, ctx };
	}

	it('registers the processor for the "focus-first-tasks" language', async () => {
		const plugin = await loadedPlugin();
		expect(withMockExtras(plugin).lastCodeBlockLang).toBe('focus-first-tasks');
	});

	it('renders a FocusDataBlock for a valid "show-focus" section', async () => {
		const plugin = await loadedPlugin();
		const { ctx, el } = invoke(plugin, 'show-focus do');
		expect(ctx.addChild).toHaveBeenCalledOnce();
		expect(ctx.addChild.mock.calls[0]?.[0]).toBeInstanceOf(FocusDataBlock);
		expect(el.createEl).not.toHaveBeenCalled();
	});

	it('shows an error message for an invalid "show-focus" value', async () => {
		const plugin = await loadedPlugin();
		const { ctx, el } = invoke(plugin, 'show-focus nope');
		expect(ctx.addChild).not.toHaveBeenCalled();
		expect(el.createEl).toHaveBeenCalledWith('p', expect.objectContaining({ cls: 'focus-first-tasks-missing' }));
	});

	it('wraps a Tasks query in a WrappedTasksBlock when no "show-focus" is given', async () => {
		const plugin = await loadedPlugin();
		const { ctx } = invoke(plugin, 'not done\ntags include #focus');
		expect(ctx.addChild).toHaveBeenCalledOnce();
		expect(ctx.addChild.mock.calls[0]?.[0]).toBeInstanceOf(WrappedTasksBlock);
	});
});

// ---------------------------------------------------------------------------
// onunload
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — onunload', () => {
	it('does not throw', () => {
		const app = { vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout, getLeavesOfType: () => [] } };
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		expect(() => plugin.onunload()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// openQuickAdd / quickAddViaTasks / refreshViews
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — quick add', () => {
	async function flush() {
		for (let i = 0; i < 30; i++) await Promise.resolve();
	}

	function makeApp(opts: {
		tasksApi?: { createTaskLineModal: () => Promise<string> };
		activePath?: string | null;
		files?: Record<string, string>;
	}) {
		const store = { ...(opts.files ?? {}) };
		const plugins = opts.tasksApi
			? { plugins: { 'obsidian-tasks-plugin': { apiV1: opts.tasksApi } } }
			: { plugins: {} };
		return {
			store,
			app: {
				plugins,
				metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
					getActiveFile: () => (opts.activePath ? { path: opts.activePath } : null),
					getLeavesOfType: () => [],
				},
				vault: {
					getAbstractFileByPath: (p: string) => (p in store ? new TFile(p) : null),
					read: vi.fn(async (f: { path: string }) => store[f.path] ?? ''),
					modify: vi.fn(async (f: { path: string }, c: string) => { store[f.path] = c; }),
					create: vi.fn(async (p: string, c: string) => { store[p] = c; }),
					createFolder: vi.fn(async () => {}),
				},
			},
		};
	}

	function makePlugin(app: unknown, settings = {}) {
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		plugin.settings = { ...DEFAULT_SETTINGS, quickAddTarget: 'inbox', quickAddInbox: 'Inbox.md', ...settings };
		return plugin;
	}

	it('uses the Tasks create dialog and appends its result when the plugin is present', async () => {
		const { app, store } = makeApp({
			tasksApi: { createTaskLineModal: () => Promise.resolve('Write report 📅 2026-07-10') },
			files: { 'Inbox.md': '' },
		});
		makePlugin(app).openQuickAdd();
		await flush();
		expect(store['Inbox.md']).toBe('- [ ] Write report 📅 2026-07-10\n');
	});

	it('does nothing when the Tasks create dialog is cancelled (empty string)', async () => {
		const { app } = makeApp({
			tasksApi: { createTaskLineModal: () => Promise.resolve('') },
			files: { 'Inbox.md': '' },
		});
		makePlugin(app).openQuickAdd();
		await flush();
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it('falls back to the built-in modal when the Tasks plugin is absent', () => {
		const { app } = makeApp({ files: { 'Inbox.md': '' } });
		expect(() => makePlugin(app).openQuickAdd()).not.toThrow();
		// No task written yet — the modal is open awaiting input.
		expect(app.vault.modify).not.toHaveBeenCalled();
	});

	it('refreshViews refreshes open Focus First views (matrix + triage) and ignores other leaves', () => {
		const refreshed: unknown[] = [];
		const focusView = Object.create(FocusFirstView.prototype) as { refresh: () => Promise<void> };
		focusView.refresh = () => { refreshed.push(focusView); return Promise.resolve(); };
		const triageView = Object.create(TriageView.prototype) as { refresh: () => Promise<void> };
		triageView.refresh = () => { refreshed.push(triageView); return Promise.resolve(); };
		const app = {
			vault: { on: stubOn }, metadataCache: stubEvents, workspace: { on: stubOn, onLayoutReady: stubLayout,
				getLeavesOfType: (type: string) =>
					type === 'put-first-things-first-view' ? [{ view: focusView }, { view: {} }]
						: type === 'put-first-things-first-triage-view' ? [{ view: triageView }]
							: [],
			},
		};
		const plugin = makePlugin(app);
		plugin.refreshViews();
		expect(refreshed).toEqual([focusView, triageView]);
	});
});

// ---------------------------------------------------------------------------
// Calendar plugin integration
// ---------------------------------------------------------------------------

describe('FocusFirstPlugin — Calendar plugin integration', () => {
	/** A stub app that records the listeners onload registers, plus a Calendar view. */
	function makeCalendarApp() {
		const handlers = new Map<string, (...args: never[]) => unknown>();
		const view = {
			calendar: { tick: vi.fn() },
			contentEl: { style: { setProperty: vi.fn() } },
			onOpen: vi.fn(() => Promise.resolve()),
			onClose: vi.fn(() => Promise.resolve()),
		};
		let calendarOpen = false;
		return {
			handlers,
			view,
			openCalendar: () => { calendarOpen = true; },
			app: {
				workspace: {
					onLayoutReady: stubLayout,
					on: (name: string, cb: (...args: never[]) => unknown) => { handlers.set(name, cb); return { name }; },
					getLeavesOfType: (type: string) =>
						(type === 'calendar' && calendarOpen ? [{ view }] : []),
				},
				metadataCache: {
					on: (name: string, cb: (...args: never[]) => unknown) => { handlers.set(`meta:${name}`, cb); return { name }; },
					getFileCache: () => null,
				},
				vault: { on: stubOn, getMarkdownFiles: () => [] },
			},
		};
	}

	it('hands Calendar a working source, which answers from the matrix', async () => {
		const { app, handlers } = makeCalendarApp();
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();

		const sources: { getDailyMetadata(d: { format(): string }): Promise<unknown> }[] = [];
		handlers.get('calendar:open')?.(sources as never);

		expect(sources).toHaveLength(1);
		await expect(sources[0]?.getDailyMetadata({ format: () => '2026-09-20' })).resolves.toEqual({
			classes: [], dataAttributes: {}, dots: [],
		});
	});

	it('paints the configured quadrant colours onto an open Calendar view', async () => {
		const { app, handlers, view, openCalendar } = makeCalendarApp();
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();
		plugin.settings.quadrants.do.color = '#123456';
		openCalendar();

		handlers.get('calendar:open')?.([] as never);

		expect(view.contentEl.style.setProperty).toHaveBeenCalledWith('--ff-quadrant-do', '#123456');
	});

	it('redraws Calendar when a note changes, which Calendar itself would not notice', async () => {
		const { app, handlers, view, openCalendar } = makeCalendarApp();
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();
		openCalendar();

		handlers.get('meta:changed')?.();

		expect(view.calendar.tick).toHaveBeenCalled();
	});

	it('refreshViews reaches the calendar too', async () => {
		const { app, view, openCalendar } = makeCalendarApp();
		// @ts-expect-error — stub app/manifest, not real Obsidian types
		const plugin = new FocusFirstPlugin(app, {});
		await plugin.onload();
		openCalendar();

		plugin.refreshViews();

		expect(view.calendar.tick).toHaveBeenCalled();
	});
});
