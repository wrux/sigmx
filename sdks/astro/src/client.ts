// Convenience re-exports for app-local entrypoints:
//   import { createSigmx, all, plugins } from '@sigmx/astro/client'
//   createSigmx({ plugins: [plugins.text, plugins.on] })
export * from 'sigmx';
export * as plugins from 'sigmx/plugins';
export { all } from 'sigmx/presets/all';
export { minimal } from 'sigmx/presets/minimal';
