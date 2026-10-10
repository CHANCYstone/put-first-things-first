import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, FocusFirstSettings, TaskScope, Priority, FolderSuggest, FileSuggest } from '../settings';
import type { FocusFirstSettingTab as FocusFirstSettingTabType } from '../settings';
import { createdSettings, clearCreatedSettings, TFolder, TFile, FakeDomEl, Setting } from './__mocks__/obsidian';
import type { DropdownComponent, TextComponent } from './__mocks__/obsidian';

// Access helpers for the fake DOM elements the mock exposes on settingEl/controlEl.
interface FakeEl {
	text: string;
	children: FakeEl[];
	classList: { contains(c: string): boolean };
	findByClass(cls: string): FakeEl | undefined;
	dispatch(event: string, e?: unknown): void;
}
const asFakeEl = (el: unknown) => el as FakeEl;

// ---------------------------------------------------------------------------
// Unit tests — DEFAULT_SETTINGS
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS', () => {
	it('sets taskScope to "all"', () => {
		expect(DEFAULT_SETTINGS.taskScope).toBe('all');
	});

	it('sets taskFolder to an empty string', () => {
		expect(DEFAULT_SETTINGS.taskFolder).toBe('');
	});
});

// ---------------------------------------------------------------------------
// Unit tests — settings shape
// ---------------------------------------------------------------------------

describe('FocusFirstSettings type contract', () => {
	it('accepts scope "all" with no folder', () => {
		const s: FocusFirstSettings = { ...DEFAULT_SETTINGS, taskScope: 'all', taskFolder: '' };
		expect(s.taskScope).toBe('all');
	});

	it('accepts scope "folder" with a folder path', () => {
		const s: FocusFirstSettings = { ...DEFAULT_SETTINGS, taskScope: 'folder', taskFolder: 'Work/Tasks' };
		expect(s.taskScope).toBe('folder');
		expect(s.taskFolder).toBe('Work/Tasks');
	});
});

// ---------------------------------------------------------------------------
// Integration tests — FocusFirstSettingTab rendering & persistence
// ---------------------------------------------------------------------------

// We need to mock `obsidian` before importing SettingTab
vi.mock('obsidian', () => import('./__mocks__/obsidian'));

// Re-import AFTER mock is registered so the module uses the stub
const { FocusFirstSettingTab } = await import('../settings');
// i18n imports from obsidian too, so it also has to come after the mock. Tests
// below compare against t() rather than hard-coded English, so rewording a
// label stays a one-place change.
const { t } = await import('../i18n');

function makePlugin(overrides: Partial<FocusFirstSettings> = {}) {
	// Deep-copy nested objects so tests can't mutate DEFAULT_SETTINGS via shared references
	const settings: FocusFirstSettings = {
		...DEFAULT_SETTINGS,
		quadrants: {
			do:       { ...DEFAULT_SETTINGS.quadrants.do,       sort: { ...DEFAULT_SETTINGS.quadrants.do.sort } },
			schedule: { ...DEFAULT_SETTINGS.quadrants.schedule, sort: { ...DEFAULT_SETTINGS.quadrants.schedule.sort } },
			delegate: { ...DEFAULT_SETTINGS.quadrants.delegate, sort: { ...DEFAULT_SETTINGS.quadrants.delegate.sort } },
			eliminate:{ ...DEFAULT_SETTINGS.quadrants.eliminate,sort: { ...DEFAULT_SETTINGS.quadrants.eliminate.sort } },
		},
		...overrides,
	};
	const saved: FocusFirstSettings[] = [];

	const plugin = {
		settings,
		app: {
			vault: {
				getAllLoadedFiles: () => [],
			},
		},
		saveSettings: vi.fn(async () => {
			saved.push({ ...plugin.settings });
		}),
		applyFontSize: vi.fn(),
		refreshViews: vi.fn(),
		_saved: saved,
	};
	return plugin;
}

function makeTab(plugin: ReturnType<typeof makePlugin>): FocusFirstSettingTabType {
	// @ts-expect-error — stub app, not a real Obsidian App
	const tab = new FocusFirstSettingTab(plugin.app, plugin);
	// A real FakeDomEl rather than a hand-rolled stub, so code that walks up from
	// a Setting to its container (to insert an error line or a quadrant body next
	// to the row) finds a traversable node, the way it does in Obsidian itself.
	tab.containerEl = new FakeDomEl() as unknown as HTMLElement;
	return tab;
}

describe('FocusFirstSettingTab — scope dropdown', () => {
	it('calls display() without throwing when scope is "all"', () => {
		const plugin = makePlugin({ taskScope: 'all' });
		const tab = makeTab(plugin);
		expect(() => tab.display()).not.toThrow();
	});

	it('calls display() without throwing when scope is "folder"', () => {
		const plugin = makePlugin({ taskScope: 'folder', taskFolder: 'Notes' });
		const tab = makeTab(plugin);
		expect(() => tab.display()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Integration tests — saveSettings is called when values change
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — persistence', () => {
	let plugin: ReturnType<typeof makePlugin>;

	beforeEach(() => {
		plugin = makePlugin({ taskScope: 'all', taskFolder: '' });
	});

	it('persists taskScope when the dropdown changes', async () => {
		// Directly mutate as the setting tab would and call saveSettings
		plugin.settings.taskScope = 'folder';
		await plugin.saveSettings();

		expect(plugin.saveSettings).toHaveBeenCalledOnce();
		expect(plugin._saved[0]?.taskScope).toBe('folder');
	});

	it('persists taskFolder when the text input changes', async () => {
		plugin.settings.taskScope = 'folder';
		plugin.settings.taskFolder = 'Projects/Work';
		await plugin.saveSettings();

		expect(plugin._saved[0]?.taskFolder).toBe('Projects/Work');
	});

	it('persists multiple changes independently', async () => {
		plugin.settings.taskScope = 'folder';
		await plugin.saveSettings();

		plugin.settings.taskFolder = 'Archive';
		await plugin.saveSettings();

		expect(plugin._saved).toHaveLength(2);
		expect(plugin._saved[1]?.taskFolder).toBe('Archive');
	});

	it('switching back to "all" does not lose other settings', async () => {
		plugin.settings.taskScope = 'folder';
		plugin.settings.taskFolder = 'Work';
		await plugin.saveSettings();

		plugin.settings.taskScope = 'all';
		await plugin.saveSettings();

		expect(plugin._saved[1]?.taskScope).toBe('all');
		expect(plugin._saved[1]?.taskFolder).toBe('Work'); // folder value preserved
	});
});

// ---------------------------------------------------------------------------
// Unit tests — urgencyDays
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — urgencyDays', () => {
	it('defaults to 3 days', () => {
		expect(DEFAULT_SETTINGS.urgencyDays).toBe(3);
	});
});

describe('urgencyDays — validation logic', () => {
	function isValid(value: number): boolean {
		return !isNaN(value) && value >= 0 && value < 365;
	}

	it('accepts 0', () => expect(isValid(0)).toBe(true));
	it('accepts 3 (default)', () => expect(isValid(3)).toBe(true));
	it('accepts 364 (max allowed)', () => expect(isValid(364)).toBe(true));
	it('rejects 365', () => expect(isValid(365)).toBe(false));
	it('rejects negative numbers', () => expect(isValid(-1)).toBe(false));
	it('rejects NaN', () => expect(isValid(NaN)).toBe(false));
});

describe('urgencyDays persistence', () => {
	it('saves a custom urgency threshold', async () => {
		const plugin = makePlugin();
		plugin.settings.urgencyDays = 7;
		await plugin.saveSettings();
		expect(plugin._saved[0]?.urgencyDays).toBe(7);
	});

	it('saves 0 (always urgent)', async () => {
		const plugin = makePlugin();
		plugin.settings.urgencyDays = 0;
		await plugin.saveSettings();
		expect(plugin._saved[0]?.urgencyDays).toBe(0);
	});

	it('saves 364 (maximum allowed value)', async () => {
		const plugin = makePlugin();
		plugin.settings.urgencyDays = 364;
		await plugin.saveSettings();
		expect(plugin._saved[0]?.urgencyDays).toBe(364);
	});
});

// ---------------------------------------------------------------------------
// Unit tests — importantPriorities
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — importantPriorities', () => {
	it('defaults to Highest and High', () => {
		expect(DEFAULT_SETTINGS.importantPriorities).toEqual(['🔺', '⏫']);
	});
});

describe('importantPriorities — pill toggle logic', () => {
	it('adds a priority when not present', () => {
		const current: Priority[] = ['🔺'];
		const result = current.concat('🔼' as Priority);
		expect(result).toContain('🔼');
	});

	it('removes a priority when already active', () => {
		const current = ['🔺', '⏫'] as Priority[];
		const result = current.filter((p) => p !== '⏫');
		expect(result).not.toContain('⏫');
		expect(result).toContain('🔺');
	});

	it('reports empty when all are deselected', () => {
		const result: Priority[] = [];
		expect(result.length === 0).toBe(true);
	});

	it('accepts all available priority values', () => {
		const all: Priority[] = ['🔺', '⏫', '🔼', '🔽', '⏬'];
		expect(all).toHaveLength(5);
	});
});

describe('importantPriorities persistence', () => {
	it('saves an added priority', async () => {
		const plugin = makePlugin();
		plugin.settings.importantPriorities = ['🔺', '⏫', '🔼'];
		await plugin.saveSettings();
		expect(plugin._saved[0]?.importantPriorities).toContain('🔼');
	});

	it('saves a removed priority', async () => {
		const plugin = makePlugin();
		plugin.settings.importantPriorities = ['🔺'];
		await plugin.saveSettings();
		expect(plugin._saved[0]?.importantPriorities).not.toContain('⏫');
	});

	it('saves an empty list', async () => {
		const plugin = makePlugin();
		plugin.settings.importantPriorities = [];
		await plugin.saveSettings();
		expect(plugin._saved[0]?.importantPriorities).toHaveLength(0);
	});

	it('saves all priority values', async () => {
		const plugin = makePlugin();
		const all: Priority[] = ['🔺', '⏫', '🔼', '🔽', '⏬'];
		plugin.settings.importantPriorities = all;
		await plugin.saveSettings();
		expect(plugin._saved[0]?.importantPriorities).toEqual(all);
	});
});

// ---------------------------------------------------------------------------
// Integration tests — loadSettings merges with defaults
// ---------------------------------------------------------------------------

describe('loadSettings — merges persisted data with defaults', () => {
	it('fills missing keys from DEFAULT_SETTINGS', () => {
		// Simulate what loadSettings does: Object.assign({}, DEFAULT_SETTINGS, persisted)
		const persisted = { taskScope: 'folder' as TaskScope };
		const merged: FocusFirstSettings = Object.assign({}, DEFAULT_SETTINGS, persisted);

		expect(merged.taskScope).toBe('folder');
		expect(merged.taskFolder).toBe('');  // filled from defaults
		expect(merged.urgencyDays).toBe(3);  // filled from defaults
	});

	it('fully persisted data overrides all defaults', () => {
		const persisted: FocusFirstSettings = {
			taskScope: 'folder',
			taskFolder: 'MyFolder',
			showSubtasks: false,
			urgencyDays: 7,
			importantPriorities: ['🔺'],
			quadrants: {
				do:       { tag: '#do',       color: '#e03131', sort: { primary: 'priority', secondary: 'dueDate' } },
				schedule: { tag: '#schedule', color: '#1971c2', sort: { primary: 'dueDate',  secondary: 'priority' } },
				delegate: { tag: '#delegate', color: '#e8590c', sort: { primary: 'dueDate',  secondary: 'priority' } },
				eliminate:{ tag: '#eliminate',color: '#868e96', sort: { primary: 'priority', secondary: 'alpha'    } },
			},
			groupByPrimary: false,
			focusTag: '#focus',
			focusTargetCount: 3,
			focusOrder: ['Work/a.md::Pitch schreiben'],
			hideTag: '#hide',
			sizeTags: { small: '#s', medium: '#m', large: '#l' },
			axisMode: 'valueEffort',
			valueSource: 'manualTag',
			highValueTag: '#highvalue',
			lowValueTag: '#lowvalue',
			lowEffortSizes: ['small', 'medium'],
			staleDays: 10,
			progressHeading: 'Log',
			notesFolder: 'Tasks/Notes',
			archiveFolder: 'Archive',
			reviewHeading: 'Retro',
			quickAddTarget: 'active',
			quickAddInbox: 'Tasks/Inbox.md',
			showWhyHere: false,
			quadrantLimit: 6,
			fontSize: 120,
			tasksPluginWarningDismissed: true,
			calendar: { enabled: false, showDue: false, showProgress: true, maxDots: 5 },
		};
		const merged = Object.assign({}, DEFAULT_SETTINGS, persisted);

		expect(merged).toEqual(persisted);
	});

	it('empty persisted object returns all defaults', () => {
		const merged = Object.assign({}, DEFAULT_SETTINGS, {});
		expect(merged).toEqual(DEFAULT_SETTINGS);
	});
});

// ---------------------------------------------------------------------------
// Helpers for onChange callback tests
// ---------------------------------------------------------------------------

function makeTabWithDisplay(overrides: Partial<FocusFirstSettings> = {}) {
	const plugin = makePlugin(overrides);
	const tab = makeTab(plugin);
	clearCreatedSettings();
	tab.display();
	return { plugin, tab };
}

// Find the single dropdown created during display()
function scopeDropdown(): DropdownComponent | undefined {
	return createdSettings.find((s) => s.lastDropdown)?.lastDropdown;
}

// Find a text input by its initial value
function textByValue(value: string): TextComponent | undefined {
	return createdSettings.find((s) => s.lastText?.inputEl.value === value)?.lastText;
}

// ---------------------------------------------------------------------------
// onChange — scope dropdown
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — scope dropdown onChange', () => {
	it('sets taskScope to "folder" and saves', async () => {
		const { plugin } = makeTabWithDisplay({ taskScope: 'all' });
		await scopeDropdown()?.simulate('folder');
		expect(plugin.settings.taskScope).toBe('folder');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it('sets taskScope back to "all" and saves', async () => {
		const { plugin } = makeTabWithDisplay({ taskScope: 'folder', taskFolder: 'Work' });
		await scopeDropdown()?.simulate('all');
		expect(plugin.settings.taskScope).toBe('all');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it('toggles the folder field visibility without re-rendering the tab', async () => {
		makeTabWithDisplay({ taskScope: 'all' });
		const folderSetting = createdSettings.find((s) => s.settingEl.classList.contains('focus-first-hidden'));
		// The folder field starts hidden while the scope is "all".
		expect(folderSetting).toBeDefined();

		await scopeDropdown()?.simulate('folder');
		expect(folderSetting?.settingEl.classList.contains('focus-first-hidden')).toBe(false);

		await scopeDropdown()?.simulate('all');
		expect(folderSetting?.settingEl.classList.contains('focus-first-hidden')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// onChange — folder text input
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — folder text onChange', () => {
	it('saves a non-empty folder path', async () => {
		const { plugin } = makeTabWithDisplay({ taskScope: 'folder', taskFolder: '' });
		const folderText = textByValue('');
		await folderText?.simulate('Work/Tasks');
		expect(plugin.settings.taskFolder).toBe('Work/Tasks');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it('saves an empty folder path (user cleared the input)', async () => {
		const { plugin } = makeTabWithDisplay({ taskScope: 'folder', taskFolder: 'Work' });
		const folderText = textByValue('Work');
		await folderText?.simulate('');
		expect(plugin.settings.taskFolder).toBe('');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Unit tests — focusTag default
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — focusTag', () => {
	it('defaults to "#focus"', () => {
		expect(DEFAULT_SETTINGS.focusTag).toBe('#focus');
	});
});

// ---------------------------------------------------------------------------
// Unit tests — groupByPrimary default
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — groupByPrimary', () => {
	it('defaults to true', () => {
		expect(DEFAULT_SETTINGS.groupByPrimary).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Unit tests — quadrant defaults
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — quadrant structure', () => {
	it('has all four quadrants', () => {
		const keys = Object.keys(DEFAULT_SETTINGS.quadrants);
		expect(keys).toEqual(expect.arrayContaining(['do', 'schedule', 'delegate', 'eliminate']));
		expect(keys).toHaveLength(4);
	});

	it('each quadrant has tag, color, and sort fields', () => {
		for (const key of ['do', 'schedule', 'delegate', 'eliminate'] as const) {
			const q = DEFAULT_SETTINGS.quadrants[key];
			expect(typeof q.tag).toBe('string');
			expect(typeof q.color).toBe('string');
			expect(typeof q.sort.primary).toBe('string');
			expect(typeof q.sort.secondary).toBe('string');
		}
	});

	it('default tags match quadrant keys prefixed with #', () => {
		expect(DEFAULT_SETTINGS.quadrants.do.tag).toBe('#do');
		expect(DEFAULT_SETTINGS.quadrants.schedule.tag).toBe('#schedule');
		expect(DEFAULT_SETTINGS.quadrants.delegate.tag).toBe('#delegate');
		expect(DEFAULT_SETTINGS.quadrants.eliminate.tag).toBe('#eliminate');
	});

	it('default colors are valid hex strings', () => {
		const hexColor = /^#[0-9a-f]{6}$/i;
		for (const key of ['do', 'schedule', 'delegate', 'eliminate'] as const) {
			expect(DEFAULT_SETTINGS.quadrants[key].color).toMatch(hexColor);
		}
	});

	it('"do" quadrant defaults to red (#c92a2a)', () => {
		expect(DEFAULT_SETTINGS.quadrants.do.color).toBe('#c92a2a');
	});

	it('"schedule" quadrant defaults to blue (#1864ab)', () => {
		expect(DEFAULT_SETTINGS.quadrants.schedule.color).toBe('#1864ab');
	});

	it('"delegate" quadrant defaults to amber (#e67700)', () => {
		expect(DEFAULT_SETTINGS.quadrants.delegate.color).toBe('#e67700');
	});

	it('"eliminate" quadrant defaults to neutral gray (#868e96, readable in dark mode)', () => {
		expect(DEFAULT_SETTINGS.quadrants.eliminate.color).toBe('#868e96');
	});

	it('all quadrant colors are distinct', () => {
		const quadrantKeys = ['do', 'schedule', 'delegate', 'eliminate'] as const;
		const colors = quadrantKeys.map((key) => DEFAULT_SETTINGS.quadrants[key].color);
		const unique = new Set(colors);
		expect(unique.size).toBe(colors.length);
	});

	it('all quadrant colors are valid hex values', () => {
		for (const key of ['do', 'schedule', 'delegate', 'eliminate'] as const) {
			expect(DEFAULT_SETTINGS.quadrants[key].color).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it('"do" quadrant sorts by dueDate first, then priority', () => {
		expect(DEFAULT_SETTINGS.quadrants.do.sort.primary).toBe('dueDate');
		expect(DEFAULT_SETTINGS.quadrants.do.sort.secondary).toBe('priority');
	});

	it('"schedule" quadrant sorts by priority first, then dueDate', () => {
		expect(DEFAULT_SETTINGS.quadrants.schedule.sort.primary).toBe('priority');
		expect(DEFAULT_SETTINGS.quadrants.schedule.sort.secondary).toBe('dueDate');
	});

	it('"delegate" quadrant sorts by dueDate first, then priority', () => {
		expect(DEFAULT_SETTINGS.quadrants.delegate.sort.primary).toBe('dueDate');
		expect(DEFAULT_SETTINGS.quadrants.delegate.sort.secondary).toBe('priority');
	});

	it('"eliminate" quadrant sorts by alphabetical first, then priority', () => {
		expect(DEFAULT_SETTINGS.quadrants.eliminate.sort.primary).toBe('alpha');
		expect(DEFAULT_SETTINGS.quadrants.eliminate.sort.secondary).toBe('priority');
	});

	it('primary and secondary sort defaults are different for every quadrant', () => {
		for (const key of ['do', 'schedule', 'delegate', 'eliminate'] as const) {
			const { primary, secondary } = DEFAULT_SETTINGS.quadrants[key].sort;
			expect(primary).not.toBe(secondary);
		}
	});
});

// ---------------------------------------------------------------------------
// onChange — focusTag text input
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — focusTag onChange', () => {
	it('saves a custom focus tag', async () => {
		const { plugin } = makeTabWithDisplay();
		await textByValue('#focus')?.simulate('#star');
		expect(plugin.settings.focusTag).toBe('#star');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it('saves an empty string (disabling focus tag)', async () => {
		const { plugin } = makeTabWithDisplay();
		await textByValue('#focus')?.simulate('');
		expect(plugin.settings.focusTag).toBe('');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it('trims whitespace from the saved focus tag', async () => {
		const { plugin } = makeTabWithDisplay();
		await textByValue('#focus')?.simulate('  #highlight  ');
		expect(plugin.settings.focusTag).toBe('#highlight');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// onChange — hideTag text input
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — hideTag onChange', () => {
	it('saves a custom, trimmed hide tag', async () => {
		const { plugin } = makeTabWithDisplay();
		await textByValue('#hide')?.simulate('  #versteckt  ');
		expect(plugin.settings.hideTag).toBe('#versteckt');
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Unit tests — DEFAULT_SETTINGS importantPriorities
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — importantPriorities', () => {
	it('defaults to highest and high priority', () => {
		expect(DEFAULT_SETTINGS.importantPriorities).toEqual(['🔺', '⏫']);
	});

	it('contains only valid priority emoji', () => {
		const valid = new Set(['🔺', '⏫', '🔼', '🔽', '⏬']);
		for (const p of DEFAULT_SETTINGS.importantPriorities) {
			expect(valid.has(p)).toBe(true);
		}
	});

	it('has no duplicates', () => {
		const set = new Set(DEFAULT_SETTINGS.importantPriorities);
		expect(set.size).toBe(DEFAULT_SETTINGS.importantPriorities.length);
	});
});

// ---------------------------------------------------------------------------
// Unit tests — DEFAULT_SETTINGS shape completeness
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Quadrant color picker — input event + reset button
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Font size slider onChange
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — font size slider', () => {
	it('saves the value and re-applies the font size on change', async () => {
		const { plugin } = makeTabWithDisplay();
		const slider = createdSettings.find((s) => s.lastSlider)?.lastSlider;
		expect(slider).toBeDefined();

		await slider?.simulate(130);

		expect(plugin.settings.fontSize).toBe(130);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(plugin.applyFontSize).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// FolderSuggest
// ---------------------------------------------------------------------------

describe('FolderSuggest', () => {
	const inputStub = () => ({ value: '', trigger: vi.fn() });

	it('getSuggestions returns only matching folders (not files)', () => {
		const app = {
			vault: {
				getAllLoadedFiles: () => [new TFolder('Work'), new TFolder('Work/Tasks'), new TFile('note.md')],
			},
		};
		const fs = new FolderSuggest(app as never, inputStub() as unknown as HTMLInputElement);
		expect(fs.getSuggestions('work').map((f) => f.path)).toEqual(['Work', 'Work/Tasks']);
	});

	it('renderSuggestion writes the folder path into the element', () => {
		const fs = new FolderSuggest(
			{ vault: { getAllLoadedFiles: () => [] } } as never,
			inputStub() as unknown as HTMLInputElement,
		);
		const el = { setText: vi.fn() };
		fs.renderSuggestion(new TFolder('Projects') as never, el as unknown as HTMLElement);
		expect(el.setText).toHaveBeenCalledWith('Projects');
	});

	it('selectSuggestion fills the input and triggers an input event', () => {
		const input = inputStub();
		const fs = new FolderSuggest(
			{ vault: { getAllLoadedFiles: () => [] } } as never,
			input as unknown as HTMLInputElement,
		);
		fs.selectSuggestion(new TFolder('Work/Tasks') as never);
		expect(input.value).toBe('Work/Tasks');
		expect(input.trigger).toHaveBeenCalledWith('input');
	});
});

// ---------------------------------------------------------------------------
// FileSuggest
// ---------------------------------------------------------------------------

describe('FileSuggest', () => {
	const inputStub = () => ({ value: '', trigger: vi.fn() });

	it('getSuggestions returns Markdown files matching the query', () => {
		const app = {
			vault: {
				getMarkdownFiles: () => [new TFile('Inbox.md'), new TFile('Notes/Inbox.md'), new TFile('Other.md')],
			},
		};
		const fs = new FileSuggest(app as never, inputStub() as unknown as HTMLInputElement);
		expect(fs.getSuggestions('inbox').map((f) => f.path)).toEqual(['Inbox.md', 'Notes/Inbox.md']);
	});

	it('renderSuggestion writes the file path into the element', () => {
		const fs = new FileSuggest(
			{ vault: { getMarkdownFiles: () => [] } } as never,
			inputStub() as unknown as HTMLInputElement,
		);
		const el = { setText: vi.fn() };
		fs.renderSuggestion(new TFile('Inbox.md') as never, el as unknown as HTMLElement);
		expect(el.setText).toHaveBeenCalledWith('Inbox.md');
	});

	it('selectSuggestion fills the input and triggers an input event', () => {
		const input = inputStub();
		const fs = new FileSuggest(
			{ vault: { getMarkdownFiles: () => [] } } as never,
			input as unknown as HTMLInputElement,
		);
		fs.selectSuggestion(new TFile('Notes/Inbox.md') as never);
		expect(input.value).toBe('Notes/Inbox.md');
		expect(input.trigger).toHaveBeenCalledWith('input');
	});
});

describe('DEFAULT_SETTINGS — shape completeness', () => {
	it('has all required top-level keys', () => {
		const keys: (keyof typeof DEFAULT_SETTINGS)[] = [
			'taskScope', 'taskFolder', 'urgencyDays', 'importantPriorities',
			'quadrants', 'groupByPrimary', 'focusTag',
		];
		for (const key of keys) {
			expect(DEFAULT_SETTINGS).toHaveProperty(key);
		}
	});

	it('urgencyDays is a non-negative integer', () => {
		expect(Number.isInteger(DEFAULT_SETTINGS.urgencyDays)).toBe(true);
		expect(DEFAULT_SETTINGS.urgencyDays).toBeGreaterThanOrEqual(0);
	});

	it('focusTag starts with #', () => {
		expect(DEFAULT_SETTINGS.focusTag.startsWith('#')).toBe(true);
	});

	it('all quadrant tags start with #', () => {
		for (const key of ['do', 'schedule', 'delegate', 'eliminate'] as const) {
			expect(DEFAULT_SETTINGS.quadrants[key].tag.startsWith('#')).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Integration — color default values per quadrant
// ---------------------------------------------------------------------------

describe('DEFAULT_SETTINGS — quadrant color semantics', () => {
	it('"do" is redder than "schedule"', () => {
		const doRed   = parseInt(DEFAULT_SETTINGS.quadrants.do.color.slice(1, 3), 16);
		const schedRed = parseInt(DEFAULT_SETTINGS.quadrants.schedule.color.slice(1, 3), 16);
		expect(doRed).toBeGreaterThan(schedRed);
	});

	it('"eliminate" color has equal or lower saturation than others (darkish gray)', () => {
		const hex = DEFAULT_SETTINGS.quadrants.eliminate.color;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const saturation = max === 0 ? 0 : (max - min) / max;
		expect(saturation).toBeLessThan(0.3);
	});
});

// ---------------------------------------------------------------------------
// Integration — Reset-all button
// ---------------------------------------------------------------------------

describe('FocusFirstSettingTab — reset-all button', () => {
	it('calls plugin.resetSettings() and re-renders when clicked', async () => {
		const plugin = makePlugin({ taskFolder: 'Custom' });
		// resetSettings is not part of the plugin stub created by makePlugin —
		// add it here so we can assert it was invoked.
		const resetSpy = vi.fn(async () => {
			plugin.settings.taskFolder = '';
		});
		(plugin as unknown as { resetSettings: () => Promise<void> }).resetSettings = resetSpy;

		const tab = makeTab(plugin);
		clearCreatedSettings();
		tab.display();
		const renderedOnce = createdSettings.length;

		const resetButton = createdSettings.find((s) => s.lastButton)?.lastButton;
		expect(resetButton).toBeDefined();
		await resetButton?.simulate();

		expect(resetSpy).toHaveBeenCalledOnce();
		// Asserted as "the tab was built a second time" rather than by counting
		// display() calls: the click rebuilds through the shared body, so the whole
		// set of rows is created again.
		expect(createdSettings.length).toBe(renderedOnce * 2);
	});
});

// ---------------------------------------------------------------------------
// onChange — Value/Effort settings (#36)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Declarative settings API (Obsidian 1.13+)
//
// Obsidian itself renders these definitions, so there is no local renderer to
// assert against. What these tests do cover is everything that is ours: the
// shape of the definitions, and the getControlValue/setControlValue pair
// backing them - including the drift guard that every key the definitions hand
// out is actually one those two accessors know.
// ---------------------------------------------------------------------------

interface ControlLike { type: string; key: string }
interface DefLike {
	name?: string;
	desc?: string;
	visible?: boolean | (() => boolean);
	control?: ControlLike;
	render?: (setting: unknown) => void;
}
interface GroupLike { type: string; heading?: string; items?: DefLike[] }

function definitions(tab: FocusFirstSettingTabType): GroupLike[] {
	return tab.getSettingDefinitions() as unknown as GroupLike[];
}

function allItems(tab: FocusFirstSettingTabType): DefLike[] {
	return definitions(tab).flatMap((g) => g.items ?? []);
}

describe('getSettingDefinitions — shape', () => {
	it('returns one group per section of the imperative tab', () => {
		const tab = makeTab(makePlugin());
		expect(definitions(tab).every((g) => g.type === 'group')).toBe(true);
		expect(definitions(tab).map((g) => g.heading)).toEqual([
			t().settings.taskSourcesHeading,
			t().settings.tagsHeading,
			t().settings.progressGroupHeading,
			t().settings.quickAddHeading,
			t().settings.calendarHeading,
			t().settings.appearanceHeading,
			t().settings.resetHeading,
		]);
	});

	it('gives every item either a control or a render callback, never both', () => {
		const tab = makeTab(makePlugin());
		for (const item of allItems(tab)) {
			expect(Boolean(item.control) !== Boolean(item.render)).toBe(true);
		}
	});
});

describe('getSettingDefinitions — control keys are backed by the accessors', () => {
	it('resolves every key the definitions hand out (drift guard)', () => {
		const tab = makeTab(makePlugin());
		const keys = allItems(tab).filter((i) => i.control).map((i) => i.control!.key);
		expect(keys.length).toBeGreaterThan(10);
		for (const key of keys) {
			// Throws when a definition gained a key the accessors don't know.
			expect(() => tab.getControlValue(key)).not.toThrow();
		}
	});

	it('reads a top-level value', () => {
		const tab = makeTab(makePlugin({ urgencyDays: 9 }));
		expect(tab.getControlValue('urgencyDays')).toBe(9);
	});

	it('reads a nested value', () => {
		const tab = makeTab(makePlugin());
		expect(tab.getControlValue('sizeTags.small')).toBe('#s');
	});

	it('throws for a key no definition uses', () => {
		const tab = makeTab(makePlugin());
		expect(() => tab.getControlValue('nope')).toThrow(/no setting registered/);
	});
});

describe('setControlValue', () => {
	it('writes a top-level value and persists it', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		await tab.setControlValue('showSubtasks', false);
		expect(plugin.settings.showSubtasks).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it('writes a nested value', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		await tab.setControlValue('sizeTags.medium', '#mid');
		expect(plugin.settings.sizeTags.medium).toBe('#mid');
	});

	it('trims strings, the way the imperative path stores tags', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		await tab.setControlValue('focusTag', '  #star  ');
		expect(plugin.settings.focusTag).toBe('#star');
	});

	it('refreshes open views for keys the views depend on', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		await tab.setControlValue('showWhyHere', false);
		expect(plugin.refreshViews).toHaveBeenCalled();
	});

	it('does not refresh views for a key no view depends on', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		await tab.setControlValue('groupByPrimary', false);
		expect(plugin.refreshViews).not.toHaveBeenCalled();
	});

	it('re-applies the font size when it changes', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		await tab.setControlValue('fontSize', 130);
		expect(plugin.settings.fontSize).toBe(130);
		expect(plugin.applyFontSize).toHaveBeenCalled();
	});

	it('throws for a key no definition uses', async () => {
		const tab = makeTab(makePlugin());
		await expect(tab.setControlValue('nope', 1)).rejects.toThrow(/no setting registered/);
	});
});

describe('getSettingDefinitions — conditional rows', () => {
	it('shows the task folder only in folder scope', () => {
		const visibleFor = (scope: TaskScope) => {
			const tab = makeTab(makePlugin({ taskScope: scope }));
			const item = allItems(tab).find((i) => i.name === t().settings.taskFolder.name);
			return typeof item?.visible === 'function' ? item.visible() : item?.visible;
		};
		expect(visibleFor('folder')).toBe(true);
		expect(visibleFor('all')).toBe(false);
	});

	it('shows the inbox note only when quick add targets the inbox', () => {
		const tab = makeTab(makePlugin({ quickAddTarget: 'active' }));
		const item = allItems(tab).find((i) => i.name === t().settings.quickAddInbox.name);
		expect(typeof item?.visible === 'function' ? item.visible() : item?.visible).toBe(false);
	});
});

describe('getSettingDefinitions — every render callback works', () => {
	it('renders each custom widget into a fresh row without throwing', () => {
		const tab = makeTab(makePlugin());
		const withRender = allItems(tab).filter((i) => i.render);
		// task folder, hint paragraph, priority pills, 4 quadrants, notes folder,
		// archive folder, effort pills, inbox note, reset button
		expect(withRender).toHaveLength(6);
		for (const item of withRender) {
			const container = new FakeDomEl();
			expect(() => item.render!(new Setting(container))).not.toThrow();
		}
	});

	it('renders the folder picker with its error line', () => {
		const tab = makeTab(makePlugin({ taskScope: 'folder', taskFolder: '' }));
		const item = allItems(tab).find((i) => i.name === t().settings.taskFolder.name);
		const container = new FakeDomEl();
		item!.render!(new Setting(container));
		expect(asFakeEl(container).findByClass('focus-first-setting-error')).toBeDefined();
	});

	it('the reset row resets the settings and rebuilds the tab', async () => {
		const plugin = makePlugin({ taskFolder: 'Custom' });
		const resetSpy = vi.fn(async () => { plugin.settings.taskFolder = ''; });
		(plugin as unknown as { resetSettings: () => Promise<void> }).resetSettings = resetSpy;

		const tab = makeTab(plugin);
		const updateSpy = vi.spyOn(tab, 'update');
		const item = allItems(tab).find((i) => i.name === t().settings.resetAll.name);
		clearCreatedSettings();
		const setting = new Setting(new FakeDomEl());
		item!.render!(setting);

		await createdSettings.find((s) => s.lastButton)?.lastButton?.simulate();

		expect(resetSpy).toHaveBeenCalledOnce();
		expect(updateSpy).toHaveBeenCalledOnce();
	});
});

describe('setControlValue — dependent rows', () => {
	it('re-evaluates visibility predicates when the scope changes', async () => {
		const plugin = makePlugin({ taskScope: 'all' });
		const tab = makeTab(plugin);
		const refreshSpy = vi.spyOn(tab, 'refreshDomState');

		await tab.setControlValue('taskScope', 'folder');

		expect(plugin.settings.taskScope).toBe('folder');
		expect(refreshSpy).toHaveBeenCalled();
	});

	it('re-evaluates visibility predicates when the quick-add target changes', async () => {
		const plugin = makePlugin();
		const tab = makeTab(plugin);
		const refreshSpy = vi.spyOn(tab, 'refreshDomState');

		await tab.setControlValue('quickAddTarget', 'active');

		expect(refreshSpy).toHaveBeenCalled();
	});

	it('does not touch the DOM state for an independent key', async () => {
		const tab = makeTab(makePlugin());
		const refreshSpy = vi.spyOn(tab, 'refreshDomState');
		await tab.setControlValue('hideTag', '#gone');
		expect(refreshSpy).not.toHaveBeenCalled();
	});
});
