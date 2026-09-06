import type { Plugin } from '../kernel/contracts.js'
import * as p from '../plugins/index.js'

/** Every plugin. */
export const all: Plugin[] = Object.values(p).filter((x): x is Plugin => typeof x === 'object' && 'type' in x)
