import { App, TFile } from 'obsidian';
import type { FocusFirstSettings } from './settings';
import { parseTaskLine, TaskItem } from './taskScanner';
import type { EditSnapshot } from './undo';

export type BoardLane = 'focus' | 'work' | 'urgent' | 'delegate';
export const BOARD_LABELS: Record<BoardLane, string> = { focus: 'Focus', work: '工作事项', urgent: 'Urgent', delegate: 'Delegate' };
const TAGS = { work: '#pftf/work', urgent: '#pftf/urgent', delegate: '#pftf/delegate' };
export function focusCapacity(value: number): number {
 return Number.isFinite(value) && value >= 1 ? Math.min(3, Math.floor(value)) : 3;
}
export function boardLane(task: TaskItem, settings: FocusFirstSettings): BoardLane {
 const tags = task.tags.map(tag => tag.toLowerCase());
 const has = (tag: string) => !!tag.trim() && tags.includes(tag.trim().toLowerCase());
 if (has(settings.focusTag)) return 'focus';
 for (const lane of ['work', 'urgent', 'delegate'] as const) if (has(TAGS[lane])) return lane;
 // Read legacy placements without rewriting users' notes during upgrade.
 if (has(settings.quadrants.delegate.tag)) return 'delegate';
 if (has(settings.quadrants.do.tag)) return 'urgent';
 return 'work';
}
export function boardLine(line: string, lane: BoardLane, settings: FocusFirstSettings): string {
 const blockId = line.match(/\s+(\^[A-Za-z0-9-]+)\s*$/)?.[1];
 const body = blockId ? line.slice(0, line.lastIndexOf(blockId)).trimEnd() : line;
 let moved = body;
 for (const tag of [settings.focusTag, ...Object.values(TAGS), ...(['do', 'schedule', 'delegate', 'eliminate'] as const).map(key => settings.quadrants[key].tag)]) {
  if (!tag.trim()) continue;
  const escaped = tag.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  moved = moved.replace(new RegExp(`(^|[ \t])${escaped}(?=\\s|$)`, 'gi'), '').trimEnd();
 }
 moved = moved.trimEnd() + ' ' + (lane === 'focus' ? settings.focusTag.trim() : TAGS[lane]);
 return blockId ? `${moved} ${blockId}` : moved;
}

// Serialize across all views, including simultaneous keyboard and drag actions.
const queues = new WeakMap<App, Promise<unknown>>();
export function boardTransaction<T>(app: App, work: () => Promise<T>): Promise<T> {
 const pending = (queues.get(app) ?? Promise.resolve()).catch(() => {}).then(work);
 queues.set(app, pending);
 return pending;
}
/** Count from current file contents, including tasks added before metadata cache refresh. */
export async function countFocusTasks(app: App, settings: FocusFirstSettings): Promise<number> {
 let count = 0;
 for (const file of app.vault.getMarkdownFiles()) {
  const folder = settings.taskFolder.replace(/\/$/, '');
  if (settings.taskScope === 'folder' && folder && !file.path.startsWith(folder + '/')) continue;
  const lines = (await app.vault.read(file)).split('\n');
  let fence = '';
  for (let i = 0; i < lines.length; i++) {
   const line = lines[i]!;
   const delimiter = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
   if (delimiter) { if (!fence) fence = delimiter; else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = ''; continue; }
   if (fence || line.includes('<!-- pftf-daily:')) continue;
   if (!settings.showSubtasks && /^\s/.test(line)) continue;
   const mark = /^\s*[-*+]\s+\[(.)\]/.exec(line)?.[1];
   if (mark === undefined) continue;
   const task = parseTaskLine(app, file, line, i, settings, mark);
   if (!task.completed && boardLane(task, settings) === 'focus') count++;
  }
 }
 return count;
}
export async function setFocusCapacity(app: App, settings: FocusFirstSettings, value: number): Promise<void> {
 return boardTransaction(app, async () => {
  const capacity = focusCapacity(value);
  const used = await countFocusTasks(app, settings);
  if (used > capacity) throw new Error(`Focus 已有 ${used} 项，请先移出 ${used - capacity} 项，再将容量设为 ${capacity}。`);
  settings.focusTargetCount = capacity;
 });
}
export async function moveBoardTask(app: App, settings: FocusFirstSettings, task: Pick<TaskItem, 'file' | 'lineNumber' | 'line'>, lane: BoardLane): Promise<EditSnapshot | undefined> {
 return boardTransaction(app, async () => {
  const file = app.vault.getAbstractFileByPath(task.file.path);
  if (!(file instanceof TFile)) throw new Error('事项文件已不存在，请刷新后重试。');
  const lines = (await app.vault.read(file)).split('\n');
  if (lines[task.lineNumber] !== task.line) throw new Error('事项已发生变化，请刷新后重试。');
  const current = parseTaskLine(app, file, task.line, task.lineNumber, settings);
  if (lane === 'focus' && boardLane(current, settings) !== 'focus') {
   if (!settings.focusTag.trim()) throw new Error('请先在设置中配置 Focus 标签。');
   const count = await countFocusTasks(app, settings);
   if (count >= focusCapacity(settings.focusTargetCount)) throw new Error('Focus 容量已满，请先将一项移到其他区域。');
  }
  const next = boardLine(task.line, lane, settings);
  if (next === task.line) return;
  await app.vault.process(file, content => {
   const latest = content.split('\n');
   if (latest[task.lineNumber] !== task.line) throw new Error('事项已发生变化，请刷新后重试。');
   latest[task.lineNumber] = next;
   return latest.join('\n');
  });
  return { filePath: file.path, startLine: task.lineNumber, before: [task.line], after: [next],
   undo: async () => { await moveBoardTask(app, settings, { file, lineNumber: task.lineNumber, line: next }, boardLane(current, settings)); },
  };
 });
}
