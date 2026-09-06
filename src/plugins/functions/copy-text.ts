import { act } from '../def.js';

/** `@clipboard(text, isBase64?)` copies text; base64 input is decoded first. */
export const clipboard = act('clipboard', (_, text: string, base64 = false) =>
  navigator.clipboard.writeText(
    base64 ? new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))) : text,
  ),
);
