import { describe, it, expect, vi } from 'vitest';
import { ProgressModal } from '../progressModal';
import { DEFAULT_SETTINGS } from '../settings';
import { TFile, FakeDomEl } from './__mocks__/obsidian';
import type { App } from 'obsidian';
import type { TaskItem } from '../taskScanner';

function setup() {
	const note = new TFile('Project.md');
	let content = '# Project';
	const task = { file: new TFile('Tasks.md'), homeNote: note, line: '- [ ] Project', lineNumber: 0, completed: false, tags: [], progress: [] } as unknown as TaskItem;
	const modify = vi.fn(async (_file: unknown, text: string) => { content = text; });
	const app = { vault: { read: async () => content, modify } } as unknown as App;
	const modal = new ProgressModal(app, task, DEFAULT_SETTINGS);
	modal.open();
	const root = modal.contentEl as unknown as FakeDomEl;
	return { task, modify, root, input: root.findByClass('focus-first-progress-input')!, button: root.findByClass('mod-cta')! };
}

describe('quick progress editor', () => {
	it('shows newly saved entries even when saving creates the progress heading', async () => {
		const { task, input, button, modify } = setup();
		input.value = '计划：学习\n未推进：等材料';
		button.dispatch('click'); button.dispatch('click');
		await vi.waitFor(() => expect(input.value).toBe(''));
		expect(modify).toHaveBeenCalledOnce();
		expect(task.progress.map(entry => entry.text)).toEqual(['计划：学习', '未推进：等材料']);
	});
	it('keeps the draft after a failed save and allows retry', async () => {
		const { input, button, modify } = setup();
		modify.mockRejectedValueOnce(new Error('disk full'));
		input.value = '今天完成练习'; button.dispatch('click');
		await vi.waitFor(() => expect(button.text).toBe('记录'));
		expect(input.value).toBe('今天完成练习');
		button.dispatch('click');
		await vi.waitFor(() => expect(input.value).toBe(''));
		expect(modify).toHaveBeenCalledTimes(2);
	});
	it('keeps Enter as a newline and saves with Ctrl+Enter', async () => {
		const { input, modify } = setup(); input.value = '计划：阅读';
		input.dispatch('keydown', { key: 'Enter', preventDefault: vi.fn() });
		expect(modify).not.toHaveBeenCalled();
		input.dispatch('keydown', { key: 'Enter', ctrlKey: true, preventDefault: vi.fn() });
		await vi.waitFor(() => expect(modify).toHaveBeenCalledOnce());
	});
});
