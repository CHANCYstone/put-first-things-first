import { Notice } from 'obsidian';
export function button(el: HTMLElement, label: string, run: () => Promise<void>): HTMLButtonElement {
 const btn = el.createEl('button', { text: label });
 btn.addEventListener('click', () => {
  btn.disabled = true;
  void run().catch((e: unknown) => new Notice(e instanceof Error ? e.message : '操作失败，请重试。'))
   .finally(() => { btn.disabled = false; });
 });
 return btn;
}
