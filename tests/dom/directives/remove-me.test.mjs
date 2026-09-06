import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick, until } from '../helpers.mjs';

test('remove-me removes after its delay', async (t) => {
  const { render, stage } = app(t);
  await render('<div><p data-remove-me></p><p id="later" data-remove-me="20ms"></p></div>');
  await tick();
  assert.equal(stage.querySelectorAll('p').length, 1);
  await until(() => !stage.querySelector('#later'));
});
