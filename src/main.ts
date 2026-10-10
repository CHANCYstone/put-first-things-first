import { formatIsoDate } from './dateUtils';
import { validDailyDate } from './dailyWork';
import { DailyLogService, registerDailyLog } from './dailyLog';
import { focusCapacity } from './workBoard';
import { DailyView, DAILY_VIEW_TYPE, PLANNING_VIEW_TYPE } from './DailyView';
import { Plugin, WorkspaceLeaf, Notice, Editor, MarkdownView, MarkdownFileInfo, debounce } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	FocusFirstSettingTab,
	FocusFirstSettings,
} from './settings';
import { t } from './i18n';
import { FocusFirstView, FOCUS_FIRST_VIEW_TYPE } from './TaskView';
import { TriageView, FOCUS_FIRST_TRIAGE_VIEW_TYPE } from './TriageView';
import { WrappedTasksBlock, parseTasksBlock } from './wrappedTasksBlock';
import { FocusDataBlock, isFocusSection } from './focusDataBlock';
import { QuickAddModal } from './quickAddModal';
import { InboxSetupModal } from './inboxSetupModal';
import { commitTask, isInboxConfigured } from './quickAdd';
import { getTasksCreateApi, TasksCreateApi } from './tasksPlugin';
import { parseTaskLine, scanTasks } from './taskScanner';
import { archiveTask, promoteTask } from './promote';
import { FocusFirstCalendarSource } from './calendarSource';
import { registerCalendarSource, refreshCalendars } from './calendarIntegration';

export default class FocusFirstPlugin extends Plugin {
	settings!: FocusFirstSettings;
	private dailyLog!: DailyLogService;
	/** The day-cell data handed to the Calendar plugin, when that plugin is there. */
	private calendarSource!: FocusFirstCalendarSource;
	/** Coalesces an edit storm in the vault into one calendar redraw. */
	private refreshCalendarSoon = debounce(() => this.refreshCalendar(), 500, true);

	async onload() {
		await this.loadSettings();
		if (!this.settings.dailyLogStartDate || !validDailyDate(this.settings.dailyLogStartDate)) {
			this.settings.dailyLogStartDate = formatIsoDate(new Date());
			await this.saveSettings();
		}
		this.dailyLog = registerDailyLog(this);
		this.addCommand({ id: 'open-daily-log', name: '打开今日工作日志', callback: () => this.openDailyLog() });

		this.registerView(PLANNING_VIEW_TYPE, (leaf) => new DailyView(leaf, this, true));
		this.addCommand({ id: 'open-daily-planning', name: '打开每日规划', callback: () => this.activatePlanningView() });
		this.registerView(DAILY_VIEW_TYPE, (leaf) => new DailyView(leaf, this));
		this.addCommand({ id: 'open-daily-work', name: '打开每日工作', callback: () => this.activateDailyView() });

		this.registerView(
			FOCUS_FIRST_VIEW_TYPE,
			(leaf) => new FocusFirstView(leaf, this),
		);

		this.registerView(
			FOCUS_FIRST_TRIAGE_VIEW_TYPE,
			(leaf) => new TriageView(leaf, this),
		);

		// The Calendar plugin, if installed, asks for sources when its view opens.
		// Nothing here depends on it being present: with no Calendar the event
		// never fires and the source is simply never consulted.
		this.calendarSource = new FocusFirstCalendarSource(
			() => scanTasks(this.app, this.settings),
			() => this.settings,
		);
		registerCalendarSource(this, this.calendarSource, () => this.quadrantColors());
		// Calendar only redraws itself when a daily or weekly note changes, so an
		// edit to a task note has to reach it from this side.
		this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshCalendarSoon()));

		this.applyFontSize();

		this.addRibbonIcon('list-checks', '每日规划', async () => {
			await this.activatePlanningView();
		});

		this.addCommand({
			id: 'open-view',
			name: t().commands.openView.name,
			callback: async () => await this.activateView(),
		});

		this.addCommand({
			id: 'open-triage',
			name: t().commands.openTriage.name,
			callback: async () => await this.activateTriageView(),
		});

		this.addCommand({
			id: 'add-task',
			name: t().commands.addTask.name,
			callback: () => this.openQuickAdd(),
		});

		// The two lifecycle moves, from the editor: on the task line under the cursor.
		this.addCommand({
			id: 'promote-task',
			name: t().commands.promoteTask.name,
			editorCheckCallback: (checking, editor, ctx) => this.onTaskLine(checking, editor, ctx, async (task) => {
				const p = t().progress;
				const result = await promoteTask(this.app, this.settings, task);
				if (result.status === 'created') new Notice(p.promoted.replace('{name}', result.note.basename));
				else if (result.status === 'linked') new Notice(p.promotedLinked.replace('{name}', result.note.basename));
				else if (result.status === 'no-title') new Notice(p.promoteNoTitle);
			}),
		});

		this.addCommand({
			id: 'archive-task',
			name: t().commands.archiveTask.name,
			editorCheckCallback: (checking, editor, ctx) => this.onTaskLine(checking, editor, ctx, async (task) => {
				const p = t().progress;
				const result = await archiveTask(this.app, this.settings, task);
				if (result === 'archived') new Notice(p.archived.replace('{folder}', this.settings.archiveFolder.trim()));
				else if (result === 'completed-only') new Notice(p.archivedNoFolder);
				else if (result === 'target-exists') new Notice(p.archiveTargetExists);
				else if (result === 'needs-note') new Notice(p.archiveNeedsNote);
			}),
		});

		this.addSettingTab(new FocusFirstSettingTab(this.app, this));

		// A ```focus-first-tasks``` block either renders a Focus First data section
		// (`show-focus focus|do|schedule|delegate|eliminate`) or wraps a raw Tasks
		// query. Both support an `empty-text <message>` shown when nothing matches.
		this.registerMarkdownCodeBlockProcessor('focus-first-tasks', (source, el, ctx) => {
			const { showFocus, emptyText } = parseTasksBlock(source);
			if (showFocus) {
				if (isFocusSection(showFocus)) {
					ctx.addChild(new FocusDataBlock(el, this, showFocus, emptyText, ctx.sourcePath));
				} else {
					el.createEl('p', { text: t().tasksBlock.invalidShow, cls: 'focus-first-tasks-missing' });
				}
				return;
			}
			ctx.addChild(new WrappedTasksBlock(el, this, source, ctx.sourcePath));
		});
	}

	async openDailyLog(date?: string): Promise<void> {
		try {
			const file = await this.dailyLog.sync(date);
			if (file) await this.app.workspace.getLeaf('tab').openFile(file);
		} catch (error) { new Notice(error instanceof Error ? error.message : '无法打开 Daily log。'); }
	}

	/**
	 * Runs `action` on the task under the editor cursor; as a check, reports
	 * whether the cursor is on a task line at all (so the command only shows up
	 * in the palette when it applies).
	 */
	private onTaskLine(
		checking: boolean,
		editor: Editor,
		ctx: MarkdownView | MarkdownFileInfo,
		action: (task: ReturnType<typeof parseTaskLine>) => Promise<void>,
	): boolean {
		const file = ctx.file;
		const lineNumber = editor.getCursor().line;
		const line = editor.getLine(lineNumber);
		const match = /^\s*[-*+]\s+\[(.)\]/.exec(line);
		if (!file || !match) return false;
		if (checking) return true;
		const task = parseTaskLine(this.app, file, line, lineNumber, this.settings, match[1]);
		void action(task).then(() => this.refreshViews());
		return true;
	}

	/**
	 * Captures a new task. When the Tasks plugin is enabled, uses its own create
	 * dialog (date/priority/recurrence pickers) and appends the result to the
	 * configured target. Otherwise falls back to a simple built-in dialog.
	 */
	openQuickAdd() {
		// On the first quick-add with no inbox configured, ask where tasks should
		// go (issue #24), then continue once the target is saved.
		if (!isInboxConfigured(this.settings)) {
			new InboxSetupModal(this, () => this.startQuickAdd()).open();
			return;
		}
		this.startQuickAdd();
	}

	private startQuickAdd() {
		const createApi = getTasksCreateApi(this.app);
		if (createApi) {
			void this.quickAddViaTasks(createApi);
		} else {
			new QuickAddModal(this).open();
		}
	}

	private async quickAddViaTasks(api: TasksCreateApi): Promise<void> {
		const line = await api.createTaskLineModal();
		const result = await commitTask(this.app, this.settings, line);
		if (result === 'no-target') {
			new Notice(t().quickAdd.noActiveNote);
			return;
		}
		if (result === 'empty' || result === 'focus-full') return; // cancelled, blank, or at capacity
		new Notice(t().quickAdd.addedNotice);
		this.refreshViews();
	}

	/**
	 * Opens (or reveals) the matrix. A 2×2 grid needs width, so it opens as a tab
	 * in the main area rather than the sidebar; an already open one is reused
	 * wherever the user has since put it.
	 */
	async activatePlanningView(): Promise<void> {
		const workspace = this.app.workspace;
		const existing = workspace.getLeavesOfType(PLANNING_VIEW_TYPE)[0];
		const leaf = existing ?? workspace.getLeaf('tab');
		if (!existing) await leaf.setViewState({ type: PLANNING_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	async activateDailyView(): Promise<void> {
		const workspace = this.app.workspace;
		const existing = workspace.getLeavesOfType(DAILY_VIEW_TYPE)[0];
		const leaf = existing ?? workspace.getLeaf('tab');
		if (!existing) await leaf.setViewState({ type: DAILY_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(FOCUS_FIRST_VIEW_TYPE);

		if (existing.length > 0) {
			leaf = existing[0] ?? null;
		} else {
			leaf = workspace.getLeaf('tab');
			await leaf?.setViewState({ type: FOCUS_FIRST_VIEW_TYPE, active: true });
		}

		if (leaf) await workspace.revealLeaf(leaf);
	}

	/** Opens (or reveals) the triage view. Like the matrix view, it opens as a
	 *  tab in the main area and is reused if already open. */
	async activateTriageView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(FOCUS_FIRST_TRIAGE_VIEW_TYPE);

		if (existing.length > 0) {
			leaf = existing[0] ?? null;
		} else {
			leaf = workspace.getLeaf('tab');
			await leaf?.setViewState({ type: FOCUS_FIRST_TRIAGE_VIEW_TYPE, active: true });
		}

		if (leaf) await workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<FocusFirstSettings>,
		);
		this.settings.focusTargetCount = focusCapacity(this.settings.focusTargetCount);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async resetSettings() {
		this.settings = structuredClone(DEFAULT_SETTINGS);
		await this.saveSettings();
		this.applyFontSize();
	}

	applyFontSize() {
		const scale = this.settings.fontSize / 100;
		const leaves = [
			...this.app.workspace.getLeavesOfType(FOCUS_FIRST_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(FOCUS_FIRST_TRIAGE_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(DAILY_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(PLANNING_VIEW_TYPE),
		];
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof FocusFirstView || view instanceof TriageView || view instanceof DailyView) {
				view.contentEl.style.setProperty('--focus-first-font-scale', String(scale));
			}
		}
	}

	/** The configured quadrant colours, as the calendar dots need them. */
	private quadrantColors() {
		const { quadrants } = this.settings;
		return {
			do: quadrants.do.color,
			schedule: quadrants.schedule.color,
			delegate: quadrants.delegate.color,
			eliminate: quadrants.eliminate.color,
		};
	}

	/** Drops the cached calendar index and asks any open Calendar view to redraw. */
	refreshCalendar() {
		this.calendarSource?.invalidate();
		refreshCalendars(this.app, this.quadrantColors());
	}

	/** Re-renders every open Focus First view (used after a settings change). */
	refreshViews() {
		this.refreshCalendar();
		const leaves = [
			...this.app.workspace.getLeavesOfType(FOCUS_FIRST_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(FOCUS_FIRST_TRIAGE_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(DAILY_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(PLANNING_VIEW_TYPE),
		];
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof FocusFirstView || view instanceof TriageView || view instanceof DailyView) {
				void view.refresh();
			}
		}
	}
}
