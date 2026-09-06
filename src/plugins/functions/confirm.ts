import { act } from '../def.js';

/** `@confirm('Delete?') && @delete('/x')` asks before continuing. */
export const confirm = act('confirm', (_, message: string) => window.confirm(message));
