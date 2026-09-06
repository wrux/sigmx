import { action } from '../../kernel/index.js';

/** `@confirm('Delete?') && @delete('/x')` asks before continuing. */
export const confirm = action({ name: 'confirm', call: (_, message: string) => window.confirm(message) });
