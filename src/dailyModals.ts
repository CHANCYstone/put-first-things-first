import { App, Modal, Notice } from 'obsidian';
import type { FocusFirstSettings } from './settings';
import { scanTasks, isHiddenTask, TaskItem } from './taskScanner';
import { taskTitle } from './tasksFormat';
import { DailyAction, addDaily, editDaily, completeDaily, readDaily } from './dailyWork';
import { button } from './dailyUi';

export class DailyActionModal extends Modal {
 constructor(app: App, private settings: FocusFirstSettings, private date: string,
  private done: () => Promise<void>, private selected?: TaskItem, private action?: DailyAction) { super(app); }
 onOpen(): void {
  this.contentEl.addClass('pftf-daily-form');
  this.titleEl.setText(this.action ? '编辑行动' : '安排每日行动');
  this.contentEl.createEl('label', { text: '具体行动' });
  const input = this.contentEl.createEl('input', { attr: { type: 'text', placeholder: '今天具体做什么？', 'aria-label': '每日行动' } });
  input.value = this.action?.title ?? '';
  this.contentEl.createEl('label', { text: '计划日期' });
  const date = this.contentEl.createEl('input', { attr: { type: 'date', 'aria-label': '计划日期' } });
  date.value = this.action?.meta.date ?? this.date;
  this.contentEl.createEl('label', { text: '推进哪个长期任务' });
  const select = this.contentEl.createEl('select', { attr: { 'aria-label': '关联长期任务' } });
  select.createEl('option', { text: '独立任务 / 临时事项', value: '' });
  if (this.action?.meta.parent) select.createEl('option', { text: `保持关联：${this.action.meta.parent.title}`, value: 'keep' });
  select.value = this.action?.meta.parent ? 'keep' : '';
  select.disabled = !!this.action?.completed;
  let result: HTMLTextAreaElement | undefined;
  if (this.action?.completed) {
   this.contentEl.createEl('label', { text: '完成成果' });
   result = this.contentEl.createEl('textarea', { attr: { 'aria-label': '完成成果', placeholder: '成果或卡点' } });
   result.value = this.action.meta.result ?? '';
   this.contentEl.createEl('p', { cls: 'pftf-form-hint', text: '修改会同步到已记录的进展。若要更换长期任务，请先重新打开行动。' });
  }
  let tasks: TaskItem[] = [];
  const footer = this.contentEl.createDiv({ cls: 'pftf-form-footer' });
  button(footer, '取消', async () => { this.close(); });
  const save = button(footer, this.action ? '保存修改' : '添加行动', async () => {
   const task = select.value === '' || select.value === 'keep' ? undefined : tasks[Number(select.value)];
   if (this.action) {
    try {
     await editDaily(this.app, this.action, {
      title: input.value, date: date.value, result: result?.value,
      parent: this.action.completed || select.value === 'keep' ? undefined : task ?? null,
     }, this.settings);
    } catch (error) {
     const saved = (await readDaily(this.app)).find((a) => a.meta.id === this.action!.meta.id);
     if (saved && saved.line !== this.action.line) { this.close(); await this.done(); }
     throw error;
    }
   } else await addDaily(this.app, input.value, date.value, task);
   this.close(); await this.done();
  });
  save.addClass('mod-cta'); save.disabled = true;
  void scanTasks(this.app, this.settings).then((all) => {
   tasks = all.filter((t) => !t.completed && !isHiddenTask(t, this.settings)
    && t.tags.some((tag) => tag.toLowerCase() === this.settings.focusTag.trim().toLowerCase()));
   if (this.selected && !tasks.some((t) => t.file.path === this.selected!.file.path && t.lineNumber === this.selected!.lineNumber)) tasks.unshift(this.selected);
   tasks.forEach((task, i) => select.createEl('option', { text: `${taskTitle(task.line)} · ${task.file.basename}`, value: String(i) }));
   if (this.selected) {
    const i = tasks.findIndex((t) => t.file.path === this.selected!.file.path && t.lineNumber === this.selected!.lineNumber);
    select.value = i < 0 ? '' : String(i);
   }
   save.disabled = false;
  }).catch(() => { new Notice('读取长期任务失败。可以保留原关联继续编辑。'); save.disabled = !this.action; });
  input.focus();
 }
 onClose(): void { this.contentEl.empty(); }
}
export class CompleteModal extends Modal {
 constructor(app: App, private action: DailyAction, private settings: FocusFirstSettings, private done: () => Promise<void>) { super(app); }
 onOpen(): void {
  this.contentEl.addClass('pftf-daily-form');
  this.titleEl.setText('完成每日行动');
  this.contentEl.createEl('p', { text: this.action.title });
  const result = this.contentEl.createEl('textarea', { attr: { placeholder: '成果或卡点（可选）', 'aria-label': '成果或卡点' } });
  this.contentEl.createEl('p', { text: this.action.meta.parent ? '完成后会记入关联任务的进展日志，长期任务保持原状态。' : '这条独立任务的成果会保存在每日工作中。' });
  button(this.contentEl, '确认完成', async () => {
   try {
    await completeDaily(this.app, this.action, result.value, this.settings);
    this.close();
   } catch (error) {
    const saved = (await readDaily(this.app)).find((a) => a.meta.id === this.action.meta.id);
    if (saved?.completed) this.close();
    throw error;
   } finally { await this.done(); }
  }).addClass('mod-cta');
 }
 onClose(): void { this.contentEl.empty(); }
}
