import type { TaskItem } from './taskScanner';
import { isHiddenTask } from './taskScanner';
import type { FocusFirstSettings } from './settings';
import type { DailyAction } from './dailyWork';
import { taskTitle } from './tasksFormat';
import { latestEntry, daysSinceEntry } from './progressLog';
import { formatIsoDate } from './dateUtils';
import { focusKeyResolver } from './TaskView';
import { classifyTasks } from './matrixClassifier';
import { sortTasks } from './taskSorting';

export interface PlanningTask { task: TaskItem; planned: number; completed: number }
/** Match stable IDs, never titles: two similarly named projects stay separate. */
export function planningTasks(tasks: TaskItem[], actions: DailyAction[], date: string, settings: FocusFirstSettings): PlanningTask[] {
 const tag = settings.focusTag.trim().toLowerCase();
 const focus = tasks.filter((task) => !task.completed && !isHiddenTask(task, settings)
  && !!tag && task.tags.some((t) => t.toLowerCase() === tag));
 const key = focusKeyResolver(focus);
 const rank = (task: TaskItem) => {
  const index = settings.focusOrder.indexOf(key(task.file.path, task.lineNumber));
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
 };
 const matrix = classifyTasks(focus, settings);
 const ordered = sortTasks([...matrix.do, ...matrix.schedule, ...matrix.delegate, ...matrix.eliminate], { primary: 'priority', secondary: 'dueDate' })
  .sort((a, b) => rank(a) - rank(b));
 const counts = new Map<string, { planned: number; completed: number }>();
 for (const action of actions) {
  if (action.meta.date !== date || !action.meta.parent) continue;
  const block = action.meta.parent.block;
  const count = counts.get(block) ?? { planned: 0, completed: 0 };
  count.planned++; if (action.completed) count.completed++;
  counts.set(block, count);
 }
 return ordered.map((task) => {
  const block = / \^([a-zA-Z0-9-]+)(?=\s|$)/.exec(task.line)?.[1];
  return { task, ...(block ? counts.get(block) : undefined) ?? { planned: 0, completed: 0 } };
 });
}

export function renderPlanningPanel(
 el: HTMLElement, tasks: TaskItem[], actions: DailyAction[], date: string, settings: FocusFirstSettings,
 callbacks: { arrange: (task: TaskItem) => void; details: (task: TaskItem) => void },
): void {
 const rows = planningTasks(tasks, actions, date, settings);
 const today = formatIsoDate(new Date());
 el.createEl('h3', { text: `长期任务 · ${rows.length}` });
 el.createEl('p', { cls: 'pftf-daily-meta', text: '从长期目标，选出今天的下一步。' });
 if (!rows.length) {
  el.createEl('p', { cls: 'pftf-daily-empty', text: settings.focusTag.trim()
   ? `还没有长期任务。在工作看板中为任务添加 ${settings.focusTag} 标签后，会显示在这里。`
   : '请先在插件设置中配置长期任务的关注标签。' });
  return;
 }
 for (const { task, planned, completed } of rows) {
  const card = el.createDiv({ cls: `pftf-planning-card${planned ? ' is-planned' : ''}` });
  const title = card.createEl('button', { text: taskTitle(task.line), cls: 'pftf-planning-task-title' });
  title.setAttribute('title', '查看长期任务与进展');
  title.addEventListener('click', () => callbacks.details(task));
  const meta = card.createDiv({ cls: 'pftf-daily-meta' });
  meta.createSpan({ text: task.file.basename });
  if (task.dueDate) {
   const due = formatIsoDate(task.dueDate);
   meta.createSpan({ text: ` · 截止 ${due}${due < today ? ' · 已逾期' : ''}`, cls: due < today ? 'pftf-planning-overdue' : '' });
  }
  const latest = latestEntry(task.progress);
  const days = latest ? daysSinceEntry(latest) : undefined;
  card.createEl('p', { cls: 'pftf-planning-progress', text: latest
   ? `${latest.date ? formatIsoDate(latest.date) + ' · ' : ''}${latest.alert ? '⚠ ' : ''}${latest.text}`
   : '尚无进展记录' });
  if (days !== undefined && days > settings.staleDays) card.createDiv({ cls: 'pftf-daily-meta', text: `${days} 天未更新进展` });
  const footer = card.createDiv({ cls: 'pftf-planning-card-footer' });
  footer.createSpan({ cls: 'pftf-planning-count', text: planned
   ? `${date === today ? '今天' : '当日'}已安排 ${planned} 项 · 完成 ${completed} 项`
   : `${date === today ? '今天' : '当日'}未安排` });
  const add = footer.createEl('button', { text: date === today ? '安排今天' : '安排到所选日' });
  add.addEventListener('click', () => callbacks.arrange(task));
 }
}
