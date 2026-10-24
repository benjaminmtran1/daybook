import {test} from 'node:test';
import assert from 'node:assert/strict';
import {daybookBasePath} from '../build-base.ts';
import {authRedirect} from '../auth-redirect.ts';
test('Custom domain remains default and Pages rollback requires explicit choice',()=>{
 assert.equal(daybookBasePath(undefined),'/');assert.equal(daybookBasePath('/'),'/');
 assert.equal(authRedirect('https://benjaminmtran1.github.io',daybookBasePath('/daybook/')),'https://benjaminmtran1.github.io/daybook/');
 assert.equal(authRedirect('https://daybook.benjamintran.ca',daybookBasePath(undefined)),'https://daybook.benjamintran.ca/');
});
test('reject protocol-relative, external, traversal, query and malformed build paths',()=>{
 for(const value of ['//attacker.invalid/','https://attacker.invalid/','/../','/daybook','/daybook/?x','/bad path/'])assert.throws(()=>daybookBasePath(value));
});
