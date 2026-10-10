import { moment } from 'obsidian';

type Lang = 'en' | 'de';

interface Translations {
	ribbon: { tooltip: string };
	commands: {
		openView: { name: string };
		openTriage: { name: string };
		addTask: { name: string };
		promoteTask: { name: string };
		archiveTask: { name: string };
	};
	quickAdd: {
		title: string;
		placeholder: string;
		add: string;
		addTaskButton: string;
		focus: string;
		addedNotice: string;
		noActiveNote: string;
		inboxSetup: {
			title: string;
			description: string;
			placeholder: string;
			save: string;
			cancel: string;
		};
	};
	view: {
		title: string;
		refresh: string;
		searchPlaceholder: string;
		searchToggle: string;
		add: string;
		addHere: string;
		addHerePlaceholder: string;
		manualTag: string;
		scope: string;
		scopeAll: string;
		open: string;
		done: string;
		empty: string;
		emptyStates: {
			noMatches: string;
			clearFilters: string;
			onboardingTitle: string;
			onboardingBody: string;
			eliminateHintTitle: string;
			eliminateHintBody: string;
			example: string;
		};
		tasksPluginWarning: string;
		tasksPluginWarningDismiss: string;
		focusSectionTitle: string;
		focusOverTarget: string;
		focusAdd: string;
		focusRemove: string;
		focusDone: string;
		hideTask: string;
		unhideTask: string;
		unpinTask: string;
		undo: string;
		undoLabels: {
			completed: string;
			hidden: string;
			moved: string;
			updated: string;
			focused: string;
			unfocused: string;
			unpinned: string;
			noted: string;
		};
		actions: {
			more: string;
			openNote: string;
			postpone: string;
			priority: string;
			dueTomorrow: string;
			dueNextWeek: string;
			pickDate: string;
			clearDue: string;
			save: string;
			priorityNone: string;
			priorityHighest: string;
			priorityHigh: string;
			priorityMedium: string;
			priorityLow: string;
			priorityLowest: string;
			size: string;
			sizeNone: string;
			sizeSmall: string;
			sizeMedium: string;
			sizeLarge: string;
		};
		detail: {
			priority: string;
			size: string;
			due: string;
			tags: string;
			note: string;
			why: string;
			whyOverride: string;
			whyUrgent: string;
			whyNotUrgent: string;
			whyImportant: string;
			whyNotImportant: string;
			causeOverdue: string;
			causeToday: string;
			causeWithin: string;
			causeNoDue: string;
			causeBeyond: string;
			causePriority: string;
			causeNoPriority: string;
			causePriorityNotImportant: string;
			whyHighValue: string;
			whyLowValue: string;
			whyLowEffort: string;
			whyHighEffort: string;
			causeValueNoTag: string;
			causeSize: string;
			causeUnsized: string;
		};
		axes: { label: string; eisenhower: string; valueEffort: string };
		quadrants: {
			do: { title: string; subtitle: string; emptyState: string };
			schedule: { title: string; subtitle: string; emptyState: string };
			delegate: { title: string; subtitle: string; emptyState: string };
			eliminate: { title: string; subtitle: string; emptyState: string };
		};
		quadrantsValueEffort: {
			do: { title: string; subtitle: string; emptyState: string };
			schedule: { title: string; subtitle: string; emptyState: string };
			delegate: { title: string; subtitle: string; emptyState: string };
			eliminate: { title: string; subtitle: string; emptyState: string };
		};
		triage: {
			viewTitle: string;
			filterLabel: string;
			filterEisenhower: string;
			filterValueEffort: string;
			filterBoth: string;
			sectionTitle: string;
			empty: string;
			assignTo: string;
			currentChoice: string;
			pickerHintOne: string;
			pickerHintBoth: string;
			assigned: string;
		};
	};
	settings: {
		setting1: { name: string; desc: string; placeholder: string };
		appearanceHeading: string;
		fontSize: { name: string; desc: string };
		showWhyHere: { name: string; desc: string };
		quadrantLimit: { name: string; desc: string; error: string };
		taskSourcesHeading: string;
		taskScope: {
			name: string;
			desc: string;
			optionAll: string;
			optionFolder: string;
		};
		taskFolder: {
			name: string;
			desc: string;
			placeholder: string;
			error: string;
		};
		showSubtasks: {
			name: string;
			desc: string;
		};
		classificationHeading: string;
		tagsHeading: string;
		urgencyDays: { name: string; desc: string; error: string };
		importantPriorities: { name: string; desc: string; error: string };
		focusTag: { name: string; desc: string };
		focusTargetCount: { name: string; desc: string };
		hideTag: { name: string; desc: string };
		sizeTagsDesc: string;
		sizeTagSmall: string;
		sizeTagMedium: string;
		sizeTagLarge: string;
		valueEffortHeading: string;
		valueSource: { name: string; desc: string; optionPriority: string; optionManualTag: string };
		highValueTag: { name: string; desc: string };
		lowValueTag: { name: string; desc: string };
		lowEffortSizes: { name: string; desc: string };
		progressGroupHeading: string;
		staleDays: { name: string; desc: string; error: string };
		progressHeading: { name: string; desc: string };
		notesFolder: { name: string; desc: string; placeholder: string };
		archiveFolder: { name: string; desc: string; placeholder: string };
		reviewHeading: { name: string; desc: string };
		quickAddHeading: string;
		quickAddTarget: {
			name: string;
			desc: string;
			optionInbox: string;
			optionActive: string;
		};
		quickAddInbox: { name: string; desc: string; placeholder: string };
		calendarHeading: string;
		calendarEnabled: { name: string; desc: string };
		calendarShowDue: { name: string; desc: string };
		calendarShowProgress: { name: string; desc: string };
		calendarMaxDots: { name: string; desc: string; error: string };
		matrixDesc: string;
		quadrantsHeading: string;
		quadrantColor: { name: string; desc: string; reset: string };
		quadrantTag: { name: string; desc: string };
		groupByPrimary: { name: string; desc: string };
		sortPrimary: { name: string; desc: string };
		sortSecondary: { name: string; desc: string };
		sortField: { priority: string; dueDate: string; alpha: string };
		resetHeading: string;
		resetAll: { name: string; desc: string; button: string };
		toggleSection: string;
	};
	groups: {
		noPriority: string;
		overdue: string;
		soon: string;
		later: string;
		noDate: string;
	};
	progress: {
		title: string;
		none: string;
		empty: string;
		placeholder: string;
		alert: string;
		add: string;
		lastNote: string;
		lastNoteToday: string;
		lastNoteUndated: string;
		openEntry: string;
		stale: string;
		home: string;
		openHome: string;
		promote: string;
		promoteHint: string;
		promoted: string;
		promotedLinked: string;
		promoteNoTitle: string;
		archive: string;
		archived: string;
		archivedNoFolder: string;
		archiveNeedsNote: string;
		archiveTargetExists: string;
		notATask: string;
	};
	tasksBlock: {
		missing: string;
		invalidShow: string;
	};
}

const translations: Record<Lang, Translations> = {
	en: {
		ribbon: { tooltip: 'Put first things first' },
		commands: {
			openView: { name: 'Open Put First Things First' },
			openTriage: { name: 'Open triage' },
			addTask: { name: 'Add task' },
			promoteTask: { name: 'Give the current task its own note' },
			archiveTask: { name: 'Archive the current task' },
		},
		quickAdd: {
			title: 'Add task',
			placeholder: 'e.g. Call the dentist 📅 2026-07-10 🔼 #do',
			add: 'Add',
			addTaskButton: 'Add task',
			focus: 'Focus',
			addedNotice: 'Task added',
			noActiveNote: 'No active note — add one to the inbox instead, or open a note.',
			inboxSetup: {
				title: 'Where should new tasks go?',
				description: 'Put First Things First saves quick-added tasks to an inbox note. Choose the note to use — it will be created if it doesn\'t exist yet. You can change this any time under the plugin settings.',
				placeholder: 'e.g. Inbox.md',
				save: 'Save',
				cancel: 'Cancel',
			},
		},
		view: {
			title: 'Put First Things First',
			refresh: 'Refresh',
			searchPlaceholder: 'Search tasks…',
			searchToggle: 'Search',
			add: 'Add',
			addHere: 'Add here',
			addHerePlaceholder: 'New task — Enter to add, Esc to cancel',
			manualTag: 'Manually assigned via tag',
			scope: 'Scope',
			scopeAll: 'Entire vault',
			open: 'open',
			done: 'done',
			empty: 'No open tasks found.',
			emptyStates: {
				noMatches: 'No tasks match your search or filters.',
				clearFilters: 'Clear search & filters',
				onboardingTitle: 'No tasks yet',
				onboardingBody: 'Put First Things First reads standard checkbox tasks from your vault. Add a due date (📅) for urgency and a priority (🔺⏫) for importance, and each task is sorted into the matrix automatically. Tip: adjust which folder is scanned and what counts as urgent/important under Settings → Community plugins → Put First Things First.',
				eliminateHintTitle: 'Everything landed in “Eliminate”',
				eliminateHintBody: 'None of your tasks have a due date or an important priority, so nothing counts as urgent or important yet. Add a due date (📅) and/or a priority (🔺⏫) to see tasks move into the other quadrants. You can change the urgency threshold and which priorities count as important in the settings.',
				example: '- [ ] Finish the quarterly report 📅 2026-07-02 🔺',
			},
			tasksPluginWarning: 'The Tasks plugin is not enabled. Put First Things First works with plain checkboxes, but the Tasks plugin makes adding due dates and priorities much easier.',
			tasksPluginWarningDismiss: 'Dismiss',
			focusSectionTitle: 'Focus Tasks',
			focusOverTarget: 'Beyond today\'s target',
			focusAdd: 'Add to focus',
			focusRemove: 'Remove from focus',
			focusDone: 'Mark as done',
			hideTask: 'Hide task',
			unhideTask: 'Unhide task',
			unpinTask: 'Return to automatic sorting',
			undo: 'Undo',
			undoLabels: {
				completed: 'Task completed',
				hidden: 'Task hidden',
				moved: 'Task moved',
				updated: 'Task updated',
				focused: 'Task focused',
				unfocused: 'Focus removed',
				unpinned: 'Returned to automatic sorting',
				noted: 'Note added',
			},
			actions: {
				more: 'More actions',
				openNote: 'Open note',
				postpone: 'Postpone',
				priority: 'Set priority',
				dueTomorrow: 'Due tomorrow',
				dueNextWeek: 'Due next week',
				pickDate: 'Pick a date…',
				clearDue: 'Remove due date',
				save: 'Save',
				priorityNone: 'No priority',
				priorityHighest: '🔺 Highest',
				priorityHigh: '⏫ High',
				priorityMedium: '🔼 Medium',
				priorityLow: '🔽 Low',
				priorityLowest: '⏬ Lowest',
				size: 'Set size',
				sizeNone: 'No size',
				sizeSmall: 'Small',
				sizeMedium: 'Medium',
				sizeLarge: 'Large',
			},
			detail: {
				priority: 'Priority',
				size: 'Size',
				due: 'Due',
				tags: 'Tags',
				note: 'Note',
				why: 'Why here',
				whyOverride: 'Pinned by {tag} — overrides the automatic sort',
				whyUrgent: 'Urgent',
				whyNotUrgent: 'Not urgent',
				whyImportant: 'Important',
				whyNotImportant: 'Not important',
				causeOverdue: 'overdue by {days} d',
				causeToday: 'due today',
				causeWithin: 'due in {days} d (≤ {threshold} d)',
				causeNoDue: 'no due date',
				causeBeyond: 'due in {days} d (> {threshold} d threshold)',
				causePriority: 'priority {priority}',
				causeNoPriority: 'no priority',
				causePriorityNotImportant: 'priority {priority} not in important list',
				whyHighValue: 'High value',
				whyLowValue: 'Low value',
				whyLowEffort: 'Low effort',
				whyHighEffort: 'High effort',
				causeValueNoTag: 'no {tag} tag',
				causeSize: 'size {size}',
				causeUnsized: 'un-sized → high effort',
			},
			axes: { label: 'Matrix axes', eisenhower: 'Eisenhower', valueEffort: 'Value/Effort' },
			quadrants: {
				do:       { title: 'Do',       subtitle: 'Urgent · Important',        emptyState: 'Nothing urgent right now' },
				schedule: { title: 'Schedule', subtitle: 'Not urgent · Important',     emptyState: 'No important tasks pending' },
				delegate: { title: 'Delegate', subtitle: 'Urgent · Not important',     emptyState: 'Nothing to delegate' },
				eliminate:{ title: 'Eliminate',subtitle: 'Not urgent · Not important', emptyState: 'Nothing to eliminate' },
			},
			quadrantsValueEffort: {
				do:       { title: 'Quick Wins', subtitle: 'High value · Low effort',  emptyState: 'No quick wins right now' },
				schedule: { title: 'Big Bets',   subtitle: 'High value · High effort', emptyState: 'No big bets pending' },
				delegate: { title: 'Fill-ins',   subtitle: 'Low value · Low effort',   emptyState: 'No fill-ins right now' },
				eliminate:{ title: 'Time Sinks',  subtitle: 'Low value · High effort',  emptyState: 'No time sinks' },
			},
			triage: {
				viewTitle: 'Put First Things First: Triage',
				filterLabel: 'Triage scope',
				filterEisenhower: 'Eisenhower',
				filterValueEffort: 'Value/Effort',
				filterBoth: 'Unclassified',
				sectionTitle: 'To classify',
				empty: 'Nothing to classify: every task has been placed.',
				assignTo: 'Move to',
				currentChoice: 'Current choice',
				pickerHintOne: 'Click the matching quadrant.',
				pickerHintBoth: 'Pick one per matrix.',
				assigned: 'Classified',
			},
		},
		settings: {
			setting1: {
				name: 'Settings #1',
				desc: "It's a secret",
				placeholder: 'Enter your secret',
			},
			appearanceHeading: 'Appearance',
			fontSize: {
				name: 'Font size',
				desc: 'Adjust the text size used throughout the Put First Things First view.',
			},
			showWhyHere: {
				name: 'Show "why here" reason',
				desc: 'Show a line in the task detail popover explaining why a task landed in its quadrant (urgency/importance or a manual tag).',
			},
			quadrantLimit: {
				name: 'Rows visible per list',
				desc: 'Each quadrant (and the focus list) shows about this many tasks and scrolls inside itself for the rest, so the matrix stays a page you can take in at a glance. 0 shows everything.',
				error: 'Please enter a whole number (0 or more).',
			},
			taskSourcesHeading: 'Task Sources',
			taskScope: {
				name: 'Scan scope',
				desc: 'Define where Put First Things First looks for tasks. Choose "Entire vault" to include all notes, or "Specific folder" to limit the search to one location.',
				optionAll: 'Entire vault',
				optionFolder: 'Specific folder',
			},
			taskFolder: {
				name: 'Folder',
				desc: 'Only tasks inside this folder (and its sub-folders) will appear in Put First Things First.',
				placeholder: 'e.g. Projects/Work',
				error: 'Please select a folder.',
			},
			showSubtasks: {
				name: 'Include subtasks',
				desc: 'When off, indented subtasks are ignored and only top-level tasks appear in the matrix. Keeps dateless subtasks from piling up in Eliminate.',
			},
			classificationHeading: 'Classification',
			tagsHeading: 'Tags',
			urgencyDays: {
				name: 'Urgency threshold (days)',
				desc: 'A task is considered urgent when its due date is within this many days — or already past. Set to 0 to mark only overdue tasks as urgent.',
				error: 'Please enter a whole number between 0 and 364.',
			},
			importantPriorities: {
				name: 'Important priorities',
				desc: 'Tasks carrying any of the selected priority levels are placed in the "Important" axis of the matrix. Select at least one.',
				error: 'At least one priority must be selected.',
			},
			focusTag: {
				name: 'Focus tag',
				desc: 'Add this tag to any task to highlight it as a Focus Task. Focus Tasks are displayed prominently above the matrix.',
			},
			focusTargetCount: {
				name: 'Daily focus target',
				desc: 'An optional number of focus tasks to aim for each day (e.g. 6 for the Ivy Lee method, 3 for MITs). A subtle line marks where the list runs past it. 0 turns it off.',
			},
			hideTag: {
				name: 'Hide tag',
				desc: 'Tasks carrying this tag are hidden from the matrix. Use the hide button on any task to toggle this tag.',
			},
			sizeTagsDesc: 'Optional tags marking how big a task is (defaults #s / #m / #l). Set a size from any task\'s popover; size-based views read these. Leave the fields blank to turn sizing off.',
			sizeTagSmall: 'Small task tag',
			sizeTagMedium: 'Medium task tag',
			sizeTagLarge: 'Large task tag',
			valueEffortHeading: 'Value / Effort matrix',
			valueSource: {
				name: 'Value source',
				desc: 'What "value" means in the Value/Effort matrix. Priority reuses your task priority as an importance proxy; Manual tag only counts the high-value tag below. Due date is deliberately not a value source (that is urgency).',
				optionPriority: 'Priority',
				optionManualTag: 'Manual tag only',
			},
			highValueTag: {
				name: 'High-value tag',
				desc: 'A task with this tag always counts as high value, overriding the value source.',
			},
			lowValueTag: {
				name: 'Low-value tag',
				desc: 'A task with this tag always counts as low value, overriding the value source.',
			},
			lowEffortSizes: {
				name: 'Low-effort sizes',
				desc: 'Which task sizes count as "low effort" on the effort axis. Un-sized tasks always count as high effort.',
			},
			progressGroupHeading: 'Progress notes',
			staleDays: {
				name: 'Stale after (days)',
				desc: 'A task whose latest progress note is older than this many days is marked as stale on its card, so the ones you have stopped touching stand out.',
				error: 'Please enter a whole number of days (0 or more).',
			},
			progressHeading: {
				name: 'Progress section heading',
				desc: 'When a task links to a note of its own, its progress notes are kept in that note under this heading (created at the end of the note if missing).',
			},
			notesFolder: {
				name: 'Folder for task notes',
				desc: '"Give this task its own note" creates the note here. Leave blank to create it next to the note the task is in.',
				placeholder: 'e.g. Tasks/Notes',
			},
			archiveFolder: {
				name: 'Archive folder',
				desc: 'Archiving a task moves its note here. Leave blank to check the task off and leave the note where it is.',
				placeholder: 'e.g. Archive',
			},
			reviewHeading: {
				name: 'Review section heading',
				desc: 'Archiving adds an empty section with this heading to the note, as a place to write down what got done and what to do differently. Leave blank to skip.',
			},
			quickAddHeading: 'Quick Add',
			quickAddTarget: {
				name: 'Add tasks to',
				desc: 'Where the quick-add dialog (the "+" button in the view header, or the "Add task" command) appends new tasks.',
				optionInbox: 'Inbox note',
				optionActive: 'Active note',
			},
			quickAddInbox: {
				name: 'Inbox note',
				desc: 'Path to the note that receives quick-added tasks when "Add tasks to" is set to the inbox. Created if it does not exist.',
				placeholder: 'Inbox.md',
			},
			calendarHeading: 'Calendar plugin',
			calendarEnabled: {
				name: 'Show tasks in the Calendar plugin',
				desc: 'Adds dots to the day cells of the Calendar plugin\'s month grid. Has no effect if that plugin is not installed.',
			},
			calendarShowDue: {
				name: 'Mark due dates',
				desc: 'A filled dot, in the quadrant\'s colour, on the day a task is due. Days already past are marked as overdue.',
			},
			calendarShowProgress: {
				name: 'Mark progress notes',
				desc: 'A hollow dot on every day a progress note was written, so the month shows what actually moved.',
			},
			calendarMaxDots: {
				name: 'Most dots per day',
				desc: 'A busy day is capped at this many dots so the cell stays readable; the full count stays on the cell as a data attribute.',
				error: 'Enter a whole number of 1 or more.',
			},
			matrixDesc: 'These rules determine how tasks are automatically placed into quadrants based on their due date and priority.',
			quadrantsHeading: 'Quadrants',
			quadrantColor: {
				name: 'Color',
				desc: 'Accent color shown at the top border of the quadrant.',
				reset: 'Reset to default',
			},
			quadrantTag: {
				name: 'Tag (manual override)',
				desc: 'Add this tag to any task to pin it to this quadrant, overriding the automatic classification.',
			},
			groupByPrimary: {
				name: 'Group by primary criterion',
				desc: 'When enabled, tasks in each quadrant are visually grouped by their primary sort field.',
			},
			sortPrimary: {
				name: 'Primary sort',
				desc: 'Main criterion used to order tasks within the quadrant.',
			},
			sortSecondary: {
				name: 'Secondary sort',
				desc: 'Tiebreaker applied when the primary criterion is equal.',
			},
			sortField: { priority: 'Priority', dueDate: 'Due date', alpha: 'Alphabetical' },
			resetHeading: 'Reset',
			resetAll: {
				name: 'Reset all settings',
				desc: 'Resets every Put First Things First setting to its default value. This cannot be undone.',
				button: 'Reset to defaults',
			},
			toggleSection: 'Expand or collapse this section',
		},
		groups: {
			noPriority: 'No priority',
			overdue: 'Overdue',
			soon: 'Due within {days} days',
			later: 'Later',
			noDate: 'No due date',
		},
		progress: {
			title: 'Progress',
			none: 'No notes yet',
			empty: 'Nothing noted yet. Write down what happened, or what went wrong.',
			placeholder: 'What happened?',
			alert: 'Mark as an alert (⚠)',
			add: 'Add note',
			lastNote: 'Last note {days} d ago',
			lastNoteToday: 'Last note today',
			lastNoteUndated: 'Last note undated',
			openEntry: 'Open this line in the note',
			stale: 'The note changed since this page was opened — refresh and try again.',
			home: 'Note',
			openHome: 'Open {name}',
			promote: 'Give this task its own note',
			promoteHint: 'For a task that lasts weeks: a note of its own to link things to, and to keep its progress in.',
			promoted: 'Created {name} and linked the task to it',
			promotedLinked: 'Linked the task to the existing note {name}',
			promoteNoTitle: 'The task has no text to name a note after.',
			archive: 'Archive',
			archived: 'Task done — note moved to {folder}',
			archivedNoFolder: 'Task done — note left in place (no archive folder set)',
			archiveNeedsNote: 'Give the task its own note first; only tasks with a note can be archived.',
			archiveTargetExists: 'Task done, but a note with that name already exists in the archive folder — moved nothing.',
			notATask: 'The cursor is not on a task line.',
		},
		tasksBlock: {
			missing: 'The Tasks plugin must be installed and enabled to use this block.',
			invalidShow: 'Unknown "show-focus" section. Use: focus, do, schedule, delegate, or eliminate.',
		},
	},
	de: {
		ribbon: { tooltip: 'Put First Things First' },
		commands: {
			openView: { name: 'Put First Things First öffnen' },
			openTriage: { name: 'Triage öffnen' },
			addTask: { name: 'Aufgabe hinzufügen' },
			promoteTask: { name: 'Aktueller Aufgabe eine eigene Notiz geben' },
			archiveTask: { name: 'Aktuelle Aufgabe archivieren' },
		},
		quickAdd: {
			title: 'Aufgabe hinzufügen',
			placeholder: 'z. B. Zahnarzt anrufen 📅 2026-07-10 🔼 #do',
			add: 'Hinzufügen',
			addTaskButton: 'Aufgabe hinzufügen',
			focus: 'Fokus',
			addedNotice: 'Aufgabe hinzugefügt',
			noActiveNote: 'Keine aktive Notiz — stattdessen in die Inbox einfügen oder eine Notiz öffnen.',
			inboxSetup: {
				title: 'Wohin sollen neue Aufgaben?',
				description: 'Put First Things First speichert schnell erfasste Aufgaben in einer Inbox-Notiz. Wähle die zu verwendende Notiz — sie wird angelegt, falls sie noch nicht existiert. Du kannst das jederzeit in den Plugin-Einstellungen ändern.',
				placeholder: 'z. B. Inbox.md',
				save: 'Speichern',
				cancel: 'Abbrechen',
			},
		},
		view: {
			title: 'Put First Things First',
			refresh: 'Aktualisieren',
			searchPlaceholder: 'Aufgaben suchen…',
			searchToggle: 'Suchen',
			add: 'Hinzufügen',
			addHere: 'Hier hinzufügen',
			addHerePlaceholder: 'Neue Aufgabe — Enter fügt hinzu, Esc bricht ab',
			manualTag: 'Manuell per Tag zugewiesen',
			scope: 'Bereich',
			scopeAll: 'Gesamter Vault',
			open: 'offen',
			done: 'erledigt',
			empty: 'Keine offenen Aufgaben gefunden.',
			emptyStates: {
				noMatches: 'Keine Aufgaben passen zu deiner Suche oder deinen Filtern.',
				clearFilters: 'Suche & Filter zurücksetzen',
				onboardingTitle: 'Noch keine Aufgaben',
				onboardingBody: 'Put First Things First liest normale Checkbox-Aufgaben aus deinem Vault. Ergänze ein Fälligkeitsdatum (📅) für Dringlichkeit und eine Priorität (🔺⏫) für Wichtigkeit, dann wird jede Aufgabe automatisch in die Matrix einsortiert. Tipp: Welcher Ordner durchsucht wird und was als dringend/wichtig zählt, stellst du unter Einstellungen → Community-Plugins → Put First Things First ein.',
				eliminateHintTitle: 'Alles landet in „Eliminieren“',
				eliminateHintBody: 'Keine deiner Aufgaben hat ein Fälligkeitsdatum oder eine wichtige Priorität, daher gilt noch nichts als dringend oder wichtig. Ergänze ein Fälligkeitsdatum (📅) und/oder eine Priorität (🔺⏫), damit Aufgaben in die anderen Quadranten wandern. Die Dringlichkeitsschwelle und welche Prioritäten als wichtig zählen, kannst du in den Einstellungen anpassen.',
				example: '- [ ] Quartalsbericht fertigstellen 📅 2026-07-02 🔺',
			},
			tasksPluginWarning: 'Das Tasks-Plugin ist nicht aktiviert. Put First Things First funktioniert auch mit normalen Checkboxen, aber mit dem Tasks-Plugin lassen sich Fälligkeitsdaten und Prioritäten viel einfacher setzen.',
			tasksPluginWarningDismiss: 'Ausblenden',
			focusSectionTitle: 'Fokus-Aufgaben',
			focusOverTarget: 'Über dem Tagesziel',
			focusAdd: 'Zu Fokus hinzufügen',
			focusRemove: 'Aus Fokus entfernen',
			hideTask: 'Aufgabe ausblenden',
			unhideTask: 'Aufgabe einblenden',
			unpinTask: 'Zur automatischen Klassifizierung zurückkehren',
			undo: 'Rückgängig',
			undoLabels: {
				completed: 'Aufgabe erledigt',
				hidden: 'Aufgabe ausgeblendet',
				moved: 'Aufgabe verschoben',
				updated: 'Aufgabe aktualisiert',
				focused: 'Aufgabe fokussiert',
				unfocused: 'Fokus entfernt',
				unpinned: 'Automatische Klassifizierung wiederhergestellt',
				noted: 'Notiz hinzugefügt',
			},
			focusDone: 'Als erledigt markieren',
			actions: {
				more: 'Weitere Aktionen',
				openNote: 'Notiz öffnen',
				postpone: 'Verschieben',
				priority: 'Priorität setzen',
				dueTomorrow: 'Fällig morgen',
				dueNextWeek: 'Fällig nächste Woche',
				pickDate: 'Datum wählen…',
				clearDue: 'Fälligkeitsdatum entfernen',
				save: 'Speichern',
				priorityNone: 'Keine Priorität',
				priorityHighest: '🔺 Höchste',
				priorityHigh: '⏫ Hoch',
				priorityMedium: '🔼 Mittel',
				priorityLow: '🔽 Niedrig',
				priorityLowest: '⏬ Niedrigste',
				size: 'Größe festlegen',
				sizeNone: 'Keine Größe',
				sizeSmall: 'Klein',
				sizeMedium: 'Mittel',
				sizeLarge: 'Groß',
			},
			detail: {
				priority: 'Priorität',
				size: 'Größe',
				due: 'Fällig',
				tags: 'Tags',
				note: 'Notiz',
				why: 'Warum hier',
				whyOverride: 'Angeheftet durch {tag} — überschreibt die Automatik',
				whyUrgent: 'Dringend',
				whyNotUrgent: 'Nicht dringend',
				whyImportant: 'Wichtig',
				whyNotImportant: 'Nicht wichtig',
				causeOverdue: '{days} d überfällig',
				causeToday: 'heute fällig',
				causeWithin: 'fällig in {days} d (≤ {threshold} d)',
				causeNoDue: 'kein Fälligkeitsdatum',
				causeBeyond: 'fällig in {days} d (> {threshold} d Schwelle)',
				causePriority: 'Priorität {priority}',
				causeNoPriority: 'keine Priorität',
				causePriorityNotImportant: 'Priorität {priority} nicht in Wichtig-Liste',
				whyHighValue: 'Hoher Wert',
				whyLowValue: 'Geringer Wert',
				whyLowEffort: 'Geringer Aufwand',
				whyHighEffort: 'Hoher Aufwand',
				causeValueNoTag: 'kein {tag}-Tag',
				causeSize: 'Größe {size}',
				causeUnsized: 'ungeschätzt → hoher Aufwand',
			},
			axes: { label: 'Matrix-Achsen', eisenhower: 'Eisenhower', valueEffort: 'Wert/Aufwand' },
			quadrants: {
				do:       { title: 'Erledigen',  subtitle: 'Dringend · Wichtig',             emptyState: 'Aktuell nichts Dringendes' },
				schedule: { title: 'Einplanen',  subtitle: 'Nicht dringend · Wichtig',        emptyState: 'Keine wichtigen Aufgaben ausstehend' },
				delegate: { title: 'Delegieren', subtitle: 'Dringend · Nicht wichtig',        emptyState: 'Nichts zu delegieren' },
				eliminate:{ title: 'Eliminieren',subtitle: 'Nicht dringend · Nicht wichtig',  emptyState: 'Nichts zu eliminieren' },
			},
			quadrantsValueEffort: {
				do:       { title: 'Quick Wins', subtitle: 'Hoher Wert · Geringer Aufwand',  emptyState: 'Aktuell keine Quick Wins' },
				schedule: { title: 'Big Bets',   subtitle: 'Hoher Wert · Hoher Aufwand',     emptyState: 'Keine Big Bets ausstehend' },
				delegate: { title: 'Lückenfüller', subtitle: 'Geringer Wert · Geringer Aufwand', emptyState: 'Aktuell keine Lückenfüller' },
				eliminate:{ title: 'Zeitfresser', subtitle: 'Geringer Wert · Hoher Aufwand',  emptyState: 'Keine Zeitfresser' },
			},
			triage: {
				viewTitle: 'Put First Things First: Triage',
				filterLabel: 'Triage-Umfang',
				filterEisenhower: 'Eisenhower',
				filterValueEffort: 'Wert/Aufwand',
				filterBoth: 'Unklassifiziert',
				sectionTitle: 'Zu klassifizieren',
				empty: 'Nichts zu klassifizieren: jede Aufgabe ist eingeordnet.',
				assignTo: 'Verschieben nach',
				currentChoice: 'Aktuelle Wahl',
				pickerHintOne: 'Passenden Quadranten klicken.',
				pickerHintBoth: 'Je Matrix einen wählen.',
				assigned: 'Klassifiziert',
			},
		},
		settings: {
			setting1: {
				name: 'Einstellung #1',
				desc: 'Das ist ein Geheimnis',
				placeholder: 'Geheimnis eingeben',
			},
			appearanceHeading: 'Erscheinungsbild',
			fontSize: {
				name: 'Schriftgröße',
				desc: 'Passt die Textgröße in der gesamten Put-First-Things-First-Ansicht an.',
			},
			quadrantLimit: {
				name: 'Sichtbare Zeilen pro Liste',
				desc: 'Jeder Quadrant (und die Fokus-Liste) zeigt etwa so viele Aufgaben und scrollt für den Rest in sich selbst, damit die Matrix eine Seite bleibt, die man auf einen Blick erfasst. 0 zeigt alles.',
				error: 'Bitte eine ganze Zahl eingeben (0 oder mehr).',
			},
			showWhyHere: {
				name: '„Warum hier"-Begründung anzeigen',
				desc: 'Zeigt im Detail-Popover eine Zeile, die erklärt, warum eine Aufgabe in ihrem Quadranten gelandet ist (Dringlichkeit/Wichtigkeit oder ein manuelles Tag).',
			},
			taskSourcesHeading: 'Aufgabenquellen',
			taskScope: {
				name: 'Suchbereich',
				desc: 'Legt fest, wo Put First Things First nach Aufgaben sucht. „Gesamter Vault" durchsucht alle Notizen; „Bestimmter Ordner" begrenzt die Suche auf einen Bereich.',
				optionAll: 'Gesamter Vault',
				optionFolder: 'Bestimmter Ordner',
			},
			taskFolder: {
				name: 'Ordner',
				desc: 'Nur Aufgaben in diesem Ordner (und seinen Unterordnern) werden in Put First Things First angezeigt.',
				placeholder: 'z.B. Projekte/Arbeit',
				error: 'Bitte einen Ordner auswählen.',
			},
			showSubtasks: {
				name: 'Unteraufgaben einbeziehen',
				desc: 'Wenn aus, werden eingerückte Unteraufgaben ignoriert und nur Top-Level-Aufgaben erscheinen in der Matrix. Verhindert, dass datenlose Unteraufgaben sich in Eliminieren stapeln.',
			},
			classificationHeading: 'Klassifizierung',
			tagsHeading: 'Tags',
			urgencyDays: {
				name: 'Dringlichkeitsschwelle (Tage)',
				desc: 'Eine Aufgabe gilt als dringend, wenn das Fälligkeitsdatum innerhalb dieser Anzahl von Tagen liegt oder bereits überschritten wurde. Wert 0 markiert nur überfällige Aufgaben als dringend.',
				error: 'Bitte eine ganze Zahl zwischen 0 und 364 eingeben.',
			},
			importantPriorities: {
				name: 'Wichtige Prioritäten',
				desc: 'Aufgaben mit einer der gewählten Prioritätsstufen werden auf der „Wichtig"-Achse der Matrix eingeordnet. Mindestens eine Priorität muss ausgewählt sein.',
				error: 'Es muss mindestens eine Priorität ausgewählt sein.',
			},
			focusTag: {
				name: 'Fokus-Tag',
				desc: 'Füge diesen Tag einer Aufgabe hinzu, um sie als Fokus-Aufgabe hervorzuheben. Fokus-Aufgaben werden prominent über der Matrix angezeigt.',
			},
			focusTargetCount: {
				name: 'Tagesziel für Fokus',
				desc: 'Optionale Anzahl an Fokus-Aufgaben pro Tag (z. B. 6 für die Ivy-Lee-Methode, 3 für MITs). Eine dezente Linie markiert, wo die Liste darüber hinausgeht. 0 schaltet es aus.',
			},
			hideTag: {
				name: 'Ausblenden-Tag',
				desc: 'Aufgaben mit diesem Tag werden in der Matrix nicht angezeigt. Über den Ausblenden-Button an jeder Aufgabe kann der Tag gesetzt oder entfernt werden.',
			},
			sizeTagsDesc: 'Optionale Tags, die angeben, wie groß eine Aufgabe ist (Standard #s / #m / #l). Die Größe lässt sich im Popover jeder Aufgabe setzen; größenbasierte Ansichten lesen diese Tags. Leere Felder schalten die Größe aus.',
			sizeTagSmall: 'Tag für kleine Aufgaben',
			sizeTagMedium: 'Tag für mittlere Aufgaben',
			sizeTagLarge: 'Tag für große Aufgaben',
			valueEffortHeading: 'Wert / Aufwand-Matrix',
			valueSource: {
				name: 'Wertquelle',
				desc: 'Was "Wert" in der Wert/Aufwand-Matrix bedeutet. Priorität nutzt die Aufgaben-Priorität als Näherung für Wichtigkeit; Nur manueller Tag zählt allein den High-Value-Tag unten. Das Fälligkeitsdatum ist bewusst keine Wertquelle (das ist Dringlichkeit).',
				optionPriority: 'Priorität',
				optionManualTag: 'Nur manueller Tag',
			},
			highValueTag: {
				name: 'High-Value-Tag',
				desc: 'Eine Aufgabe mit diesem Tag zählt immer als hoher Wert und überschreibt die Wertquelle.',
			},
			lowValueTag: {
				name: 'Low-Value-Tag',
				desc: 'Eine Aufgabe mit diesem Tag zählt immer als geringer Wert und überschreibt die Wertquelle.',
			},
			lowEffortSizes: {
				name: 'Größen für geringen Aufwand',
				desc: 'Welche Aufgabengrößen auf der Aufwand-Achse als "geringer Aufwand" zählen. Ungeschätzte Aufgaben zählen immer als hoher Aufwand.',
			},
			progressGroupHeading: 'Fortschrittsnotizen',
			staleDays: {
				name: 'Veraltet nach (Tagen)',
				desc: 'Eine Aufgabe, deren letzte Fortschrittsnotiz älter als diese Anzahl Tage ist, wird auf ihrer Karte als veraltet markiert — so fallen die auf, die du nicht mehr anfasst.',
				error: 'Bitte eine ganze Zahl von Tagen eingeben (0 oder mehr).',
			},
			progressHeading: {
				name: 'Überschrift des Fortschrittsabschnitts',
				desc: 'Verlinkt eine Aufgabe auf eine eigene Notiz, werden ihre Fortschrittsnotizen dort unter dieser Überschrift geführt (wird am Ende der Notiz angelegt, falls sie fehlt).',
			},
			notesFolder: {
				name: 'Ordner für Aufgaben-Notizen',
				desc: '„Eigene Notiz geben" legt die Notiz hier an. Leer lassen, um sie neben der Notiz mit der Aufgabe anzulegen.',
				placeholder: 'z. B. Aufgaben/Notizen',
			},
			archiveFolder: {
				name: 'Archivordner',
				desc: 'Beim Archivieren wird die Notiz der Aufgabe hierher verschoben. Leer lassen, um die Aufgabe nur abzuhaken und die Notiz zu belassen.',
				placeholder: 'z. B. Archiv',
			},
			reviewHeading: {
				name: 'Überschrift des Rückblick-Abschnitts',
				desc: 'Beim Archivieren wird ein leerer Abschnitt mit dieser Überschrift ergänzt — als Platz für das, was erledigt wurde und was beim nächsten Mal anders laufen soll. Leer lassen, um das zu überspringen.',
			},
			quickAddHeading: 'Schnell hinzufügen',
			quickAddTarget: {
				name: 'Aufgaben hinzufügen zu',
				desc: 'Wohin der Schnell-Hinzufügen-Dialog (der „+"-Button im View-Header oder der Befehl „Aufgabe hinzufügen") neue Aufgaben anhängt.',
				optionInbox: 'Inbox-Notiz',
				optionActive: 'Aktive Notiz',
			},
			quickAddInbox: {
				name: 'Inbox-Notiz',
				desc: 'Pfad zur Notiz, die schnell hinzugefügte Aufgaben erhält, wenn „Aufgaben hinzufügen zu" auf die Inbox gesetzt ist. Wird erstellt, falls nicht vorhanden.',
				placeholder: 'Inbox.md',
			},
			calendarHeading: 'Calendar-Plugin',
			calendarEnabled: {
				name: 'Aufgaben im Calendar-Plugin anzeigen',
				desc: 'Ergänzt Punkte in den Tageszellen des Monatsrasters vom Calendar-Plugin. Ohne Wirkung, wenn dieses Plugin nicht installiert ist.',
			},
			calendarShowDue: {
				name: 'Fälligkeitsdaten markieren',
				desc: 'Ein gefüllter Punkt in der Farbe des Quadranten an dem Tag, an dem eine Aufgabe fällig ist. Bereits vergangene Tage werden als überfällig markiert.',
			},
			calendarShowProgress: {
				name: 'Fortschrittsnotizen markieren',
				desc: 'Ein hohler Punkt an jedem Tag, an dem eine Fortschrittsnotiz geschrieben wurde — so zeigt der Monat, was sich tatsächlich bewegt hat.',
			},
			calendarMaxDots: {
				name: 'Höchstzahl Punkte pro Tag',
				desc: 'Ein voller Tag wird auf so viele Punkte begrenzt, damit die Zelle lesbar bleibt; die vollständige Anzahl bleibt als Datenattribut an der Zelle.',
				error: 'Bitte eine ganze Zahl ab 1 eingeben.',
			},
			matrixDesc: 'Diese Regeln bestimmen, wie Aufgaben anhand von Fälligkeitsdatum und Priorität automatisch in Quadranten eingeordnet werden.',
			quadrantsHeading: 'Quadranten',
			quadrantColor: {
				name: 'Farbe',
				desc: 'Akzentfarbe des oberen Rahmens im Quadranten.',
				reset: 'Auf Standard zurücksetzen',
			},
			quadrantTag: {
				name: 'Tag (manuelle Zuweisung)',
				desc: 'Füge diesen Tag einer Aufgabe hinzu, um sie diesem Quadranten zuzuweisen und die automatische Klassifizierung zu überschreiben.',
			},
			groupByPrimary: {
				name: 'Nach erstem Kriterium gruppieren',
				desc: 'Wenn aktiviert, werden Aufgaben in jedem Quadranten nach dem primären Sortierfeld visuell gruppiert.',
			},
			sortPrimary: {
				name: 'Primäre Sortierung',
				desc: 'Hauptkriterium für die Reihenfolge der Aufgaben im Quadranten.',
			},
			sortSecondary: {
				name: 'Sekundäre Sortierung',
				desc: 'Tiebreaker, der angewendet wird, wenn das primäre Kriterium gleich ist.',
			},
			sortField: { priority: 'Priorität', dueDate: 'Fälligkeitsdatum', alpha: 'Alphabetisch' },
			resetHeading: 'Zurücksetzen',
			resetAll: {
				name: 'Alle Einstellungen zurücksetzen',
				desc: 'Setzt alle Put-First-Things-First-Einstellungen auf ihre Standardwerte zurück. Dies kann nicht rückgängig gemacht werden.',
				button: 'Auf Standardwerte zurücksetzen',
			},
			toggleSection: 'Diesen Abschnitt ein- oder ausklappen',
		},
		groups: {
			noPriority: 'Keine Priorität',
			overdue: 'Überfällig',
			soon: 'Fällig in {days} Tagen',
			later: 'Später',
			noDate: 'Kein Datum',
		},
		progress: {
			title: 'Fortschritt',
			none: 'Noch keine Notizen',
			empty: 'Noch nichts notiert. Halte fest, was passiert ist — oder was schiefgeht.',
			placeholder: 'Was ist passiert?',
			alert: 'Als Warnung markieren (⚠)',
			add: 'Notiz hinzufügen',
			lastNote: 'Letzte Notiz vor {days} T',
			lastNoteToday: 'Letzte Notiz heute',
			lastNoteUndated: 'Letzte Notiz ohne Datum',
			openEntry: 'Diese Zeile in der Notiz öffnen',
			stale: 'Die Notiz hat sich geändert, seit diese Seite geöffnet wurde — aktualisieren und erneut versuchen.',
			home: 'Notiz',
			openHome: '{name} öffnen',
			promote: 'Dieser Aufgabe eine eigene Notiz geben',
			promoteHint: 'Für Aufgaben, die Wochen dauern: eine eigene Notiz zum Verknüpfen und für den Fortschritt.',
			promoted: '{name} angelegt und mit der Aufgabe verknüpft',
			promotedLinked: 'Aufgabe mit der vorhandenen Notiz {name} verknüpft',
			promoteNoTitle: 'Die Aufgabe hat keinen Text, nach dem eine Notiz benannt werden könnte.',
			archive: 'Archivieren',
			archived: 'Aufgabe erledigt — Notiz nach {folder} verschoben',
			archivedNoFolder: 'Aufgabe erledigt — Notiz bleibt an ihrem Platz (kein Archivordner gesetzt)',
			archiveNeedsNote: 'Gib der Aufgabe zuerst eine eigene Notiz; nur Aufgaben mit Notiz lassen sich archivieren.',
			archiveTargetExists: 'Aufgabe erledigt, aber im Archivordner gibt es schon eine Notiz mit diesem Namen — nichts verschoben.',
			notATask: 'Der Cursor steht nicht auf einer Aufgabenzeile.',
		},
		tasksBlock: {
			missing: 'Für diesen Block muss das Tasks-Plugin installiert und aktiviert sein.',
			invalidShow: 'Unbekannte "show-focus"-Sektion. Erlaubt: focus, do, schedule, delegate oder eliminate.',
		},
	},
};

function getLocale(): Lang {
	return moment.locale().startsWith('de') ? 'de' : 'en';
}

export function t(): Translations {
	return translations[getLocale()];
}
