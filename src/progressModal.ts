import { DailyActionModal } from './DailyView';
import { App, Modal, Notice, Menu, setIcon } from 'obsidian';
import { TaskItem } from './taskScanner';
import { FocusFirstSettings } from './settings';
import { ProgressEntry, appendProgressEntry, daysSinceEntry, parseProgressLine } from './progressLog';
import { formatIsoDate } from './dateUtils';
import { taskTitle } from './tasksFormat';
import { openFile, openFileAtLine } from './noteNavigation';
import { archiveTask, promoteTask } from './promote';
import { showUndoNotice } from './undo';
import { t } from './i18n';

/**
 * The page behind a task: its whole progress log, newest first, with a line to
 * add the next note. Opened by clicking a task's card. Everything it writes
 * goes straight into Markdown — under the task line, or into the task's home
 * note when it has one — so the log is readable without the plugin and
 * survives it. From here a task can also be given a note of its own, or be
 * archived once it is done.
 */
export class ProgressModal extends Modal {
	private readonly task: TaskItem;
	private readonly settings: FocusFirstSettings;

	private listEl!: HTMLElement;

	constructor(app: App, task: TaskItem, settings: FocusFirstSettings) {
		super(app);
		this.task = task;
		this.settings = settings;
	}

	onOpen(): void {
		this.titleEl.setText(taskTitle(this.task.line));
		const { contentEl } = this;
		contentEl.addClass('focus-first-progress');

		this.renderNote(contentEl.createDiv({ cls: 'pftf-progress-note' }));
		const head = contentEl.createDiv({ cls: 'focus-first-progress-head' });
		head.createSpan({ text: 'Progress', cls: 'focus-first-progress-title' });
		head.createSpan({ text: formatIsoDate(new Date()), cls: 'focus-first-progress-status' });
		this.renderComposer(contentEl.createDiv({ cls: 'focus-first-progress-composer' }));
		this.listEl = contentEl.createDiv({ cls: 'focus-first-progress-list' });
		this.renderEntries();
	}

	/** Two doors: the detailed project note and a lightweight daily entry. */
	private renderNote(el: HTMLElement): void {
		const home = this.task.homeNote;
		const note = el.createEl('button', { text: home ? `打开笔记 · ${home.basename}` : 'Give this task a note', cls: 'pftf-progress-note-link' });
		note.addEventListener('click', () => {
			if (home) { this.close(); void openFile(this.app, home); }
			else { void this.promote().catch(() => { new Notice('创建笔记失败，请重试。'); }); }
		});
		const more = el.createEl('button', { text: '更多', cls: 'pftf-progress-more' });
		more.addEventListener('click', event => {
			const menu = new Menu();
			menu.addItem(item => item.setTitle('打开任务来源').setIcon('file-text').onClick(() => {
				this.close(); void openFileAtLine(this.app, this.task.file, this.task.lineNumber);
			}));
			if (!this.task.completed) menu.addItem(item => item.setTitle('安排每日行动').setIcon('calendar').onClick(() => {
				this.close();
				new DailyActionModal(this.app, this.settings, formatIsoDate(new Date()), async () => { new Notice('已加入每日工作'); }, this.task).open();
			}));
			if (home) menu.addItem(item => item.setTitle(String(t().progress.archive)).setIcon('archive').onClick(() => {
				void this.archive().catch(() => { new Notice('归档失败，请重试。'); });
			}));
			menu.showAtMouseEvent(event);
		});
	}

	private async promote(): Promise<void> {
		const p = t().progress;
		const result = await promoteTask(this.app, this.settings, this.task);
		switch (result.status) {
			case 'created':  new Notice(String(p.promoted).replace('{name}', result.note.basename)); break;
			case 'linked':   new Notice(String(p.promotedLinked).replace('{name}', result.note.basename)); break;
			case 'already':  break;
			case 'no-title': new Notice(String(p.promoteNoTitle)); return;
			case 'stale':    new Notice(String(p.stale)); return;
		}
		this.close();
		if (result.status === 'created' || result.status === 'linked') await openFile(this.app, result.note);
	}

	private async archive(): Promise<void> {
		const p = t().progress;
		const result = await archiveTask(this.app, this.settings, this.task);
		switch (result) {
			case 'archived':       new Notice(String(p.archived).replace('{folder}', this.settings.archiveFolder.trim())); break;
			case 'completed-only': new Notice(String(p.archivedNoFolder)); break;
			case 'target-exists':  new Notice(String(p.archiveTargetExists)); break;
			case 'needs-note':     new Notice(String(p.archiveNeedsNote)); return;
			case 'stale':          new Notice(String(p.stale)); return;
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderEntries(): void {
		this.listEl.empty();
		const entries = [...this.task.progress].reverse();
		if (!entries.length) {
			this.listEl.createDiv({ text: '从今天的一条计划或进展开始。', cls: 'focus-first-progress-empty' });
			return;
		}
		this.listEl.createDiv({ text: '最近记录', cls: 'pftf-progress-history-label' });
		const renderEntry = (parent: HTMLElement, entry: ProgressEntry) => {
			const row = parent.createDiv({ cls: `focus-first-progress-entry${entry.alert ? ' is-alert' : ''}` });
			row.createSpan({ text: entry.date ? formatIsoDate(entry.date) : '', cls: 'focus-first-progress-date' });
			if (entry.alert) setIcon(row.createSpan({ cls: 'focus-first-progress-mark' }), 'alert-triangle');
			row.createSpan({ text: entry.text, cls: 'focus-first-progress-text' });
			row.setAttribute('title', String(t().progress.openEntry));
			row.addEventListener('click', () => {
				this.close();
				void openFileAtLine(this.app, this.task.homeNote ?? this.task.file, entry.lineNumber);
			});
		};
		for (const entry of entries.slice(0, 3)) renderEntry(this.listEl, entry);
		if (entries.length > 3) {
			const older = this.listEl.createEl('details', { cls: 'pftf-progress-older' });
			older.createEl('summary', { text: `更早的 ${entries.length - 3} 条记录` });
			for (const entry of entries.slice(3)) renderEntry(older, entry);
		}
	}

	private renderComposer(el: HTMLElement): void {
		const input = el.createEl('textarea', {
			cls: 'focus-first-progress-input',
			attr: { rows: '4', 'aria-label': '记录计划或进展', placeholder: '今天准备做什么？\n推进了什么？还有什么没推进？' },
		});
		const bar = el.createDiv({ cls: 'pftf-progress-savebar' });
		bar.createSpan({ cls: 'pftf-log-hint', text: '每行一条 · 自动记日期，同步 Daily log' });
		const addBtn = bar.createEl('button', { text: '记录', cls: 'mod-cta' });
		addBtn.disabled = true;
		let saving = false;
		input.addEventListener('input', () => { addBtn.disabled = saving || !input.value.trim(); });
		const submit = async () => {
			const text = input.value.trim();
			if (!text || saving) return;
			saving = true; input.disabled = true; addBtn.disabled = true; addBtn.setText('保存中…');
			try { if (await this.append(text)) input.value = ''; }
			catch { new Notice('保存失败，内容已保留，请重试。'); }
			finally {
				saving = false; input.disabled = false; addBtn.disabled = !input.value.trim(); addBtn.setText('记录'); input.focus();
			}
		};
		addBtn.addEventListener('click', () => { void submit(); });
		input.addEventListener('keydown', e => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); void submit(); }
		});
		input.focus();
	}

	/** Writes the entry to the note and mirrors it into the open page. */
	private async append(text: string): Promise<boolean> {
		const snap = await appendProgressEntry(this.app, this.task, text, false, this.settings.progressHeading);
		if (!snap) {
			new Notice(String(t().progress.stale));
			return false;
		}
		showUndoNotice(this.app, String(t().view.undoLabels.noted), snap);
		for (const [offset, line] of snap.after.entries()) {
			const entry = parseProgressLine(line, snap.startLine + offset);
			if (entry) this.task.progress.push(entry);
		}
		this.renderEntries();
		return true;
	}
}

/** "Last note today" / "Last note 3 d ago", from the entry's date. */
export function lastNoteText(entry: ProgressEntry): string {
	const p = t().progress;
	const days = daysSinceEntry(entry);
	if (days === undefined) return String(p.lastNoteUndated);
	if (days <= 0) return String(p.lastNoteToday);
	return String(p.lastNote).replace('{days}', String(days));
}

/** A log has gone stale when its latest entry is older than the configured number of days. */
export function isStale(latest: ProgressEntry | undefined, staleDays: number): boolean {
	if (!latest) return false;
	const days = daysSinceEntry(latest);
	return days !== undefined && days > staleDays;
}
