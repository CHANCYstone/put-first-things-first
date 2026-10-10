/**
 * Adding a task straight into a quadrant. The new line is seeded with the
 * signals that classify it there — a due date of today for urgent, the
 * configured important priority for important — rather than a pin tag, so it
 * lands in the cell for the same reason any other task would and moves out of
 * it the same way (when the date passes or the priority changes).
 */
import { Quadrant } from './matrixClassifier';
import { FocusFirstSettings, Priority } from './settings';
import { formatIsoDate } from './dateUtils';
import { valueEffortLine } from './taskDragDrop';
import { TASK_PREFIX_RE } from './tasksFormat';

/** The priority that marks a task important: ⏫ when it counts, else the first configured one. */
function importantPriority(settings: FocusFirstSettings): Priority | undefined {
	const list = settings.importantPriorities;
	return list.includes('⏫') ? '⏫' : list[0];
}

/** The task text plus the metadata that places it in `quadrant` under the active axes. */
export function seedForQuadrant(
	text: string,
	quadrant: Quadrant,
	settings: FocusFirstSettings,
	now: Date = new Date(),
): string {
	const body = text.trim();
	if (settings.axisMode === 'valueEffort') {
		return valueEffortLine(`- [ ] ${body}`, quadrant, settings).replace(TASK_PREFIX_RE, '');
	}
	const priority = importantPriority(settings);
	const today = `📅 ${formatIsoDate(now)}`;
	const parts: (string | undefined)[] = [body];
	if (quadrant === 'do' || quadrant === 'schedule') parts.push(priority);
	if (quadrant === 'do' || quadrant === 'delegate') parts.push(today);
	return parts.filter(Boolean).join(' ');
}
