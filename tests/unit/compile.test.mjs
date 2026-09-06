import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile, functionCompiler, rewriteActions, splitStatements } from '../../dist/kernel/compile.js';
import { createStore } from '../../dist/kernel/state.js';

test('rewriteActions only touches @name( outside strings', () => {
  assert.equal(rewriteActions("@post('/x', {a: '@nope('})"), "__a.post('/x', {a: '@nope('})");
  assert.equal(rewriteActions('a@b.com'), 'a@b.com');
  assert.equal(rewriteActions('@ fit(1)'), '@ fit(1)');
  assert.equal(
    rewriteActions('`x=${@fit(1, 0, 1, 0, 9)} ${"@not("}`'),
    '`x=${__a.fit(1, 0, 1, 0, 9)} ${"@not("}`',
    'template holes are rewritten, strings inside them are not',
  );
});

test('splitStatements respects nesting and strings', () => {
  assert.deepEqual(splitStatements("$a = 1; $b = {x: ';'}; f(1;2)"), ['$a = 1', " $b = {x: ';'}", ' f(1;2)']);
});

test('compile returns an expression value and exposes el/evt/args', () => {
  const s = createStore();
  s.set('n', 2);
  const one = compile(functionCompiler, '$n * 2', ['el', 'evt'], true);
  assert.equal(one(s, {}, null, null), 4);
  compile(functionCompiler, '$n = 5; $n + 1', ['el', 'evt'], true)(s, {}, null, null);
  assert.equal(s.get('n'), 5, 'statements run for their effects');
  const withArgs = compile(functionCompiler, 'patch.n + el', ['el', 'evt', 'patch'], true);
  assert.equal(withArgs(s, {}, 1, null, { n: 2 }), 3);
  const actions = { post: (...a) => a };
  const act = compile(functionCompiler, "@post('/u', $n)", ['el', 'evt'], true);
  assert.deepEqual(act(s, actions, null, null), ['/u', 5]);
  assert.equal(compile(functionCompiler, '$n * 2', ['el', 'evt'], true), one); // cached
});
