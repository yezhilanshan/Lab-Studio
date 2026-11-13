const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const rows=JSON.parse(fs.readFileSync(path.join(root,'app/local-catalog.json'),'utf8'));
const stats=JSON.parse(fs.readFileSync(path.join(root,'app/catalog-stats.json'),'utf8'));
const topics=JSON.parse(fs.readFileSync(path.join(root,'app/catalog-topics.json'),'utf8'));
assert.equal(rows.length,185);
assert.equal(rows.filter(r=>r.catalogScope==='local').length,161);
assert.equal(rows.filter(r=>r.catalogScope==='guide').length,24);
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
assert.equal(new Set(rows.map(r=>r.title.toLowerCase())).size,rows.length);
const sources=rows.flatMap(r=>r.sourcePath.split('\n'));
assert.equal(sources.length,206);
assert.equal(new Set(sources).size,206);
assert.equal(rows.flatMap(r=>r.sourceHash.split('\n')).length,187);
assert.equal(new Set(rows.flatMap(r=>r.sourceHash.split('\n'))).size,187);
for(const r of rows){
 assert(topics.some(t=>t.name===r.theme),'Unknown theme: '+r.title);
 assert(!/^(?:Subject:|<\d|Microsoft Word)/.test(r.title),'Unclean title');
 assert.equal(r.sourcePath.split('\n').length,+r.sourceCount);
 assert(r.sourceHash.split('\n').every(s=>/^[a-f0-9]{64}$/.test(s)));
 for(const field of ['problem','difficulty','solution','limitations','borrow','yearEvidence','summaryBasis'])assert(r[field]?.trim(),r.title+' missing '+field);
 assert(!r.year||/^20\d{2}$/.test(r.year),'Invalid year');
 if(r.catalogScope==='guide')assert.equal(r.year,'','Guides must not impersonate original publication dates');
 if(r.relatedTo){assert(rows.some(t=>t.id===r.relatedTo));assert(r.relationNote.includes('不表示引用'));}
 assert(/^\/paper-text\/[a-f0-9]{16}\.txt$/.test(r.textUrl));
 assert(fs.statSync(path.join(root,'public',r.textUrl)).size>300);
}
assert(rows.find(r=>r.sourceIndex==='97').title.startsWith('Bullet Trains'));
assert(rows.find(r=>r.sourceIndex==='74').title.startsWith('Parallel Training'));
assert.equal(stats.dated+stats.undated,161);
assert.equal(stats.relations,rows.filter(r=>r.relatedTo).length);
console.log(`Catalog verified: ${sources.length} source PDFs, ${rows.length} catalog entries, ${stats.relations} conceptual relations; all text assets and provenance present.`);
