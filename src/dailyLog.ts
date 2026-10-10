import { App, TFile, Notice, debounce } from 'obsidian';
import type FocusFirstPlugin from './main';
import type { FocusFirstSettings } from './settings';
import { formatIsoDate } from './dateUtils';
import { validDailyDate } from './dailyWork';
import { LogEntry, readLogEntries, renderLogBody, uniqueLogEntries } from './dailyLogEntries';

export const DAILY_LOG_FOLDER = 'PFTF/Daily Log';
export const LEGACY_DAILY_LOG_FOLDER = '2_Areas/任务与节奏/Daily Log';
export const LOG_BEGIN = '<!-- pftf-daily-log:begin -->';
export const LOG_END = '<!-- pftf-daily-log:end -->';
export const dailyLogPath = (date: string, folder = DAILY_LOG_FOLDER) => `${folder}/${date}.md`;
const legacyExcludedRoots = ['000_Agent/', '09_AI输出/', 'attachments/', 'My_templates/'];
const excludedSource = (path: string, folder: string) => folder === LEGACY_DAILY_LOG_FOLDER && legacyExcludedRoots.some(root => path.startsWith(root));
const isLog = (path: string) => [DAILY_LOG_FOLDER, LEGACY_DAILY_LOG_FOLDER].some(folder => path === folder || path.startsWith(`${folder}/`));

/** Replace only the owned region, preserving every byte of the manual area. */
export function updateLogContent(content: string, body: string): string {
 const starts = content.split(LOG_BEGIN).length - 1, ends = content.split(LOG_END).length - 1;
 if (starts !== 1 || ends !== 1 || content.indexOf(LOG_BEGIN) > content.indexOf(LOG_END)) {
  throw new Error('Daily log 自动汇总标记缺失或重复，已停止写入；请恢复标记后重试。');
 }
 return content.slice(0, content.indexOf(LOG_BEGIN) + LOG_BEGIN.length) + '\n' + body.trimEnd() + '\n' + content.slice(content.indexOf(LOG_END));
}
const newLog = (date: string, body: string) => `# Daily log · ${date}\n\n## 自动汇总\n\n来自项目进展、思考和每日行动；请在原记录中修改，以下区域会自动同步。\n\n${LOG_BEGIN}\n${body.trimEnd()}\n${LOG_END}\n\n## 我的补充\n\n`;

/** One queued writer per plugin; source events are coalesced and output events ignored. */
export class DailyLogService {
 private cache = new Map<string, { stamp: string; heading: string; entries: LogEntry[] }>();
 private queue: Promise<unknown> = Promise.resolve();
 private stopped = false;
 private errorMessage = '';
 private startDate: string;
 private folder: string;
 constructor(private app: App, private settings: () => FocusFirstSettings, startDate = formatIsoDate(new Date())) {
  this.startDate = startDate;
  const legacy = LEGACY_DAILY_LOG_FOLDER;
  this.folder = app.vault.getAbstractFileByPath?.(legacy) || (app.vault.getMarkdownFiles?.() ?? []).some(file => file.path.startsWith(`${legacy}/`)) ? legacy : DAILY_LOG_FOLDER;
 }
 ignores(path: string): boolean { return isLog(path) || excludedSource(path, this.folder); }
 stop(): void { this.stopped = true; this.cache.clear(); }
 invalidate(path: string): void { this.cache.delete(path); }
 sync(date?: string): Promise<TFile | undefined> {
  if (date !== undefined && !validDailyDate(date)) return Promise.reject(new Error('日志日期无效。'));
  const run = this.queue.catch(() => {}).then(() => this.rebuild(date));
  this.queue = run;
  return run;
 }
 private async rebuild(requestedDate?: string): Promise<TFile | undefined> {
  if (this.stopped) return;
  const settings = this.settings();
  const files = this.app.vault.getMarkdownFiles();
  const entries: LogEntry[] = [];
  const live = new Set<string>();
  for (const file of files) {
   if (this.ignores(file.path)) continue;
   live.add(file.path);
   const stamp = `${file.stat?.mtime}:${file.stat?.size}`;
   let cached = this.cache.get(file.path);
   if (!cached || cached.stamp !== stamp || cached.heading !== settings.progressHeading) {
    const content = await this.app.vault.read(file);
    const parsed = readLogEntries(file.path, content, settings.progressHeading);
    cached = { stamp, heading: settings.progressHeading, entries: parsed };
    this.cache.set(file.path, cached);
   }
   entries.push(...cached.entries);
  }
  for (const path of this.cache.keys()) if (!live.has(path)) this.cache.delete(path);
  if (this.stopped) return;
  const byDate = new Map<string, LogEntry[]>();
  for (const entry of uniqueLogEntries(entries)) {
   const group = byDate.get(entry.date) ?? []; group.push(entry); byDate.set(entry.date, group);
  }
  const today = formatIsoDate(new Date());
  const dates = new Set([today, ...(requestedDate ? [requestedDate] : [])]);
  for (const date of byDate.keys()) if (date >= this.startDate && date <= today) dates.add(date);
  // Reconcile existing historical reports too, including deleted or re-dated sources.
  for (const file of files) {
   if (file.path.startsWith(`${this.folder}/`) && validDailyDate(file.basename)) dates.add(file.basename);
  }
  let requested: TFile | undefined;
  for (const date of dates) {
   if (this.stopped) break;
   const file = await this.write(date, renderLogBody(byDate.get(date) ?? []));
   if (date === (requestedDate ?? today)) requested = file;
  }
  return requested;
 }
 private async write(date: string, body: string): Promise<TFile> {
  const path = dailyLogPath(date, this.folder);
  const existing = this.app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
   const content = await this.app.vault.read(existing);
   if (this.stopped) return existing;
   if (updateLogContent(content, body) !== content) {
    await this.app.vault.process(existing, current => updateLogContent(current, body));
   }
   return existing;
  }
  if (existing) throw new Error(`${path} 已存在且不是 Markdown 文件。`);
  let folder = '';
  for (const part of this.folder.split('/')) {
   folder = folder ? `${folder}/${part}` : part;
   if (!this.app.vault.getAbstractFileByPath(folder)) {
    try { await this.app.vault.createFolder(folder); }
    catch (error) { if (!this.app.vault.getAbstractFileByPath(folder)) throw error; }
   }
  }
  if (this.stopped) throw new Error('Daily log 同步已停止。');
  return this.app.vault.create(path, newLog(date, body));
 }
 backgroundSync(): void {
  void this.sync().then(() => { this.errorMessage = ''; }).catch((error: unknown) => {
   const message = error instanceof Error ? error.message : 'Daily log 同步失败，请重试。';
   if (!this.stopped && this.errorMessage !== message) { new Notice(message); this.errorMessage = message; }
  });
 }
}

export function registerDailyLog(plugin: FocusFirstPlugin): DailyLogService {
 const service = new DailyLogService(plugin.app, () => plugin.settings, plugin.settings.dailyLogStartDate);
 let active = true;
 const refresh = debounce(() => service.backgroundSync(), 1200, true);
 const changed = (file: { path: string }) => {
  if (service.ignores(file.path)) return;
  service.invalidate(file.path); refresh();
 };
 plugin.registerEvent(plugin.app.vault.on('modify', changed));
 plugin.registerEvent(plugin.app.vault.on('create', changed));
 plugin.registerEvent(plugin.app.vault.on('delete', changed));
 plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
  service.invalidate(oldPath); service.invalidate(file.path);
  if (!service.ignores(oldPath) || !service.ignores(file.path)) refresh();
 }));
 plugin.app.workspace.onLayoutReady(() => {
 if (!active) return;
 service.backgroundSync();
 let day = formatIsoDate(new Date());
 plugin.registerInterval(window.setInterval(() => {
  const now = formatIsoDate(new Date());
  if (day !== now) { day = now; service.backgroundSync(); }
 }, 60_000));
 });
 plugin.register(() => { active = false; service.stop(); refresh.cancel(); });
 return service;
}
