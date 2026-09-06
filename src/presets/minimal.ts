import type { Plugin } from '../kernel/contracts.js';
import { signals } from '../plugins/directives/declare.js';
import { on } from '../plugins/directives/event-listener.js';
import { text } from '../plugins/directives/text-content.js';
import { show } from '../plugins/directives/visibility.js';

export const minimal: Plugin[] = [signals, text, show, on];
