import { App, TFile } from 'obsidian';
import type { FocusFirstSettings } from './settings';
import { TaskItem, parseTaskLine } from './taskScanner';
import { blockEnd, childIndent } from './progressLog';
import { sectionInsertion } from './noteSection';
import { formatIsoDate, parseIsoDate } from './dateUtils';
import { taskTitle } from './tasksFormat';

export const DAILY_PATH = 'PFTF/Daily Work.md';
export const LEGACY_DAILY_PATH = '2_Areas/任务与节奏/每日工作.md';
/** Keep existing vaults on their original file; new vaults use a neutral path. */
export const dailyPath = (app: App): string => app.vault.getAbstractFileByPath(LEGACY_DAILY_PATH) instanceof TFile ? LEGACY_DAILY_PATH : DAILY_PATH;
export const DAILY_MARK = '<!-- pftf-daily:';
interface ParentRef { block: string; title: string }
export interface DailyMeta {
 id: string; date: string; parent?: ParentRef; result?: string;
 completedAt?: string; receipt?: string; synced?: boolean;
}
export interface DailyAction { meta: DailyMeta; title: string; completed: boolean; line: string }
export function validDailyDate(value: string): boolean {
 const parsed = parseIsoDate(value);
 return !!parsed && formatIsoDate(parsed) === value;
}
const uid = () => `pftf-${crypto.randomUUID()}`;
const singleLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

export function parseDailyLine(line: string): DailyAction | undefined {
 const match = /^- \[([ xX])\] (.*?) <!-- pftf-daily:(\S+) -->$/.exec(line);
 if (!match) return;
 try {
  const meta = JSON.parse(decodeURIComponent(match[3]!)) as DailyMeta;
  if (!meta || typeof meta.id !== 'string' || !/^pftf-[a-z0-9-]+$/.test(meta.id)
   || typeof meta.date !== 'string' || !validDailyDate(meta.date)
   || (meta.parent && (typeof meta.parent.block !== 'string' || !/^[a-zA-Z0-9-]+$/.test(meta.parent.block) || typeof meta.parent.title !== 'string'))
   || (meta.result !== undefined && typeof meta.result !== 'string')
   || (meta.completedAt !== undefined && (typeof meta.completedAt !== 'string' || !validDailyDate(meta.completedAt)))
   || (meta.receipt !== undefined && (typeof meta.receipt !== 'string' || !/^pftf-[a-z0-9-]+$/.test(meta.receipt)))
   || (meta.synced !== undefined && typeof meta.synced !== 'boolean')) return;
  return { meta, title: match[2]!, completed: match[1] !== ' ', line };
 } catch { return; }
}
export function dailyLine(action: Omit<DailyAction, 'line'>): string {
 return `- [${action.completed ? 'x' : ' '}] ${singleLine(action.title)} ${DAILY_MARK}${encodeURIComponent(JSON.stringify(action.meta))} -->`;
}
export async function readDaily(app: App): Promise<DailyAction[]> {
 const file = app.vault.getAbstractFileByPath(dailyPath(app));
 if (!(file instanceof TFile)) return [];
 return (await app.vault.read(file)).split('\n').map(parseDailyLine).filter((a): a is DailyAction => !!a);
}
async function ensureDaily(app: App): Promise<TFile> {
 const path = dailyPath(app);
 const existing = app.vault.getAbstractFileByPath(path);
 if (existing instanceof TFile) return existing;
 const parts = path.split('/'); parts.pop();
 let folder = '';
 for (const part of parts) {
  folder = folder ? `${folder}/${part}` : part;
  if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
 }
 return app.vault.create(path, '# 每日工作\n\n由 PFTF 管理。每日行动独立完成，关联的长期任务保持原状态。\n\n');
}
/** Stable block IDs survive title edits, line moves and file renames. */
async function reference(app: App, task: TaskItem): Promise<ParentRef> {
 let block = '';
 await app.vault.process(task.file, (content) => {
  const lines = content.split('\n');
  if (lines[task.lineNumber] !== task.line) throw new Error('长期任务已变化，请刷新后重试。');
  block = / \^([a-zA-Z0-9-]+)(?=\s|$)/.exec(task.line)?.[1] ?? uid();
  if (!/ \^[a-zA-Z0-9-]+(?=\s|$)/.test(task.line)) lines[task.lineNumber] += ` ^${block}`;
  return lines.join('\n');
 });
 return { block, title: taskTitle(task.line).replace(/\s+\^[a-zA-Z0-9-]+\s*$/, '') };
}
export async function addDaily(app: App, title: string, date: string, task?: TaskItem): Promise<void> {
 if (!singleLine(title) || !validDailyDate(date)) throw new Error('请填写行动和有效日期。');
 const file = await ensureDaily(app);
 const parent = task ? await reference(app, task) : undefined;
 const action = { title, completed: false, meta: { id: uid(), date, parent } };
 await app.vault.process(file, (content) => `${content}${content.endsWith('\n') ? '' : '\n'}${dailyLine(action)}\n`);
}
/** Compare the complete row inside Vault.process, never overwrite a stale row. */
export async function changeDaily(app: App, old: DailyAction, next: Omit<DailyAction, 'line'>): Promise<DailyAction> {
 const file = app.vault.getAbstractFileByPath(dailyPath(app));
 if (!(file instanceof TFile)) throw new Error('每日工作文件不存在。');
 const line = dailyLine(next);
 await app.vault.process(file, (content) => {
  const lines = content.split('\n');
  const matches = lines.flatMap((l, i) => parseDailyLine(l)?.meta.id === old.meta.id ? [i] : []);
  if (matches.length !== 1 || lines[matches[0]!] !== old.line) throw new Error('行动已变化，请刷新后重试。');
  lines[matches[0]!] = line;
  return lines.join('\n');
 });
 return { ...next, line };
}
export async function linkDaily(app: App, action: DailyAction, task?: TaskItem): Promise<void> {
 if (action.completed) throw new Error('请先重新打开行动，再修改关联。');
 const parent = task ? await reference(app, task) : undefined;
 await changeDaily(app, action, { ...action, meta: { ...action.meta, parent } });
}
/** Editing preserves identity and completion; omitted parent means keep the existing link. */
export async function editDaily(
 app: App, action: DailyAction,
 changes: { title: string; date: string; result?: string; parent?: TaskItem | null },
 settings: FocusFirstSettings,
): Promise<void> {
 if (!singleLine(changes.title) || !validDailyDate(changes.date)) throw new Error('请填写行动和有效日期。');
 if (action.completed && changes.parent !== undefined) throw new Error('已完成行动请先重新打开，再修改关联。');
 let parent = action.meta.parent;
 if (changes.parent === null) parent = undefined;
 else if (changes.parent) parent = await reference(app, changes.parent);
 let saved = await changeDaily(app, action, { ...action, title: singleLine(changes.title), meta: {
  ...action.meta, date: changes.date, parent,
  result: changes.result === undefined ? action.meta.result : singleLine(changes.result),
  ...(action.completed && parent ? {
   receipt: action.meta.receipt ?? uid(), completedAt: action.meta.completedAt ?? formatIsoDate(new Date()), synced: false,
  } : {}),
 } });
 if (saved.completed && parent) {
  await writeProgress(app, saved, settings);
  saved = await changeDaily(app, saved, { ...saved, meta: { ...saved.meta, synced: true } });
 }
}
export async function findParent(app: App, ref: ParentRef, settings: FocusFirstSettings): Promise<TaskItem> {
 const matches: TaskItem[] = [];
 const ending = new RegExp(` \\^${ref.block}(?=\\s|$)`);
 for (const file of app.vault.getMarkdownFiles()) {
  if (file.path === DAILY_PATH || file.path === LEGACY_DAILY_PATH) continue;
  const lines = (await app.vault.read(file)).split('\n');
  lines.forEach((line, i) => {
   if (/^\s*[-*+] \[.\]/.test(line) && ending.test(line)) matches.push(parseTaskLine(app, file, line, i, settings));
  });
 }
 if (matches.length !== 1) throw new Error('找不到唯一的关联任务；行动已保留，请恢复任务后补记进展。');
 return matches[0]!;
}
async function writeProgress(app: App, action: DailyAction, settings: FocusFirstSettings): Promise<void> {
 const parent = await findParent(app, action.meta.parent!, settings);
 const file = parent.homeNote ?? parent.file;
 const marker = `<!-- pftf-receipt:${action.meta.receipt} -->`;
 const body = `${action.meta.completedAt} 完成每日行动：${singleLine(action.title)}${action.meta.result ? `；${singleLine(action.meta.result)}` : ''} [[${dailyPath(app).replace(/\.md$/, '')}|每日工作]] ${marker}`;
 await app.vault.process(file, (content) => {
  const lines = content.split('\n');
  const receipts = lines.flatMap((line, i) => line.includes(marker) ? [i] : []);
  if (receipts.length > 1) throw new Error('进展记录标识重复，请检查后重试。');
  if (receipts.length === 1) {
   const i = receipts[0]!;
   const indent = /^[ \t]*/.exec(lines[i]!)?.[0] ?? '';
   lines[i] = `${indent}- ${body}`;
   return lines.join('\n');
  }
  if (parent.homeNote) {
   const { insertAt, inserted } = sectionInsertion(lines, settings.progressHeading, [`- ${body}`]);
   lines.splice(insertAt, 0, ...inserted);
  } else {
   const indices = lines.flatMap((l, i) => new RegExp(` \\^${action.meta.parent!.block}(?=\\s|$)`).test(l) && /^\s*[-*+] \[.\]/.test(l) ? [i] : []);
   if (indices.length !== 1) throw new Error('关联任务已变化，请重试补记进展。');
   const i = indices[0]!;
   const end = blockEnd(lines, i);
   lines.splice(end, 0, `${childIndent(lines, i, end)}- ${body}`);
  }
  return lines.join('\n');
 });
}
/** Persist completion first; retry uses the same receipt after a partial failure. */
export async function completeDaily(app: App, action: DailyAction, result: string, settings: FocusFirstSettings): Promise<void> {
 let saved = action;
 if (!action.completed || !action.meta.receipt) {
  saved = await changeDaily(app, action, { ...action, completed: true, meta: {
   ...action.meta, result: singleLine(result), completedAt: formatIsoDate(new Date()), receipt: uid(), synced: false,
  } });
 }
 if (!saved.meta.parent || saved.meta.synced) return;
 await writeProgress(app, saved, settings);
 await changeDaily(app, saved, { ...saved, meta: { ...saved.meta, synced: true } });
}
export async function reopenDaily(app: App, action: DailyAction): Promise<void> {
 await changeDaily(app, action, { ...action, completed: false, meta: {
  ...action.meta, result: undefined, completedAt: undefined, receipt: undefined, synced: undefined,
 } });
}
