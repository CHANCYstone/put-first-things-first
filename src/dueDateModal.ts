import { App, Modal } from 'obsidian';
import { t } from './i18n';

/**
 * A small date picker for a task's due date: the browser's native date input,
 * prefilled with the current date, saved on Enter or the button. Returns the
 * chosen ISO date through `onPick`.
 */
export class DueDateModal extends Modal {
	private readonly current: string | undefined;
	private readonly onPick: (iso: string) => void;

	constructor(app: App, current: string | undefined, onPick: (iso: string) => void) {
		super(app);
		this.current = current;
		this.onPick = onPick;
	}

	onOpen(): void {
		const a = t().view.actions;
		this.titleEl.setText(String(a.pickDate));
		const row = this.contentEl.createDiv({ cls: 'focus-first-duedate-row' });
		const input = row.createEl('input', { cls: 'focus-first-duedate-input', attr: { type: 'date' } });
		if (this.current) input.value = this.current;
		const save = row.createEl('button', { text: String(a.save), cls: 'mod-cta' });
		const submit = () => {
			if (!input.value) return;
			this.onPick(input.value);
			this.close();
		};
		save.addEventListener('click', submit);
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
		// A date is only ever written when the picker closes with a choice, so
		// picking a day should save too — no second click on the button needed.
		input.addEventListener('change', submit);
		input.focus();
		// Pop the calendar open straight away: the menu click that got us here is
		// the user gesture showPicker() needs. Older builds without it just show
		// the field, which opens on click as before.
		try { input.showPicker?.(); } catch { /* not allowed here — the field is still usable */ }
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
