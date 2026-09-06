import type { Plugin } from '../kernel/contracts.js'
import { applyElements } from '../plugins/server-events/apply-elements.js'
import { applyState } from '../plugins/server-events/apply-state.js'
import { attr } from '../plugins/directives/attribute-sync.js'
import { bind } from '../plugins/directives/two-way-bind.js'
import { className } from '../plugins/directives/class-toggle.js'
import { computed } from '../plugins/directives/derive.js'
import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from '../plugins/functions/request.js'
import { indicator } from '../plugins/directives/busy-flag.js'
import { init } from '../plugins/directives/on-mount.js'
import { on } from '../plugins/directives/event-listener.js'
import { show } from '../plugins/directives/visibility.js'
import { signals } from '../plugins/directives/declare.js'
import { text } from '../plugins/directives/text-content.js'

/** What a typical server-driven app needs: state, rendering, events, forms and the request client with morphing. */
export const essentials: Plugin[] = [signals, computed, text, show, className, attr, bind, on, init, indicator, httpGet, httpPost, httpPut, httpPatch, httpDelete, applyElements, applyState]
