import { TaskItem } from './taskScanner';
import { BoardLane } from './workBoard';

/** A live insertion slot; the native drag image follows the pointer. */
export class BoardDragSort {
	private cards = new Map<HTMLElement, TaskItem>();
	private state?: { card: HTMLElement; task: TaskItem; placeholder: HTMLElement; lane: BoardLane; frame: number };
	private animations = new Map<HTMLElement, Animation>();

	constructor(
		private commit: (task: TaskItem, lane: BoardLane, anchor?: TaskItem, after?: boolean) => void,
		private cancelled: () => void,
	) {}

	get active(): boolean { return !!this.state; }

	reset(): void {
		this.finish();
		this.cards.clear();
	}

	bind(card: HTMLElement, task: TaskItem, lane: BoardLane): void {
		this.cards.set(card, task);
		card.addEventListener('dragstart', event => {
			if (!event.dataTransfer || this.active) return;
			event.dataTransfer.effectAllowed = 'move';
			const placeholder = card.ownerDocument.createElement('li');
			placeholder.className = 'pftf-sort-placeholder';
			placeholder.style.height = `${card.offsetHeight}px`;
			placeholder.setAttribute('aria-hidden', 'true');
			const state = { card, task, placeholder, lane, frame: 0 };
			this.state = state;
			// Keep the source connected and let the browser capture its drag image first.
			state.frame = window.requestAnimationFrame(() => {
				if (this.state !== state) return;
				card.before(placeholder);
				card.classList.add('pftf-sort-source');
			});
		});
		card.addEventListener('dragend', () => {
			if (!this.active) return;
			this.finish();
			this.cancelled();
		});
	}

	over(event: DragEvent, el: HTMLElement, lane: BoardLane): boolean {
		const state = this.state;
		if (!state) return false;
		event.preventDefault(); event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		const list = el.matches('.focus-first-task-item') ? el.parentElement : el.querySelector<HTMLElement>('.focus-first-task-list');
		if (!list || !state.placeholder.isConnected) return true;
		const bounds = list.getBoundingClientRect();
		if (list.scrollHeight > list.clientHeight) {
			if (event.clientY < bounds.top + 30) list.scrollTop -= 18;
			else if (event.clientY > bounds.bottom - 30) list.scrollTop += 18;
		}
		const slot = state.placeholder.getBoundingClientRect();
		if (state.placeholder.parentElement === list && event.clientY >= slot.top && event.clientY <= slot.bottom) return true;
		const cards = Array.from(list.children).filter((child): child is HTMLElement => this.cards.has(child as HTMLElement) && child !== state.card);
		// offsetTop measures the final layout, unaffected by the in-flight animation.
		const next = cards.find(card => event.clientY < bounds.top + card.offsetTop - list.scrollTop + card.offsetHeight / 2)
			?? list.querySelector<HTMLElement>('.pftf-focus-empty-slot');
		if (state.placeholder.parentElement === list && state.placeholder.nextElementSibling === next) return true;
		const before = new Map(Array.from(this.cards.keys()).filter(card => card !== state.card).map(card => [card, card.getBoundingClientRect()]));
		this.stopAnimations();
		list.insertBefore(state.placeholder, next ?? null);
		state.lane = lane;
		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			for (const [card, old] of before) {
				const rect = card.getBoundingClientRect();
				const dx = old.left - rect.left, dy = old.top - rect.top;
				if (dx || dy) this.animations.set(card, card.animate([
					{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' },
				], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }));
			}
		}
		return true;
	}

	drop(event: DragEvent): boolean {
		const state = this.state;
		if (!state) return false;
		event.preventDefault(); event.stopPropagation();
		const siblings = Array.from(state.placeholder.parentElement?.children ?? []).filter((child): child is HTMLElement => child === state.placeholder || (this.cards.has(child as HTMLElement) && child !== state.card));
		const index = siblings.indexOf(state.placeholder);
		const next = siblings[index + 1], previous = siblings[index - 1];
		const neighbor = next ?? previous;
		const anchor = neighbor ? this.cards.get(neighbor) : undefined;
		// Show the final order immediately, while persistence finishes in the background.
		if (state.placeholder.isConnected) state.placeholder.before(state.card);
		this.finish();
		this.commit(state.task, state.lane, anchor, !next);
		return true;
	}

	private stopAnimations(): void {
		for (const animation of this.animations.values()) animation.cancel();
		this.animations.clear();
	}

	private finish(): void {
		if (this.state) {
			window.cancelAnimationFrame(this.state.frame);
			this.state.card.classList.remove('pftf-sort-source', 'is-dragging');
			this.state.placeholder.remove();
			this.state = undefined;
		}
		this.stopAnimations();
	}
}
