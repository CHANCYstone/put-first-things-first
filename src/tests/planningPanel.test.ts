import { describe, it, expect, vi } from 'vitest';
import { planningTasks, renderPlanningPanel } from '../planningPanel';
import { DEFAULT_SETTINGS } from '../settings';
import type { TaskItem } from '../taskScanner';
import type { DailyAction } from '../dailyWork';
import { FakeDomEl, TFile } from './__mocks__/obsidian';
const date = '2026-10-09';
const task = (id: string, title = '同名项目', extra: Partial<TaskItem> = {}): TaskItem => ({ file: new TFile(`${id}.md`) as never, line: `- [ ] ${title} #focus ^${id}`, lineNumber: 0, completed: false, tags: ['#focus'], progress: [], ...extra });
const action = (id: string, day = date, completed = false): DailyAction => ({ line: '', title: '下一步', completed, meta: { id: 'pftf-daily', date: day, parent: { block: id, title: '同名项目' } } });
const texts = (el: FakeDomEl): string => [el.text, ...el.children.map(texts)].join('\n');

describe('planning panel', () => {
 it('counts only selected-day actions using stable identity, including completed actions', () => {
  const rows = planningTasks([task('a'), task('b')], [action('a'), action('a', date, true), action('b', '2026-10-08')], date, DEFAULT_SETTINGS);
  expect(rows.map((r) => [r.planned, r.completed])).toEqual([[2, 1], [0, 0]]);
 });
 it('omits hidden, completed and non-focus tasks', () => {
  const rows = planningTasks([task('a'), task('b', '隐藏', { tags: ['#focus', '#hide'] }), task('c', '完成', { completed: true }), task('d', '普通', { tags: [] })], [], date, { ...DEFAULT_SETTINGS, hideTag: '#hide' });
  expect(rows.map((r) => r.task.file.path)).toEqual(['a.md']);
  expect(planningTasks([task('a')], [], date, { ...DEFAULT_SETTINGS, focusTag: '' })).toEqual([]);
 });
 it('respects manual focus ordering ahead of priority order', () => {
  const a = task('a', '甲', { priority: '⏫' }); const b = task('b', '乙', { priority: '🔽' });
  expect(planningTasks([a,b], [], date, { ...DEFAULT_SETTINGS, focusOrder: ['b.md::乙'] }).map((r) => r.task.file.path)).toEqual(['b.md', 'a.md']);
 });
 it('renders deadlines and latest progress and sends the precise task to actions', () => {
  const a = task('a', '项目评估', { dueDate: new Date(2026, 8, 1), progress: [{ lineNumber: 1, date: new Date(2026, 8, 2), alert: true, text: '第三年数据待补充' }] });
  const el = new FakeDomEl(); const arrange = vi.fn(); const details = vi.fn();
  renderPlanningPanel(el as unknown as HTMLElement, [a], [action('a')], date, DEFAULT_SETTINGS, { arrange, details });
  expect(texts(el)).toContain('截止 2026-09-01'); expect(texts(el)).toContain('第三年数据待补充'); expect(texts(el)).toContain('已安排 1 项 · 完成 0 项');
  const card = el.findByClass('pftf-planning-card')!;
  card.findByClass('pftf-planning-task-title')!.dispatch('click');
  card.findByClass('pftf-planning-card-footer')!.children.find((c) => c.tag === 'button')!.dispatch('click');
  expect(arrange).toHaveBeenCalledWith(expect.objectContaining(a)); expect(details).toHaveBeenCalledWith(expect.objectContaining(a));
 });
});
