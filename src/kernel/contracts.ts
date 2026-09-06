import type { CaseStyle } from '../lib/casing.js';
import type { Compiler } from './compile.js';
import type { Store } from './state.js';

export type El = HTMLElement | SVGElement | MathMLElement;
export type Mods = Map<string, string[]>;

/** A compiled attribute expression. `store` is the instance store; `actions` resolves `@name(...)`. */
export type Evaluator = (store: Store, actions: any, el: El, evt: Event | undefined, ...args: any[]) => any;
/** Turns expression source into an evaluator. The runtime compiler and the precompiled table both implement this. */
export type ExpressionCompiler = (src: string, params: string[], returns: boolean) => Evaluator;

export interface Runtime {
  /** Attribute prefixes being scanned; the first is primary. */
  readonly prefixes: readonly string[];
  /** Full attribute name under the primary prefix: attr('on') → 'data-on'. */
  attr(name: string): string;
  readonly store: Store;
  /** The low-level function compiler (`new Function` or the CSP compiler), for plugins that build code. */
  readonly compiler: Compiler;
  /** Dispatch a `sigmx-<type>` CustomEvent on `document`. */
  emit(type: string, detail?: unknown): void;
  /** Call a registered action by name. */
  call(name: string, ctx: ActionCtx, args: any[]): any;
  /** Event-name prefixes accepted from servers; the first is what sigmx itself uses. */
  readonly eventPrefixes: readonly string[];
  /** Route a named server event (with any accepted prefix) to its handler. Returns false if none. */
  handle(event: string, data: Record<string, string>): boolean;
  readonly attributes: Record<string, AttributePlugin>;
  readonly actions: Record<string, ActionPlugin>;
  readonly handlers: Record<string, HandlerPlugin>;
}

export interface Ctx {
  el: El;
  /** Plugin name, e.g. 'on'. */
  plugin: string;
  /** Full attribute name as written, e.g. 'data-on:click__debounce.300ms'. */
  attr: string;
  /** The `:key` part, if any. */
  key: string | undefined;
  /** Attribute value (the expression source). */
  value: string;
  mods: Mods;
  /** The key recased per `__case.<style>`, defaulting to `style`. */
  cased(style?: CaseStyle): string;
  /** Evaluate the attribute expression. `evt` and any `args` are exposed to it by name. */
  evaluate(evt?: Event, ...args: any[]): any;
  /** Reactive effect disposed with the attribute. Errors are reported, not thrown. */
  effect(fn: () => void): void;
  /** addEventListener with automatic removal on cleanup. */
  listen(target: EventTarget, type: string, fn: (e: any) => void, options?: AddEventListenerOptions): void;
  cleanup(fn: () => void): void;
  error(message: string, extra?: Record<string, unknown>): Error;
  store: Store;
  runtime: Runtime;
}

export interface ActionCtx {
  el: El;
  evt?: Event;
  store: Store;
  runtime: Runtime;
  error(message: string, extra?: Record<string, unknown>): Error;
  /** Run when the attribute that invoked the action is torn down. */
  cleanup(fn: () => void): void;
}

export interface AttributePlugin {
  type: 'attribute';
  name: string;
  key?: 'required' | 'forbidden';
  value?: 'required' | 'forbidden';
  /** Whether the expression yields a value (default) or is a statement body. */
  returns?: boolean;
  /** Extra parameter names the expression can reference, in the order passed to `evaluate`. */
  args?: string[];
  // biome-ignore lint/suspicious/noConfusingVoidType: mount may return nothing or a teardown
  mount(ctx: Ctx): void | (() => void);
}

export interface ActionPlugin {
  type: 'action';
  name: string;
  call(ctx: ActionCtx, ...args: any[]): any;
}

/** Handles a named server event (for example a streamed patch). */
export interface HandlerPlugin {
  type: 'handler';
  name: string;
  handle(runtime: Runtime, data: Record<string, string>): void;
}

export type Plugin = AttributePlugin | ActionPlugin | HandlerPlugin;

export interface RuntimeOptions {
  plugins?: Plugin[];
  /** How attribute expressions become functions: `runtimeExpressions(compiler)` or `precompiled(table)`. */
  expressions: ExpressionCompiler;
  /** Low-level function compiler exposed to plugins (default `new Function`). */
  compile?: Compiler;
  /** Attribute prefix or prefixes to scan. Default 'data-'. */
  prefix?: string | string[];
  /** Server event-name prefixes to accept, add a second prefix while migrating from another library. Default 'sigmx-'. */
  eventPrefix?: string | string[];
  /** Share a store between instances. */
  store?: Store;
  /** Called for any plugin or expression error. Default: console.error. */
  onError?: (error: unknown, info: { plugin?: string; el?: Element; attr?: string }) => void;
  /** Scan `document.documentElement` on creation (after DOM ready). Default true. */
  autoStart?: boolean;
}

/** `createSigmx` options: `expressions` is optional and defaults to the runtime compiler. */
export interface SigmxOptions extends Omit<RuntimeOptions, 'expressions'> {
  expressions?: ExpressionCompiler;
}

export interface Sigmx {
  runtime: Runtime;
  store: Store;
  /** Root namespace proxy for use from JavaScript: `sigmx.$.count++`. */
  $: any;
  /** Mount plugins under `root` and observe it for changes. */
  apply(root?: El | ShadowRoot, observe?: boolean): void;
  /** Register more plugins; attribute plugins are applied to observed roots immediately. */
  use(...plugins: Plugin[]): void;
  destroy(): void;
}
