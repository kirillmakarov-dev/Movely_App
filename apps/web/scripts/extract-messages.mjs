import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('src');
const entries = new Map();
function visitDir(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['translations','localized','legal-archive'].includes(item.name)) continue;
    const file = path.join(dir,item.name);
    if(item.isDirectory()) { visitDir(file); continue; }
    if (!/\.tsx?$/.test(file) || /\.(test|test-fixtures)\./.test(file)) continue;
    const source=fs.readFileSync(file,'utf8');
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    function visit(n) {
      if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)) {
        const value=ts.isJsxText(n)?n.text.replace(/\s+/g,' ').trim():n.text;
        if(/[\u0590-\u05ff]/.test(value)) {
          if(!entries.has(value)) entries.set(value,[]);
          entries.get(value).push(path.relative(root,file).replaceAll('\\','/'));
        }
      }
      ts.forEachChild(n,visit);
    }
    visit(ast);
  }
}
visitDir(root);
fs.writeFileSync('src/translations/source-messages.json',JSON.stringify([...entries].map(([he,files],id)=>({id,he,files:[...new Set(files)]})),null,2)+'\n');
console.log(entries.size+' source messages');
