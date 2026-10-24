import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source=await readFile(new URL('../DeviceReminders.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
 .replace(/from ['"](react(?:\/jsx-runtime)?)['"]/g,(_,name)=>`from '${import.meta.resolve(name)}'`)
 .replace("from './device-reminders'",`from '${new URL('../device-reminders.ts',import.meta.url).href}'`);
const {default:DeviceReminders}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const render=(showSettings)=>renderToStaticMarkup(createElement(DeviceReminders,{ownerId:'test',tasks:[],showSettings}));
test('settings clearly distinguish opt-in foreground prompts from closed-app alerts',()=>{
 const html=render(true);
 for(const phrase of ['not phone notifications','closed or in the background','this account in this browser only','America/Toronto','task deadline'])assert.ok(html.includes(phrase));
 assert.ok(!html.includes('checked=""'));
 assert.equal((html.match(/type="time"/g)||[]).length,3);
});
test('component renders no unsolicited prompt when disabled',()=>{assert.equal(render(false),'');});
test('component never invokes browser notification or geolocation permission',()=>{assert.ok(!/requestPermission|geolocation|pushManager/.test(source));});
