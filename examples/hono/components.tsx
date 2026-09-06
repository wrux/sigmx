import type { FC, PropsWithChildren } from 'hono/jsx';

const card =
  'space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900';
const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-50';
const field =
  'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-zinc-700';
const hint = 'text-sm text-zinc-600 dark:text-zinc-300';

export const towns = ['Bath', 'Bristol', 'Cardiff', 'Exeter', 'Oxford'];

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      {/* Tailwind's browser build keeps this example free of any build step; use the CLI or a bundler plugin in production. */}
      <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      <style>{'[data-cloak] { display: none !important }'}</style>
    </head>
    <body class="min-h-screen bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <main class="mx-auto max-w-2xl space-y-6 px-4 py-12">{children}</main>
      <script type="module" src="/sigmx.js"></script>
    </body>
  </html>
);

export const Towns: FC<{ q?: string }> = ({ q = '' }) => {
  const matches = towns.filter((t) => t.toLowerCase().includes(q.toLowerCase()));
  return (
    <ul
      id="towns"
      class="divide-y divide-zinc-200 transition-opacity duration-200 dark:divide-zinc-800"
      data-class="{ 'opacity-40': $stale }"
    >
      {matches.length ? (
        matches.map((t) => <li class="py-1.5">{t}</li>)
      ) : (
        <li class="py-1.5 text-zinc-500">No towns match.</li>
      )}
    </ul>
  );
};

export const Greeting: FC<{ name?: string }> = ({ name }) => (
  <p id="greeting" class="text-sm text-teal-700 dark:text-teal-300">
    Hello {name || 'stranger'}, from Hono at {new Date().toLocaleTimeString()}.
  </p>
);

export const Subscribed: FC<{ email: string; ok: boolean }> = ({ email, ok }) =>
  ok ? (
    <div id="subscribe" class="text-sm text-teal-700 dark:text-teal-300">
      Thanks, {email} is on the list.
    </div>
  ) : (
    <div id="subscribe" class="text-sm text-rose-600 dark:text-rose-400">
      That does not look like an email address.
    </div>
  );

// JSX attribute names cannot contain dots, so modifiers with arguments are spread from an object.
// Valueless attributes are written as `attr=""`: Hono renders a bare boolean prop as `attr="true"`.
const debouncedSearch = { 'data-on:input__debounce.200ms': "@get('/api/towns')" };

export const Home: FC = () => (
  <>
    <header class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight">sigmx + Hono</h1>
      <p class="text-zinc-500 dark:text-zinc-400">
        Installed from npm, served as a script tag from <code>node_modules</code>, pages and partials rendered with Hono
        JSX. Hono answers with HTML, JSON and event streams using nothing but Web <code>Request</code> and{' '}
        <code>Response</code>.
      </p>
    </header>

    <section class={card} data-signals="{ count: 0 }">
      <h2 class="text-lg font-semibold">Signals</h2>
      <div class="flex items-center gap-3">
        <button type="button" class={btn} data-on:click="$count--">
          −
        </button>
        <b class="inline-block min-w-[3ch] text-center text-xl tabular-nums" data-text="$count">
          0
        </b>
        <button type="button" class={btn} data-on:click="$count++">
          +
        </button>
        <span
          class="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          data-cloak=""
          data-show="$count > 4"
        >
          that is a lot of clicks
        </span>
      </div>
    </section>

    <section class={card} data-signals="{ name: '' }">
      <h2 class="text-lg font-semibold">HTML from a POST</h2>
      <input class={field} data-bind:name="" placeholder="Your name" />
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          data-on:click="@post('/api/greet')"
          data-indicator:loading=""
          data-attr:disabled="$loading"
        >
          Ask the server
        </button>
        <span class="text-sm text-zinc-500" data-cloak="" data-show="$loading">
          asking…
        </span>
      </div>
      <p id="greeting" class={hint}>
        The signals travel in the JSON body; <code>c.var.sigmx.signals()</code> reads them.
      </p>
    </section>

    <section class={card} data-signals="{ q: '', stale: false }">
      <h2 class="text-lg font-semibold">Server-rendered search</h2>
      <div class="flex items-center gap-3">
        <input
          class={field}
          type="search"
          placeholder="Filter towns…"
          data-bind:q=""
          data-on:input="$stale = true"
          {...debouncedSearch}
          data-indicator:searching=""
        />
        <span class="text-sm text-zinc-500" data-cloak="" data-show="$searching">
          searching…
        </span>
      </div>
      <Towns />
    </section>

    <section class={card}>
      <h2 class="text-lg font-semibold">A real form</h2>
      <form
        class="flex items-center gap-3"
        data-on:submit__prevent="@post('/api/subscribe', { contentType: 'form' })"
        data-indicator:sending=""
      >
        <input class={field} type="email" name="email" placeholder="you@example.com" required />
        <button type="submit" class={btn} data-attr:disabled="$sending">
          Subscribe
        </button>
      </form>
      <div id="subscribe" class={hint}>
        Posted as a normal form body; <code>c.var.sigmx.signals()</code> returns its fields.
      </div>
    </section>

    <section class={card} data-signals="{ progress: 0, running: false }">
      <h2 class="text-lg font-semibold">Streamed progress</h2>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class={btn}
          data-on:click="@get('/api/progress', { openWhenHidden: true })"
          data-attr:disabled="$running"
        >
          Start
        </button>
        <span class="tabular-nums" data-text="$progress + '%'">
          0%
        </span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div class="h-full bg-teal-500 transition-[width]" data-style:width="$progress + '%'"></div>
      </div>
    </section>
  </>
);
