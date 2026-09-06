// Script-tag entry: registers every plugin and starts on DOM ready.
import { createSigmx } from './kernel/index.js'
import { all } from './presets/all.js'

export const sigmx = createSigmx({ plugins: all })
