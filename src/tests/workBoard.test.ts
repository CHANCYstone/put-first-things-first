import { describe, it, expect, vi } from 'vitest';
vi.mock('obsidian', () => import('./__mocks__/obsidian'));
import { TFile, type App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import { boardLane, boardLine, focusCapacity, moveBoardTask, setFocusCapacity } from '../workBoard';
import { parseTaskLine } from '../taskScanner';

function fixture(content: string, capacity = 3) {
 const file = new (TFile as unknown as { new (path: string): TFile })('work.md');
 const settings = structuredClone(DEFAULT_SETTINGS); settings.focusTargetCount = capacity;
 let stored = content;
 const app = {
  vault: {
   getMarkdownFiles: () => [file], getAbstractFileByPath: (p: string) => p === file.path ? file : null,
   read: async () => stored, cachedRead: async () => stored,
   process: async (_file: TFile, fn: (s: string) => string) => { stored = fn(stored); },
  },
  metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({
   listItems: stored.split('\n').flatMap((line, index) => {
    const match = /^([-*+] )\[(.)\]/.exec(line);
    return match ? [{ task: match[2], parent: -1, position: { start: { line: index } } }] : [];
   }),
  }) },
 } as unknown as App;
 const task = (n: number) => parseTaskLine(app, file, stored.split('\n')[n]!, n, settings);
 return { app, settings, task, read: () => stored };
}

describe('work board migration and moves', () => {
 it.each([['#focus #do', 'focus'], ['#do', 'urgent'], ['#schedule', 'work'], ['#eliminate', 'work'], ['#delegate', 'delegate'], ['', 'work'], ['#pftf/work #do', 'work']])('places legacy %s only in %s', (tag, lane) => {
  const f = fixture(`- [ ] A ${tag}`); expect(boardLane(f.task(0), f.settings)).toBe(lane);
 });
 it.each([0, -1, NaN, 4, 20])('normalizes legacy capacity %s to 3', value => expect(focusCapacity(value)).toBe(3));
 it('moves a module through all areas without changing its children, progress, link, deadline or ID', async () => {
  const tail = '\n\t- [ ] child A\n\t- 2026-10-10: progress\nOther unrelated text';
  const f = fixture('- [ ] [[Project A]] 📅 2026-10-12 #team #schedule ^project-a' + tail);
  for (const lane of ['focus', 'urgent', 'delegate', 'work'] as const) {
   await moveBoardTask(f.app, f.settings, f.task(0), lane);
   expect(boardLane(f.task(0), f.settings)).toBe(lane);
   expect(f.read().slice(f.read().indexOf('\n'))).toBe(tail);
   expect(f.read()).toContain('[[Project A]] 📅 2026-10-12 #team');
   expect(f.read().split('\n')[0]).toMatch(/\^project-a$/);
  }
 });
 it('does not overfill Focus when two views move tasks at once', async () => {
  const f = fixture('- [ ] A\n- [ ] B', 1);
  const results = await Promise.allSettled([moveBoardTask(f.app, f.settings, f.task(0), 'focus'), moveBoardTask(f.app, f.settings, f.task(1), 'focus')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(f.read().match(/#focus/g)).toHaveLength(1);
 });
 it('allows moving out, then filling the released slot', async () => {
  const f = fixture('- [ ] A #focus\n- [ ] B', 1);
  await moveBoardTask(f.app, f.settings, f.task(0), 'delegate');
  await moveBoardTask(f.app, f.settings, f.task(1), 'focus');
  expect(boardLane(f.task(0), f.settings)).toBe('delegate');
  expect(boardLane(f.task(1), f.settings)).toBe('focus');
 });
 it('refuses shrinking below occupied slots without losing tasks', async () => {
  const f = fixture('- [ ] A #focus\n- [ ] B #focus');
  const before = f.read();
  await expect(setFocusCapacity(f.app, f.settings, 1)).rejects.toThrow('先移出');
  expect(f.read()).toBe(before); expect(f.settings.focusTargetCount).toBe(3);
  await setFocusCapacity(f.app, f.settings, 2); expect(f.settings.focusTargetCount).toBe(2);
 });
 it('preserves legacy overflow while blocking new additions', async () => {
  const f = fixture('- [ ] A #focus\n- [ ] B #focus\n- [ ] C #focus\n- [ ] D #focus\n- [ ] E');
  await expect(moveBoardTask(f.app, f.settings, f.task(4), 'focus')).rejects.toThrow('容量已满');
  expect(f.read().match(/#focus/g)).toHaveLength(4);
 });
 it('rejects a stale card without overwriting unrelated edits', async () => {
  const f = fixture('- [ ] A'); const stale = f.task(0);
  await moveBoardTask(f.app, f.settings, stale, 'urgent');
  const before = f.read();
  await expect(moveBoardTask(f.app, f.settings, stale, 'delegate')).rejects.toThrow('发生变化');
  expect(f.read()).toBe(before);
 });
 it('uses a single explicit placement tag and preserves other tags', () => {
  expect(boardLine('- [ ] A #focus #do #pftf/work #team', 'delegate', DEFAULT_SETTINGS)).toBe('- [ ] A #team #pftf/delegate');
 });
});

describe('safe board metadata and undo', () => {
 it('does not strip URL fragments that happen to match placement tags', () => {
  expect(boardLine('- [ ] Read https://example.com/#do #do ^abc', 'work', DEFAULT_SETTINGS)).toBe('- [ ] Read https://example.com/#do #pftf/work ^abc');
 });
 it('rechecks capacity when undo would return a task to Focus', async () => {
  const f = fixture('- [ ] A #focus\n- [ ] B', 1);
  const moved = await moveBoardTask(f.app, f.settings, f.task(0), 'work');
  await moveBoardTask(f.app, f.settings, f.task(1), 'focus');
  await expect(moved!.undo!()).rejects.toThrow('容量已满');
  expect(f.read().match(/#focus/g)).toHaveLength(1);
 });
});
