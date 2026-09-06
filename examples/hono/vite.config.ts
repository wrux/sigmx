import { sigmxAuto } from 'sigmx/vite';
import { defineConfig } from 'vite';

// Bundles the client into public/sigmx.js with only the plugins the JSX components use.
// `npm run build` (also run before `dev` and `start`) writes it; serveClient({ path }) serves it.
export default defineConfig({
  plugins: [sigmxAuto({ include: ['components.tsx', 'server.tsx'], extensions: ['.tsx'] })],
  publicDir: false,
  build: {
    // A plain entry rather than `lib` mode, which leaves ES output unminified.
    rollupOptions: { input: 'client.ts', output: { entryFileNames: 'sigmx.js' } },
    outDir: 'public',
    minify: 'esbuild',
    modulePreload: false,
  },
});
