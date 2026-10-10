import { DailyActionModal, CompleteModal } from './dailyModals';
export { DailyActionModal } from './dailyModals';
import { button } from './dailyUi';
import { renderPlanningPanel } from './planningPanel';
import { ProgressModal } from './progressModal';
import { ItemView, WorkspaceLeaf, Notice, debounce } from 'obsidian';
import type FocusFirstPlugin from './main';
import { scanTasks, TaskItem } from './taskScanner';
import { formatIsoDate, parseIsoDate } from './dateUtils';
import { DailyAction, changeDaily, completeDaily, readDaily, reopenDaily, findParent } from './dailyWork';
import { openFileAtLine } from './noteNavigation';

export const DAILY_VIEW_TYPE = 'pftf-daily-work';
export const PLANNING_VIEW_TYPE = 'pftf-daily-planning';
export class DailyView extends ItemView {
 private date = formatIsoDate(new Date());
 private generation = 0;
 private refreshSoon = debounce(() => { void this.refresh(); }, 350, true);
 constructor(leaf: WorkspaceLeaf, private plugin: FocusFirstPlugin, private planning = false) { super(leaf); }
 getViewType(): string { return this.planning ? PLANNING_VIEW_TYPE : DAILY_VIEW_TYPE; }
 getDisplayText(): string { return this.planning ? '每日规划' : '每日工作'; }
 getIcon(): string { return 'calendar-check'; }
 async onOpen(): Promise<void> {
  this.contentEl.addClass('pftf-daily');
  if (this.planning) this.contentEl.addClass('pftf-planning');
  this.registerEvent(this.app.vault.on('modify', () => this.refreshSoon()));
  this.registerEvent(this.app.vault.on('delete', () => this.refreshSoon()));
  this.registerEvent(this.app.vault.on('rename', () => this.refreshSoon()));
  this.registerEvent(this.app.vault.on('create', () => this.refreshSoon()));
  if (this.planning) this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshSoon()));
  await this.refresh();
 }
 async onClose(): Promise<void> { this.generation++; }
 async refresh(): Promise<void> {
  const generation = ++this.generation;
  try {
   const [actions, tasks] = await Promise.all([readDaily(this.app), this.planning ? scanTasks(this.app, this.plugin.settings) : Promise.resolve([] as TaskItem[])]);
   if (generation !== this.generation) return;
   this.render(actions, tasks);
  } catch { new Notice('无法读取每日工作，请检查文件后刷新。'); }
 }
 private render(actions: DailyAction[], tasks: TaskItem[]): void {
  const el = this.contentEl; el.empty();
  const header = el.createDiv({ cls: 'pftf-daily-header' });
  const heading = header.createDiv({ cls: 'pftf-heading-group' });
  heading.createDiv({ text: '把重要的事，推进一步', cls: 'pftf-eyebrow' });
  heading.createEl('h2', { text: this.getDisplayText() });
  const navigation = header.createDiv({ cls: 'pftf-view-switch' });
  button(navigation, '长期任务', () => this.plugin.activateView());
  if (this.planning) button(navigation, '仅看每日工作', () => this.plugin.activateDailyView());
  else button(navigation, '每日规划', () => this.plugin.activatePlanningView());
  const toolbar = el.createDiv({ cls: 'pftf-daily-toolbar' });
  const date = toolbar.createEl('input', { attr: { type: 'date', 'aria-label': '查看日期' } });
  date.value = this.date;
  date.addEventListener('change', () => { if (parseIsoDate(date.value)) { this.date = date.value; void this.refresh(); } });
  button(toolbar, 'Daily log', () => this.plugin.openDailyLog(this.date));
  button(toolbar, '今天', async () => { this.date = formatIsoDate(new Date()); await this.refresh(); });
  button(toolbar, '添加行动', async () => { new DailyActionModal(this.app, this.plugin.settings, this.date, () => this.refresh()).open(); }).addClass('mod-cta');
  button(toolbar, '刷新', () => this.refresh());
  const todays = actions.filter((a) => a.meta.date === this.date);
  const completed = todays.filter((a) => a.completed).length;
  const overview = el.createDiv({ cls: 'pftf-day-overview' });
  overview.createDiv({ cls: 'pftf-daily-summary', text: `${this.date} · ${completed} / ${todays.length} 已完成` });
  const progress = overview.createEl('progress', { cls: 'pftf-day-progress' });
  progress.max = Math.max(todays.length, 1); progress.value = completed;
  progress.setAttribute('aria-label', '当日行动完成进度');
  let daily = el;
  if (this.planning) {
   const layout = el.createDiv({ cls: 'pftf-planning-columns' });
   const longTerm = layout.createDiv({ cls: 'pftf-planning-longterm' });
   renderPlanningPanel(longTerm, tasks, actions, this.date, this.plugin.settings, {
    arrange: (task) => new DailyActionModal(this.app, this.plugin.settings, this.date, () => this.refresh(), task).open(),
    details: (task) => new ProgressModal(this.app, task, this.plugin.settings).open(),
   });
   daily = layout.createDiv({ cls: 'pftf-planning-actions' });
   daily.createEl('h3', { text: this.date === formatIsoDate(new Date()) ? '今日行动' : '当日行动' });
   const linked = todays.filter((a) => !!a.meta.parent).length;
   daily.createEl('p', { cls: 'pftf-daily-meta', text: `关联长期任务 ${linked} 项 · 独立事项 ${todays.length - linked} 项` });
  }
  this.section(daily, '当天行动', todays.filter((a) => !a.completed));
  this.section(daily, '已完成', todays.filter((a) => a.completed));
  this.section(daily, '之前未完成', actions.filter((a) => !a.completed && a.meta.date < this.date));
  const pending = actions.filter((a) => a.completed && a.meta.parent && !a.meta.synced && a.meta.date !== this.date);
  if (pending.length) this.section(daily, '待补记进展', pending);
  el.createEl('p', { cls: 'pftf-daily-help', text: '点击行动标题即可编辑。完成一个行动，就是向长期目标再走一步。' });
 }
 private section(el: HTMLElement, title: string, actions: DailyAction[]): void {
  if (!actions.length && title !== '当天行动') return;
  const section = el.createDiv({ cls: 'pftf-daily-section' });
  section.createEl('h3', { text: `${title} · ${actions.length}` });
  if (!actions.length) { section.createEl('p', { text: title === '当天行动' ? '从长期任务选一个具体动作，或添加临时事项。' : '暂无', cls: 'pftf-daily-empty' }); return; }
  for (const action of actions) {
   const row = section.createDiv({ cls: `pftf-daily-row${action.completed ? ' is-complete' : ''}` });
   const body = row.createDiv({ cls: 'pftf-daily-body' });
   const edit = () => new DailyActionModal(this.app, this.plugin.settings, action.meta.date, async () => { await this.refresh(); this.plugin.refreshViews(); }, undefined, action).open();
   const titleButton = body.createEl('button', { text: action.title, cls: 'pftf-daily-title' });
   titleButton.setAttribute('title', '编辑行动');
   titleButton.addEventListener('click', edit);
   body.createDiv({ text: `${action.meta.date} · ${action.meta.parent ? `推进：${action.meta.parent.title}` : '独立 / 临时任务'}`, cls: 'pftf-daily-meta' });
   if (action.meta.result) body.createEl('p', { text: action.meta.result });
   const controls = row.createDiv({ cls: 'pftf-daily-controls' });
   button(controls, '编辑', async () => { edit(); }).addClass('pftf-edit-action');
   if (action.meta.parent) button(controls, '长期任务 ↗', async () => {
    const parent = await findParent(this.app, action.meta.parent!, this.plugin.settings);
    await openFileAtLine(this.app, parent.file, parent.lineNumber);
   });
   if (action.completed) {
    if (action.meta.parent && !action.meta.synced) button(controls, '补记进展', async () => {
     try { await completeDaily(this.app, action, action.meta.result ?? '', this.plugin.settings); }
     finally { await this.refresh(); this.plugin.refreshViews(); }
    });
    button(controls, '重新打开', async () => { await reopenDaily(this.app, action); await this.refresh(); }).setAttribute('title', '保留已有进展记录，重新安排这项行动');
   } else {
    button(controls, '完成', async () => { new CompleteModal(this.app, action, this.plugin.settings, async () => {
     await this.refresh(); this.plugin.refreshViews();
    }).open(); }).addClass('pftf-complete-action');
    if (action.meta.date !== this.date) button(controls, '安排到所选日', async () => {
     await changeDaily(this.app, action, { ...action, meta: { ...action.meta, date: this.date } }); await this.refresh();
    });
   }
  }
 }
}
