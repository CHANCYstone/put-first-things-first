import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App, WorkspaceLeaf } from 'obsidian';
import { FakeDomEl, createdModals, clearCreatedModals, TFile } from './__mocks__/obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import type FocusFirstPlugin from '../main';
import { DailyView, DailyActionModal } from '../DailyView';
import { readDaily, addDaily, editDaily, changeDaily, completeDaily } from '../dailyWork';
import { scanTasks } from '../taskScanner';
import { formatIsoDate } from '../dateUtils';
vi.mock('../dailyWork', async (original) => ({ ...await original<object>(), readDaily: vi.fn(), addDaily: vi.fn(), editDaily: vi.fn(), changeDaily: vi.fn(), completeDaily: vi.fn() }));
vi.mock('../taskScanner', async (original) => ({ ...await original<object>(), scanTasks: vi.fn() }));
const texts = (el: FakeDomEl): string => [el.text, ...el.children.map(texts)].join('\n');
function find(el: FakeDomEl, label: string): FakeDomEl | undefined { return el.text === label ? el : el.children.map((child) => find(child, label)).find(Boolean); }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function setup(planning = false) {
 const app = { vault: { on: vi.fn() }, metadataCache: { on: vi.fn() } } as unknown as App;
 const activate = vi.fn().mockResolvedValue(undefined);
 const refresh = vi.fn();
 const plugin = { app, settings: { ...DEFAULT_SETTINGS }, activateView: activate, refreshViews: refresh } as unknown as FocusFirstPlugin;
 const view = new DailyView({ app } as unknown as WorkspaceLeaf, plugin, planning);
 const el = new FakeDomEl(); view.contentEl = el as unknown as HTMLElement;
 return { app, plugin, view, el, activate, refresh };
}
beforeEach(() => { vi.clearAllMocks(); clearCreatedModals(); vi.mocked(scanTasks).mockResolvedValue([]); });

describe('daily work UI', () => {
 it('shows current work, old unfinished work, completed outcomes and retry actions', async () => {
  const today = formatIsoDate(new Date());
  vi.mocked(readDaily).mockResolvedValue([
   { title: '今天核实数据', completed: false, line: '', meta: { id: 'pftf-1', date: today, parent: { block: 'ref', title: '长期评估' } } },
   { title: '历史未完成', completed: false, line: '', meta: { id: 'pftf-2', date: '2020-01-01' } },
   { title: '已发材料', completed: true, line: '', meta: { id: 'pftf-3', date: today, result: '发给经理' } },
   { title: '等待补记', completed: true, line: '', meta: { id: 'pftf-4', date: '2020-01-01', parent: { block: 'ref', title: '长期评估' } } },
  ]);
  const { view, el, activate } = setup(); await view.onOpen();
  expect(texts(el)).toContain('1 / 2 已完成'); expect(texts(el)).toContain('推进：长期评估');
  expect(texts(el)).toContain('之前未完成 · 1'); expect(texts(el)).toContain('待补记进展 · 1');
  expect(texts(el)).toContain('发给经理');
  find(el, '长期任务')!.dispatch('click'); await flush(); expect(activate).toHaveBeenCalledOnce();
  find(el, '安排到所选日')!.dispatch('click'); await flush();
  expect(vi.mocked(changeDaily).mock.calls[0]?.[2].meta.date).toBe(today);
 });
 it('opens a completion dialog, captures outcome and refreshes both views', async () => {
  vi.mocked(readDaily).mockResolvedValue([{ title: '数据核实', completed: false, line: '', meta: { id: 'pftf-1', date: formatIsoDate(new Date()) } }]);
  const { view, el, plugin, refresh } = setup(); await view.refresh(); find(el, '完成')!.dispatch('click'); await flush();
  const modal = createdModals.at(-1)!; const textarea = modal.contentEl.children.find((c) => c.tag === 'textarea')!;
  textarea.value = '两年已核实'; find(modal.contentEl, '确认完成')!.dispatch('click'); await flush();
  expect(completeDaily).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: '数据核实' }), '两年已核实', plugin.settings);
  expect(refresh).toHaveBeenCalledOnce(); expect(modal.opened).toBe(false);
 });
 it('creates independent work and can preselect a focus task from its card', async () => {
  const { app, plugin } = setup(); const done = vi.fn();
  const task = { file: new TFile('Tasks.md'), line: '- [ ] 长期项目 #focus', lineNumber: 0, completed: false, tags: ['#focus'], progress: [] };
  vi.mocked(scanTasks).mockResolvedValue([task as never]);
  const modal = new DailyActionModal(app, plugin.settings, '2026-10-09', done, task as never); modal.open(); await flush();
  const el = modal.contentEl as unknown as FakeDomEl;
  el.children.find((c) => c.tag === 'input')!.value = '核实数据';
  find(el, '添加行动')!.dispatch('click'); await flush();
  expect(addDaily).toHaveBeenCalledWith(app, '核实数据', '2026-10-09', task); expect(done).toHaveBeenCalledOnce();
 });
 it('shows a useful empty state without creating a file', async () => {
  vi.mocked(readDaily).mockResolvedValue([]); const { view, el } = setup(); await view.refresh();
  expect(texts(el)).toContain('从长期任务选一个具体动作'); expect(addDaily).not.toHaveBeenCalled();
 });
});


describe('two-column daily planning', () => {
 it('renders both columns and opens a linked action on the selected day', async () => {
  vi.mocked(readDaily).mockResolvedValue([]);
  const task = { file: new TFile('Tasks.md'), line: '- [ ] 长期评估 #focus', lineNumber: 0, completed: false, tags: ['#focus'], progress: [] };
  vi.mocked(scanTasks).mockResolvedValue([task as never]);
  const { view, el, app } = setup(true); await view.onOpen();
  expect(view.getViewType()).toBe('pftf-daily-planning');
  expect(el.findByClass('pftf-planning-longterm')).toBeDefined();
  expect(el.findByClass('pftf-planning-actions')).toBeDefined();
  const dateInput = el.findByClass('pftf-daily-toolbar')!.children.find((c) => c.tag === 'input')!;
  dateInput.value = '2026-10-12'; dateInput.dispatch('change'); await flush();
  find(el, '安排到所选日')!.dispatch('click'); await flush();
  const modal = createdModals.at(-1)!;
  modal.contentEl.children.find((c) => c.tag === 'input')!.value = '核实数据';
  find(modal.contentEl, '添加行动')!.dispatch('click'); await flush();
  expect(addDaily).toHaveBeenCalledWith(app, '核实数据', '2026-10-12', task);
 });
 it('refreshes counts and latest progress together after completion', async () => {
  const day = formatIsoDate(new Date());
  const task = { file: new TFile('Tasks.md'), line: '- [ ] 长期评估 #focus ^pftf-project', lineNumber: 0, completed: false, tags: ['#focus'], progress: [] };
  vi.mocked(scanTasks).mockResolvedValue([task as never]);
  const action = { title: '核实数据', completed: false, line: '', meta: { id: 'pftf-1', date: day, parent: { block: 'pftf-project', title: '长期评估' } } };
  vi.mocked(readDaily).mockResolvedValue([action]);
  const { view, el } = setup(true); await view.refresh();
  expect(texts(el.findByClass('pftf-planning-longterm')!)).toContain('已安排 1 项 · 完成 0 项');
  find(el, '完成')!.dispatch('click'); await flush();
  vi.mocked(readDaily).mockResolvedValue([{ ...action, completed: true }]);
  vi.mocked(scanTasks).mockResolvedValue([{ ...task, progress: [{ lineNumber: 1, alert: false, text: '已核实两年数据' }] } as never]);
  const modal = createdModals.at(-1)!; find(modal.contentEl, '确认完成')!.dispatch('click'); await flush();
  const left = texts(el.findByClass('pftf-planning-longterm')!);
  expect(left).toContain('已安排 1 项 · 完成 1 项'); expect(left).toContain('已核实两年数据');
 });
});


describe('action editing UI', () => {
 it('opens a populated editable form from the title and saves changes', async () => {
  const action = { title: '旧行动', completed: false, line: 'old', meta: { id: 'pftf-test', date: formatIsoDate(new Date()), parent: { block: 'missing', title: '原关联任务' } } };
  vi.mocked(readDaily).mockResolvedValue([action]);
  const { view, el } = setup(); await view.refresh(); find(el, '旧行动')!.dispatch('click'); await flush();
  const modal = createdModals.at(-1)!; expect(modal.titleEl.text).toBe('编辑行动');
  const inputs = modal.contentEl.children.filter((c) => c.tag === 'input');
  expect(inputs[0]!.value).toBe('旧行动'); inputs[0]!.value = '修改后的行动'; inputs[1]!.value = '2026-10-12';
  expect(modal.contentEl.children.find((c) => c.tag === 'select')!.value).toBe('keep');
  find(modal.contentEl, '保存修改')!.dispatch('click'); await flush();
  expect(editDaily).toHaveBeenCalledWith(expect.anything(), action, { title: '修改后的行动', date: '2026-10-12', result: undefined, parent: undefined }, expect.anything());
  expect(modal.opened).toBe(false);
 });
 it('cancel leaves the action untouched', async () => {
  const action = { title: '旧行动', completed: false, line: 'old', meta: { id: 'pftf-test', date: formatIsoDate(new Date()) } };
  vi.mocked(readDaily).mockResolvedValue([action]); const { view, el } = setup(); await view.refresh();
  find(el, '编辑')!.dispatch('click'); await flush();
  const modal = createdModals.at(-1)!; modal.contentEl.children.find((c) => c.tag === 'input')!.value = '不要保存';
  find(modal.contentEl, '取消')!.dispatch('click'); await flush();
  expect(editDaily).not.toHaveBeenCalled(); expect(modal.opened).toBe(false);
 });
});
