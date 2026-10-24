import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvText,icalText,foldCalendar} from '../export-format.ts';
test('CSV neutralizes formula prefixes including whitespace and control characters',()=>{
 for(const text of ['=SUM(1,2)','+1','-1','@A1',' =HYPERLINK("x")','\t=cmd','\r=cmd','\n=cmd'])assert.ok(csvText(text).startsWith('"\''));
 assert.equal(csvText('Shop "A", Inc.'),'"Shop ""A"", Inc."');
});
test('calendar text cannot inject lines through CR, LF or punctuation',()=>{
 assert.equal(icalText('Note\\draft;one,two\r\nEND:VEVENT\rBEGIN:VEVENT\n'), 'Note\\\\draft\\;one\\,two\\nEND:VEVENT\\nBEGIN:VEVENT\\n');
});
test('calendar lines fold to 75 bytes and roundtrip Unicode text',()=>{
 const input='SUMMARY:'+icalText('測試🗓'.repeat(45))+'\r\nEND:VEVENT\r\n';
 const folded=foldCalendar(input);
 for(const line of folded.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 assert.equal(folded.replace(/\r\n /g,''),input);
});
