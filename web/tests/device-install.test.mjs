import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('manifest remains in scope on Pages and subdomain root', async () => {
 const m = JSON.parse(await readFile(new URL('public/manifest.webmanifest', root), 'utf8'));
 assert.equal(m.display, 'standalone');
 for (const base of ['https://example.com/daybook/','https://daybook.example.com/']) {
  const manifest = new URL('manifest.webmanifest',base);
  assert.equal(new URL(m.start_url,manifest).href,base);
  assert.equal(new URL(m.scope,manifest).href,base);
  for (const icon of m.icons) assert.ok(new URL(icon.src,manifest).href.startsWith(base));
 }
 for (const icon of m.icons) {
  const png = await readFile(new URL('public/'+icon.src,root));
  const size = Number(icon.sizes.split('x')[0]);
  assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size);
 }
});
test('worker intentionally does not cache private records or request permissions',async()=>{
 const source=await readFile(new URL('public/sw.js',root),'utf8');
 assert.ok(!/caches\.|requestPermission|pushManager|addEventListener\(['"]fetch/.test(source));
});
test('install links follow Vite base configuration and registration never requests permission',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 assert.ok(html.includes('%BASE_URL%manifest.webmanifest'));
 assert.ok(html.includes('%BASE_URL%daybook-180.png'));
 const source=await readFile(new URL('pwa.ts',root),'utf8');
 assert.ok(source.includes('import.meta.env.BASE_URL'));
 assert.ok(!/requestPermission|pushManager/.test(source));
});
