import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the real TSX without introducing another test dependency.
const source = await readFile(new URL('./TaskFocus.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
}}).outputText.replace(/import ['"]\.\/task-focus\.css['"];?/, '')
  .replace(/from ['"](react(?:\/jsx-runtime)?)['"]/g, (_, module) => `from '${import.meta.resolve(module)}'`);
const directory = await mkdtemp(join(tmpdir(), 'daybook-task-focus-'));
let TaskFocus, TaskFocusWithHooks;
try {
  await writeFile(join(directory, 'TaskFocus.mjs'), compiled);
  TaskFocus = (await import(pathToFileURL(join(directory, 'TaskFocus.mjs')).href)).default;
  const mockHooks = 'data:text/javascript,' + encodeURIComponent(`
    export const useEffect = fn => globalThis.__focusHarness.effects.push(fn);
    export const useId = () => "focus-title";
    export const useRef = () => ({current: globalThis.__focusHarness.refs.shift()});
  `);
  await writeFile(join(directory, 'TaskFocus-hooks.mjs'), compiled.replace(import.meta.resolve('react'), mockHooks));
  TaskFocusWithHooks = (await import(pathToFileURL(join(directory, 'TaskFocus-hooks.mjs')).href)).default;
} finally { await rm(directory, {recursive: true, force: true}); }
const task = {id:'task-1', title:'Finish measurements', projectId:'p1', day:'2026-10-24', time:'09:30', minutes:45, deadline:'2026-10-25', priority:true, done:false, repeat:'weekly'};
const render = (props = {}) => renderToStaticMarkup(createElement(TaskFocus, {
  task, projectName:'Workshop', onBack() {}, onEdit() {}, onComplete() {}, ...props,
}));

test('focused task renders only its context and essential controls', () => {
  const html = render();
  for (const text of ['Finish measurements', 'Workshop', 'Priority', '45 min', '2026-10-24', '09:30', '2026-10-25', 'weekly', 'Mark complete', 'Edit task', '← Back']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('sidebar'));
});
test('dialog is named by its focusable heading and status is announced', () => {
  const html = render({status:'Saving…'});
  const labelledBy = html.match(/aria-labelledby="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${labelledBy}"`));
  assert.match(html, /<h1[^>]*tabindex="-1"/);
  assert.match(html, /role="status" aria-live="polite">Saving…/);
});
test('busy or blocked tasks disable mutations but preserve Back', () => {
  const html = render({disabled:true});
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.match(html, /<button type="button">← Back<\/button>/);
});
test('completed tasks offer reversal, and unfiled tasks have honest empty context', () => {
  const html = render({projectName:undefined, task:{...task, done:true, day:'', time:'', deadline:'', repeat:'none', priority:false}});
  assert.ok(html.includes('Mark incomplete'));
  assert.ok(html.includes('Completed.'));
  assert.ok(html.includes('Inbox'));
  assert.ok(html.includes('Unscheduled'));
  assert.ok(!html.includes('<dt>Due</dt>'));
  assert.ok(!html.includes('<dt>Repeats</dt>'));
});
test('task and status text are escaped rather than interpreted as markup', () => {
  const html = render({task:{...task, title:'<script>alert(1)</script>'}, status:'<img onerror=evil>'});
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>'));
});


// Exercise lifecycle and handlers with DOM doubles; native browser focus trapping
// and actual layout still require browser QA.
function harness(originConnected = true) {
  class Element {
    isConnected = originConnected;
    focused = 0;
    attributes = new Map();
    focus() { this.focused++; }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
  }
  const origin = new Element(), fallback = new Element(), heading = new Element();
  const surface = {opened:0, closed:0, showModal() {this.opened++;}, close() {this.closed++;}};
  const document = {activeElement:origin, body:{style:{overflow:'auto'}}, querySelector:() => fallback};
  globalThis.HTMLElement = Element;
  globalThis.document = document;
  globalThis.__focusHarness = {effects:[], refs:[surface, heading]};
  let backs = 0;
  const element = TaskFocusWithHooks({task, onBack:() => backs++, onEdit() {}, onComplete() {}});
  const cleanup = globalThis.__focusHarness.effects[0]();
  return {origin, fallback, heading, surface, document, element, cleanup, backs:() => backs};
}
test('focus lifecycle opens dialog, focuses title, locks scroll and restores origin', () => {
  const h = harness();
  assert.equal(h.surface.opened, 1);
  assert.equal(h.heading.focused, 1);
  assert.equal(h.document.body.style.overflow, 'hidden');
  h.cleanup();
  assert.equal(h.surface.closed, 1);
  assert.equal(h.origin.focused, 1);
  assert.equal(h.document.body.style.overflow, 'auto');
});
test('removed task origin returns focus to page heading without leaving tabindex', () => {
  const h = harness(false);
  h.cleanup();
  assert.equal(h.fallback.focused, 1);
  assert.equal(h.fallback.getAttribute('tabindex'), null);
});
test('Escape requests controlled exit instead of leaving stale task state', () => {
  const h = harness();
  let prevented = false;
  h.element.props.onCancel({preventDefault() {prevented = true;}});
  assert.equal(prevented, true);
  assert.equal(h.backs(), 1);
  h.cleanup();
});
