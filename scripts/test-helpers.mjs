import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

export async function dcComponentFrom(relativePath) {
  const html = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const script = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, `${relativePath} component script is missing`);

  const context = { DCLogic: class {}, console, Date, Map, Set, URL };
  vm.runInNewContext(`${script}\nthis.PageComponent = Component;`, context);
  return { html, Component: context.PageComponent };
}

export function makeStateful(Component) {
  const component = new Component();
  component.setState = (next, callback) => {
    const update = typeof next === 'function' ? next(component.state) : next;
    Object.assign(component.state, update);
    callback?.();
  };
  return component;
}
