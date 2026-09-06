import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Handler } from 'hono';

export interface ServeClientOptions {
  /** File inside sigmx's `dist` to serve (default `sigmx.standalone.js`, every plugin, minified). */
  file?: string;
  /**
   * Serve this file instead of one from sigmx's `dist`: a bundle you built yourself, for example with
   * `sigmxAuto()` from `sigmx/vite` so that only the plugins your markup uses ship. Absolute, or
   * relative to the working directory.
   */
  path?: string;
  /** `max-age` in seconds for the `cache-control` header (default one hour); an ETag handles the rest. */
  maxAge?: number;
}

/**
 * A route handler that serves the client with an ETag: the script-tag build from `node_modules/sigmx`
 * when no bundler is involved, or your own bundle via `path`:
 *
 *     app.get('/sigmx.js', serveClient())
 *     app.get('/sigmx.js', serveClient({ path: 'public/sigmx.js' }))
 */
export const serveClient = (o: ServeClientOptions = {}): Handler => {
  let cached: Promise<{ body: string; etag: string }> | undefined;
  const load = () => {
    cached ??= (async () => {
      const file =
        o.path ??
        join(
          dirname(createRequire(import.meta.url).resolve('sigmx/package.json')),
          'dist',
          o.file ?? 'sigmx.standalone.js',
        );
      const body = await readFile(file, 'utf8');
      const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 16)}"`;
      return { body, etag };
    })();
    return cached;
  };
  return async (c) => {
    const { body, etag } = await load();
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    return c.body(body, 200, {
      'content-type': 'text/javascript; charset=utf-8',
      etag,
      'cache-control': `public, max-age=${o.maxAge ?? 3600}`,
    });
  };
};
