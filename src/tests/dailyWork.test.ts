import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile, TFolder } from './__mocks__/obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import { TaskItem, scanTasks } from '../taskScanner';
import { addDaily, editDaily, readDaily, completeDaily, changeDaily, reopenDaily, linkDaily, parseDailyLine, dailyLine, DAILY_PATH, LEGACY_DAILY_PATH } from '../dailyWork';
import { parseProgressLine } from '../progressLog';
import { taskTitle, setDueDate } from '../tasksFormat';

function vault(initial: Record<string, string> = {}) {
 const content = new Map(Object.entries(initial));
 const files = new Map(Object.keys(initial).map((p) => [p, new TFile(p)]));
 const folders = new Map<string, TFolder>();
 const app = {
  vault: {
   getAbstractFileByPath: (p: string) => files.get(p) ?? folders.get(p),
   getMarkdownFiles: () => [...files.values()],
   read: async (f: TFile) => content.get(f.path)!,
   cachedRead: async (f: TFile) => content.get(f.path)!,
   createFolder: async (p: string) => { folders.set(p, new TFolder(p)); },
   create: async (p: string, text: string) => { const f = new TFile(p); files.set(p, f); content.set(p, text); return f; },
   process: async (f: TFile, update: (s: string) => string) => { const next = update(content.get(f.path)!); content.set(f.path, next); return next; },
  },
  metadataCache: {
   getFirstLinkpathDest: (p: string) => files.get(`${p}.md`),
   getFileCache: (f: TFile) => ({ listItems: content.get(f.path)!.split('\n').flatMap((line, i) => {
    const m = /^- \[(.)\]/.exec(line); return m ? [{ task: m[1], parent: -1, position: { start: { line: i } } }] : [];
   }) }),
  },
 } as unknown as App;
 const task = (p = 'Tasks.md', lineNumber = 0): TaskItem => ({ file: files.get(p)! as unknown as import('obsidian').TFile, line: content.get(p)!.split('\n')[lineNumber]!, lineNumber, completed: false, progress: [], tags: ['#focus'] });
 return { app, content, files, task };
}
const settings = { ...DEFAULT_SETTINGS };

describe('daily work persistence and progress', () => {
 it('keeps an existing legacy daily file instead of creating a second one', async () => {
  const v = vault({ [LEGACY_DAILY_PATH]: '# 原有每日工作\n' });
  await addDaily(v.app, '核对发布包', '2026-10-09');
  expect(v.content.get(LEGACY_DAILY_PATH)).toContain('核对发布包');
  expect(v.files.has(DAILY_PATH)).toBe(false);
  expect((await readDaily(v.app))[0]?.title).toBe('核对发布包');
 });
 it('adds and completes independent work without creating a focus task', async () => {
  const v = vault(); await addDaily(v.app, '临时准备会议材料', '2026-10-09');
  const [a] = await readDaily(v.app); expect(a!.meta.parent).toBeUndefined();
  await completeDaily(v.app, a!, '已发送', settings);
  expect((await readDaily(v.app))[0]).toMatchObject({ completed: true, meta: { result: '已发送' } });
  expect(v.files.size).toBe(1);
 });
 it('preserves existing daily file text and all parent data while appending', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus\n    - 2026-10-01 已有进展\n\n其他内容', [DAILY_PATH]: '# My notes\n\n保留原文\n' });
  await addDaily(v.app, '核实数据', '2026-10-09', v.task());
  const [a] = await readDaily(v.app);
  await completeDaily(v.app, a!, '核实两年，第三年待补充', settings);
  const text = v.content.get('Tasks.md')!;
  expect(text).toContain('- [ ] 调研 #focus ^pftf-');
  expect(text).toContain('已有进展'); expect(text).toContain('其他内容');
  expect(text).toContain('完成每日行动：核实数据；核实两年，第三年待补充');
  expect(v.content.get(DAILY_PATH)).toMatch(/^# My notes\n\n保留原文\n/);
  expect((await readDaily(v.app))[0]!.meta.synced).toBe(true);
 });
 it('finds a renamed, moved task after priority/date edits', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动', '2026-10-09', v.task()); const [a] = await readDaily(v.app);
  const moved = setDueDate(v.content.get('Tasks.md')!.replace('调研', '新标题'), '2026-10-30');
  v.content.delete('Tasks.md'); v.files.delete('Tasks.md');
  v.content.set('Moved.md', `# 新文件\n\n${moved}`); v.files.set('Moved.md', new TFile('Moved.md'));
  await completeDaily(v.app, a!, '', settings);
  expect(v.content.get('Moved.md')).toContain('完成每日行动：行动');
  expect(taskTitle(moved)).toBe('新标题');
 });
 it('uses the home note progress section without completing the parent', async () => {
  const v = vault({ 'Tasks.md': '- [ ] [[Project]] #focus', 'Project.md': '# 项目\n\n已有正文\n' });
  await addDaily(v.app, '行动', '2026-10-09', v.task());
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '', settings);
  expect(v.content.get('Project.md')).toContain(`## ${settings.progressHeading}`);
  expect(v.content.get('Project.md')).toContain('完成每日行动');
  expect(v.content.get('Tasks.md')).toMatch(/^- \[ \]/);
 });
 it('keeps the completed action and retries a failed progress write exactly once', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动', '2026-10-09', v.task());
  const original = v.app.vault.process.bind(v.app.vault);
  let fail = true;
  vi.spyOn(v.app.vault, 'process').mockImplementation(async (file, fn) => {
   if (file.path === 'Tasks.md' && fail) { fail = false; throw new Error('disk'); }
   return original(file, fn);
  });
  await expect(completeDaily(v.app, (await readDaily(v.app))[0]!, '成果', settings)).rejects.toThrow('disk');
  const [pending] = await readDaily(v.app); expect(pending!.completed).toBe(true); expect(pending!.meta.synced).toBe(false);
  await completeDaily(v.app, pending!, '不要覆盖原成果', settings);
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '', settings);
  expect(v.content.get('Tasks.md')!.match(/完成每日行动/g)).toHaveLength(1);
  expect(v.content.get('Tasks.md')).toContain('成果');
 });
 it('does not duplicate progress when acknowledgement fails after the log was written', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动', '2026-10-09', v.task());
  const original = v.app.vault.process.bind(v.app.vault); let dailyWrites = 0;
  vi.spyOn(v.app.vault, 'process').mockImplementation(async (file, fn) => {
   if (file.path === DAILY_PATH && ++dailyWrites === 2) throw new Error('ack');
   return original(file, fn);
  });
  await expect(completeDaily(v.app, (await readDaily(v.app))[0]!, '', settings)).rejects.toThrow('ack');
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '', settings);
  expect(v.content.get('Tasks.md')!.match(/完成每日行动/g)).toHaveLength(1);
 });
 it('rejects stale daily updates and duplicate IDs without changing the file', async () => {
  const v = vault(); await addDaily(v.app, '行动', '2026-10-08'); const [a] = await readDaily(v.app);
  await changeDaily(v.app, a!, { ...a!, meta: { ...a!.meta, date: '2026-10-09' } });
  const current = v.content.get(DAILY_PATH);
  await expect(changeDaily(v.app, a!, { ...a!, completed: true })).rejects.toThrow('已变化');
  expect(v.content.get(DAILY_PATH)).toBe(current);
  const [fresh] = await readDaily(v.app); v.content.set(DAILY_PATH, `${current}${fresh!.line}\n`);
  await expect(reopenDaily(v.app, fresh!)).rejects.toThrow('已变化');
 });
 it('refuses to attach a stale parent without changing its contents', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' }); const old = v.task();
  v.content.set('Tasks.md', '别人的修改');
  await expect(addDaily(v.app, '行动', '2026-10-09', old)).rejects.toThrow('长期任务已变化');
  expect(v.content.get('Tasks.md')).toBe('别人的修改'); expect(await readDaily(v.app)).toEqual([]);
 });
 it('refuses missing or duplicated parent IDs and retains pending work', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动', '2026-10-09', v.task());
  v.content.set('Tasks.md', `${v.content.get('Tasks.md')}\n${v.content.get('Tasks.md')}`);
  await expect(completeDaily(v.app, (await readDaily(v.app))[0]!, '', settings)).rejects.toThrow('唯一');
  expect((await readDaily(v.app))[0]!.completed).toBe(true);
  expect(v.content.get('Tasks.md')).not.toContain('完成每日行动');
 });
 it('can link independent work later, detach it, reopen and complete again', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动', '2026-10-09');
  await linkDaily(v.app, (await readDaily(v.app))[0]!, v.task());
  await linkDaily(v.app, (await readDaily(v.app))[0]!);
  expect((await readDaily(v.app))[0]!.meta.parent).toBeUndefined();
  await linkDaily(v.app, (await readDaily(v.app))[0]!, v.task());
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '第一次', settings);
  await reopenDaily(v.app, (await readDaily(v.app))[0]!);
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '第二次', settings);
  expect(v.content.get('Tasks.md')!.match(/完成每日行动/g)).toHaveLength(2);
 });
 it('keeps daily actions out of the matrix scanner', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动 #focus', '2026-10-09');
  expect((await scanTasks(v.app, settings)).map((t) => t.line)).toEqual(['- [ ] 调研 #focus']);
 });
 it('rejects bad metadata and dates; serializes newlines safely', async () => {
  expect(parseDailyLine('- [ ] bad <!-- pftf-daily:%ZZ -->')).toBeUndefined();
  expect(parseDailyLine('- [ ] normal')).toBeUndefined();
  const v = vault(); await expect(addDaily(v.app, '行动', '2026-02-30')).rejects.toThrow('日期');
  const line = dailyLine({ title: '第一行\n第二行', completed: false, meta: { id: 'pftf-test', date: '2026-10-09' } });
  expect(parseDailyLine(line)!.title).toBe('第一行 第二行');
 });
 it('hides retry receipts from rendered progress', () => {
  expect(parseProgressLine('    - 2026-10-09 完成行动 <!-- pftf-receipt:pftf-test -->', 0)!.text).toBe('完成行动');
 });
});


describe('editing daily actions', () => {
 it('persists title and date without losing identity, link or unrelated text', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '旧行动', '2026-10-09', v.task());
  const before = (await readDaily(v.app))[0]!;
  const parentBefore = v.content.get('Tasks.md');
  await editDaily(v.app, before, { title: '新行动', date: '2026-10-10' }, settings);
  const after = (await readDaily(v.app))[0]!;
  expect(after.title).toBe('新行动'); expect(after.meta.date).toBe('2026-10-10');
  expect(after.meta.id).toBe(before.meta.id); expect(after.meta.parent).toEqual(before.meta.parent);
  expect(v.content.get('Tasks.md')).toBe(parentBefore); expect(after.completed).toBe(false);
 });
 it('can reassign or unlink an open action', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 甲 #focus\n- [ ] 乙 #focus' });
  await addDaily(v.app, '行动', '2026-10-09', v.task());
  await editDaily(v.app, (await readDaily(v.app))[0]!, { title: '行动', date: '2026-10-09', parent: v.task('Tasks.md', 1) }, settings);
  expect((await readDaily(v.app))[0]!.meta.parent!.title).toBe('乙');
  await editDaily(v.app, (await readDaily(v.app))[0]!, { title: '行动', date: '2026-10-09', parent: null }, settings);
  expect((await readDaily(v.app))[0]!.meta.parent).toBeUndefined();
 });
 it('corrects a completed outcome in place without creating a second progress entry', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '旧行动', '2026-10-09', v.task());
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '旧成果', settings);
  await editDaily(v.app, (await readDaily(v.app))[0]!, { title: '正确行动', date: '2026-10-09', result: '正确成果' }, settings);
  expect(v.content.get('Tasks.md')!.match(/完成每日行动/g)).toHaveLength(1);
  expect(v.content.get('Tasks.md')).toContain('正确行动；正确成果'); expect(v.content.get('Tasks.md')).not.toContain('旧成果');
  const after = (await readDaily(v.app))[0]!; expect(after.completed).toBe(true); expect(after.meta.synced).toBe(true);
 });
 it('rejects stale edits and invalid values without overwriting saved data', async () => {
  const v = vault(); await addDaily(v.app, '行动', '2026-10-09'); const old = (await readDaily(v.app))[0]!;
  await editDaily(v.app, old, { title: '新行动', date: '2026-10-09' }, settings);
  await expect(editDaily(v.app, old, { title: '过时', date: '2026-10-09' }, settings)).rejects.toThrow('已变化');
  const fresh = (await readDaily(v.app))[0]!;
  await expect(editDaily(v.app, fresh, { title: ' ', date: '2026-10-09' }, settings)).rejects.toThrow('请填写');
  await expect(editDaily(v.app, fresh, { title: '测试', date: '2026-02-30' }, settings)).rejects.toThrow('有效日期');
  expect((await readDaily(v.app))[0]!.title).toBe('新行动');
 });
 it('retains completed edits after a write failure, and retry updates the original receipt', async () => {
  const v = vault({ 'Tasks.md': '- [ ] 调研 #focus' });
  await addDaily(v.app, '行动', '2026-10-09', v.task());
  await completeDaily(v.app, (await readDaily(v.app))[0]!, '旧成果', settings);
  const original = v.app.vault.process.bind(v.app.vault); let fail = true;
  vi.spyOn(v.app.vault, 'process').mockImplementation(async (file, fn) => {
   if (file.path === 'Tasks.md' && fail) { fail = false; throw new Error('disk'); }
   return original(file, fn);
  });
  await expect(editDaily(v.app, (await readDaily(v.app))[0]!, { title: '改后行动', date: '2026-10-09', result: '新成果' }, settings)).rejects.toThrow('disk');
  const saved = (await readDaily(v.app))[0]!; expect(saved.meta.synced).toBe(false); expect(saved.meta.result).toBe('新成果');
  await completeDaily(v.app, saved, '', settings);
  expect(v.content.get('Tasks.md')!.match(/完成每日行动/g)).toHaveLength(1); expect(v.content.get('Tasks.md')).toContain('新成果');
 });
});
