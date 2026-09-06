declare module 'virtual:sigmx-plugins' {
  import type { Plugin } from 'sigmx';
  export const plugins: Plugin[];
  export const report: { reasons: Record<string, string>; unused: string[] };
}
