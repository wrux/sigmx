import type { Compiler } from './compile.js';

/**
 * Compiler for pages with a strict Content-Security-Policy: compiles through a nonce-bearing
 * inline `<script>` (and a Trusted Types policy when present) instead of `new Function`.
 * Pass as `createSigmx({ compile: cspCompiler(nonce) })`.
 */
let policy: { createScript(s: string): any } | undefined;

export const cspCompiler = (nonce: string): Compiler => {
  if (!nonce) throw new Error('cspCompiler needs the page nonce');
  // One Trusted Types policy per page: creating a second one with the same name throws under a strict CSP.
  policy ??= (window as any).trustedTypes?.createPolicy('sigmx', { createScript: (s: string) => s });
  return (params, body) => {
    const script = document.createElement('script');
    script.nonce = nonce;
    const text = `document.currentScript.f=function(${params.join(',')}){${body}}`;
    script.text = policy ? policy.createScript(text) : text;
    document.head.append(script);
    script.remove();
    const fn = (script as any).f;
    if (!fn) throw new Error('the Content-Security-Policy blocked expression compilation');
    return fn;
  };
};
