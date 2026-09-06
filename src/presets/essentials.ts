import type { Plugin } from '../kernel/contracts.js';
import { attr } from '../plugins/directives/attribute-sync.js';
import { indicator } from '../plugins/directives/busy-flag.js';
import { className } from '../plugins/directives/class-toggle.js';
import { signals } from '../plugins/directives/declare.js';
import { computed } from '../plugins/directives/derive.js';
import { on } from '../plugins/directives/event-listener.js';
import { init } from '../plugins/directives/on-mount.js';
import { text } from '../plugins/directives/text-content.js';
import { bind } from '../plugins/directives/two-way-bind.js';
import { show } from '../plugins/directives/visibility.js';
import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from '../plugins/functions/request.js';
import { applyElements } from '../plugins/server-events/apply-elements.js';
import { applyState } from '../plugins/server-events/apply-state.js';

export const essentials: Plugin[] = [
  signals,
  computed,
  text,
  show,
  className,
  attr,
  bind,
  on,
  init,
  indicator,
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
  applyElements,
  applyState,
];
