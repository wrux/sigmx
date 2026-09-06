import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batch, computed, effect, signal, untracked } from '../../dist/kernel/reactive.js';

test('effect re-runs only when a dependency changes', () => {
  const a = signal(1);
  const b = signal(10);
  let runs = 0;
  effect(() => {
    a.value;
    runs++;
  });
  assert.equal(runs, 1);
  b.value = 11;
  assert.equal(runs, 1);
  a.value = 2;
  assert.equal(runs, 2);
  a.value = 2;
  assert.equal(runs, 2);
});

test('computed is lazy, cached, and does not cascade when its value is unchanged', () => {
  const n = signal(1);
  let computes = 0;
  const even = computed(() => {
    computes++;
    return n.value % 2 === 0;
  });
  assert.equal(computes, 0);
  let runs = 0;
  effect(() => {
    even.value;
    runs++;
  });
  assert.equal(computes, 1);
  n.value = 3; // still odd → even unchanged → effect must not re-run
  assert.equal(computes, 2);
  assert.equal(runs, 1);
  n.value = 4;
  assert.equal(runs, 2);
});

test('batch coalesces and untracked does not subscribe', () => {
  const a = signal(0),
    b = signal(0);
  let runs = 0;
  effect(() => {
    a.value;
    untracked(() => b.value);
    runs++;
  });
  batch(() => {
    a.value = 1;
    a.value = 2;
  });
  assert.equal(runs, 2);
  b.value = 5;
  assert.equal(runs, 2);
});

test('dispose stops an effect and nested effects die with their parent run', () => {
  const a = signal(0),
    b = signal(0);
  let inner = 0;
  const stop = effect(() => {
    a.value;
    effect(() => {
      b.value;
      inner++;
    });
  });
  assert.equal(inner, 1);
  b.value = 1;
  assert.equal(inner, 2);
  a.value = 1; // parent re-runs, old inner disposed, new inner runs once
  assert.equal(inner, 3);
  b.value = 2;
  assert.equal(inner, 4);
  stop();
  b.value = 3;
  assert.equal(inner, 4);
});
