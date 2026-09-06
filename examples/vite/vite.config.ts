import tailwindcss from '@tailwindcss/vite';
import { sigmxAuto } from 'sigmx/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Scans src/ and index.html and bundles only the plugins they use; `upper` is our own.
    sigmxAuto({ include: ['src', '.'], extensions: ['.html', '.ts'], custom: { upper: 'src/plugins/upper.ts' } }),
    // A tiny endpoint so the example can show a server round trip in `vite dev`.
    {
      name: 'example-api',
      configureServer(server) {
        server.middlewares.use('/api/greet', (req, res) => {
          const url = new URL(req.url ?? '/', 'http://x');
          const { name = '' } = JSON.parse(url.searchParams.get('sigmx') ?? '{}');
          res.setHeader('content-type', 'text/html');
          res.end(
            `<p id="greeting" class="text-sm text-teal-700 dark:text-teal-300">Hello ${name || 'stranger'}, from the server at ${new Date().toLocaleTimeString()}.</p>`,
          );
        });
      },
    },
  ],
});
