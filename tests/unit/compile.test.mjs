import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile, compileBody, functionCompiler, transform } from '../../dist/kernel/compile.js';
import { createStore } from '../../dist/kernel/state.js';

test('transform rewrites signals and actions in code only', () => {
  assert.equal(transform('$count++'), '$.count++');
  assert.equal(transform('$user.name + "$not" + \'$no\''), '$.user.name + "$not" + \'$no\'');
  assert.equal(transform('`hi ${$name} and ${$a.b + `${$c}`}`'), '`hi ${$.name} and ${$.a.b + `${$.c}`}`');
  assert.equal(transform("$['a-b'] + $.x + obj.$y + $$z + a$b + $1"), "$['a-b'] + $.x + obj.$y + $$z + a$b + $1");
  assert.equal(transform('[...$items, $n]'), '[...$.items, $.n]', 'spread is not a member access');
  assert.equal(transform("@post('/x', {a: '@nope('})"), "__a.post('/x', {a: '@nope('})");
  assert.equal(transform('a@b.com + @ fit(1)'), 'a@b.com + @ fit(1)');
  assert.equal(transform('`x=${@fit($n)} ${"@not("}`'), '`x=${__a.fit($.n)} ${"@not("}`');
  assert.equal(transform("`${ '}' + $a }`"), "`${ '}' + $.a }`", 'a brace inside a string inside a hole');
  assert.equal(
    transform("$a.replace(/'/g, '') + $b"),
    "$.a.replace(/'/g, '') + $.b",
    'a regex literal is not a string',
  );
  assert.equal(transform('/$x/.test($a)'), '/$x/.test($.a)', 'no rewriting inside a regex');
  assert.equal(transform('$a / $b / 2'), '$.a / $.b / 2', 'division is not a regex');
  assert.equal(transform('$a // trailing\n+ $b'), '$.a \n+ $.b');
  assert.equal(transform('$_draft.x'), '$._draft.x');
});

test('compile returns an expression value, the last statement value, or runs statements', () => {
  const s = createStore();
  s.set('n', 2);
  const one = compile(functionCompiler, '$n * 2', ['el', 'evt']);
  assert.equal(one(s.$, {}, null, null), 4);
  assert.equal(compile(functionCompiler, '$n = 5; $n + 1', ['el', 'evt'])(s.$, {}, null, null), 6);
  compile(functionCompiler, 'if ($n > 1) { $n = 7 }', ['el', 'evt'])(s.$, {}, null, null);
  assert.equal(s.get('n'), 7);
  assert.equal(compile(functionCompiler, 'patch.n + el', ['el', 'evt', 'patch'])(s.$, {}, 1, null, { n: 2 }), 3);
  const act = compile(functionCompiler, "@post('/u', $n)", ['el', 'evt']);
  assert.deepEqual(act(s.$, { post: (...a) => a }, null, null), ['/u', 7]);
  assert.equal(compile(functionCompiler, '$n * 2', ['el', 'evt']), one, 'cached');
});

test('compiled bodies are strict: a typo throws instead of creating a global', () => {
  const s = createStore();
  s.set('count', 1);
  assert.throws(() => compile(functionCompiler, 'cuont = 1', ['el', 'evt'])(s.$, {}, null, null), ReferenceError);
  assert.equal(globalThis.cuont, undefined);
  const [body] = compileBody(functionCompiler, '$count', ['el', 'evt']);
  assert.match(body, /^"use strict";/);
});
