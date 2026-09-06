import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Handler } from 'hono';

export interface ServeClientOptions {
  /** File inside sigmx's `dist` to serve (default `sigmx.standalone.js`, every plugin, minified). */
  file?: string;
  /** `max-age` in seconds for the `cache-control` header (default one hour); an ETag handles the rest. */
  maxAge?: number;
}

/**
 * A route handler that serves the client from `node_modules/sigmx` with an ETag, so no bundler is needed:
 *
 *     app.get('/sigmx.js', serveClient())
 */
export const serveClient = (o: ServeClientOptions = {}): Handler => {
  let cached: Promise<{ body: string; etag: string }> | undefined;
  const load = () => {
    cached ??= (async () => {
      const require = createRequire(import.meta.url);
      const dist = join(dirname(require.resolve('sigmx/package.json')), 'dist');
      const body = await readFile(join(dist, o.file ?? 'sigmx.standalone.js'), 'utf8');
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
