"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const active=path.join(root,'netlify','functions','monitor-market.js');
const source=fs.readFileSync(active,'utf8');
test('Netlify configured entrypoint includes parallel diagnostics and older safeguards',()=>{
  const toml=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
  assert.match(toml,/directory\s*=\s*"netlify\/functions"/);
  for(const part of ['FX parallel strategy diagnostic:', 'FX shadow diagnostic:', 'FX shadow settlement:', 'FX feed diagnostic:', 'quietHoursBlocked', 'parallel.settle(', 'parallel.record(']){
    assert.ok(source.includes(part),`Missing live feature: ${part}`);
  }
});
test('Netlify entrypoint dependencies are locally present',()=>{
  const refs=[...source.matchAll(/require\(["'](\.\/[^"']+)["']\)/g)].map(m=>m[1]);
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.resolve(path.dirname(active),ref+'.js')),ref);
  }
});
test('Japanese JS files are UTF-8 without replacement characters',()=>{
  for(const file of [active,path.join(root,'netlify/functions/parallel-strategies.js')]){
    const text=fs.readFileSync(file,'utf8');
    assert.ok(!text.includes('\ufffd'),file);
    assert.ok(!text.startsWith('\ufeff'),file);
  }
});
