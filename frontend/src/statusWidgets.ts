import {
  CalendarWidget,
  ClipboardChipWidget,
  ClockWidget,
  ContextActionsWidget,
  CountWidget,
  DiskWidget,
  LauncherWidget,
  SearchWidget,
  TrashWidget,
} from './widgets'
import { AiWidget } from './ai/AiWidget'
import type { Widget } from './widgetTypes'

/** The status-bar widget registry. Adding a widget = adding one entry here;
 *  `StatusBar` groups by placement and sorts by `order`, so the shell never
 *  needs to know about individual widgets. */
export const WIDGETS: Widget[] = [
  { id: 'count', placement: 'left', order: 0, Component: CountWidget },
  { id: 'context-actions', placement: 'left', order: 1, Component: ContextActionsWidget },
  { id: 'search-box', placement: 'center', order: 1, Component: SearchWidget },
  {
    id: 'clipboard-chip',
    placement: 'center',
    order: 2,
    Component: ClipboardChipWidget,
    visible: (c) => c.clip.paths.length > 0 || c.pasteInFlight,
  },
  { id: 'ai', placement: 'right', order: 0, Component: AiWidget, visible: (c) => c.aiEnabled },
  { id: 'trash', placement: 'right', order: 1, Component: TrashWidget, collapsible: true },
  { id: 'disk', placement: 'right', order: 2, Component: DiskWidget, collapsible: true },
  { id: 'calendar-date', placement: 'right', order: 3, Component: CalendarWidget, collapsible: true },
  { id: 'clock', placement: 'right', order: 4, Component: ClockWidget, collapsible: true },
  { id: 'quick-launcher', placement: 'right', order: 5, Component: LauncherWidget },
]
