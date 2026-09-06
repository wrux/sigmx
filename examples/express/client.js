// The client entry. `virtual:sigmx-plugins` is served by sigmxAuto() in vite.config.js and exports
// exactly the plugins the markup uses, so the bundle carries nothing else.

import { plugins } from 'virtual:sigmx-plugins';
import { createSigmx } from 'sigmx';

createSigmx({ plugins });
