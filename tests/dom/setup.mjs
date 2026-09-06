// Registers happy-dom as the global DOM before any sigmx module is evaluated. Node's own fetch
// classes are captured first so mocked responses use real streams rather than happy-dom's.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

export const native = {
  fetch: globalThis.fetch,
  Response: globalThis.Response,
  Request: globalThis.Request,
  Headers: globalThis.Headers,
  ReadableStream: globalThis.ReadableStream,
};

GlobalRegistrator.register({ url: 'http://localhost/page' });
