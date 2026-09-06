import { sigmxAuto } from 'sigmx/vite';
import { defineConfig } from 'vite';

// Bundles the client into public/sigmx.js with only the plugins index.html and server.js use.
// `npm run build` (also run before `dev` and `start`) writes it; the server serves it as a static file.
export default defineConfig({
  plugins: [sigmxAuto({ include: ['index.html', 'server.js'], extensions: ['.html', '.js'] })],
  publicDir: false,
  build: {
    // A plain entry rather than `lib` mode, which leaves ES output unminified.
    rollupOptions: { input: 'client.js', output: { entryFileNames: 'sigmx.js' } },
    outDir: 'public',
    minify: 'esbuild',
    modulePreload: false,
  },
});
