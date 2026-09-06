import { action } from '../../kernel/index.js'

/** `@clipboard(text, isBase64?)` copies text; base64 input is decoded first. */
export const clipboard = action({
  name: 'clipboard',
  call: (_, text: string, base64 = false) =>
    navigator.clipboard.writeText(
      base64 ? new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))) : text,
    ),
})
