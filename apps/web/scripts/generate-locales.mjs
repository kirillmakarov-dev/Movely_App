import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const cleanPunctuation = value => value.replace(/[\u2013\u2014]/g, '-');
const skip = file => /\.(test|spec|test-fixtures)\./.test(file);
const shared = new Set(['components/LanguageSwitcher.tsx']);
function filesAt(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) return ['localized','translations','en','ru'].includes(item.name) ? [] : filesAt(file);
    return skip(file) ? [] : [file];
  });
}
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== text) fs.writeFileSync(file,text);
}
export function messageCatalog() {
  const parts = fs.readdirSync(path.join(src,'translations')).filter(name => /^part-.*\.json$/.test(name));
  const entries = parts.flatMap(name => JSON.parse(fs.readFileSync(path.join(src,'translations',name),'utf8')));
  const map = new Map();
  for (const entry of entries) {
    if (!entry.en?.trim() || !entry.ru?.trim() || /[\u2013\u2014]/.test(entry.en + entry.ru)) throw new Error(`Invalid translation: ${entry.id}`);
    for(const key of [entry.he, cleanPunctuation(entry.he), entry.heReviewed].filter(Boolean)) map.set(key,entry);
  }
  return map;
}
export function translateSource(source, filename, locale, catalog) {
  const ast = ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
  const changes = [];
  function translate(value) {
    if (!/[\u0590-\u05ff]/.test(value)) return cleanPunctuation(value);
    const entry = catalog.get(value) ?? catalog.get(value.trim());
    if (!entry) throw new Error(`Missing ${locale} translation in ${filename}: ${value}`);
    const translated = entry[locale];
    // Template fragments intentionally retain their leading/trailing spaces.
    return cleanPunctuation(translated);
  }
  const template = value => value.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${');
  function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      let value = n.text;
      if (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)) {
        if(value.startsWith('@/') && !shared.has(value.slice(2)+'.tsx')) value = `@/localized/${locale}/${value.slice(2)}`;
      } else {
        value = translate(value);
        if(value === 'he-IL' || (value === 'he' && (ts.isCallExpression(n.parent) && /localeCompare|DateTimeFormat/.test(n.parent.expression.getText(ast)) || ts.isNewExpression(n.parent) && /DateTimeFormat/.test(n.parent.expression.getText(ast))))) value = locale === 'ru' ? 'ru-RU' : 'en-GB';
        if(value === 'he' && filename.endsWith('google-identity.ts')) value = locale;
        if(value === 'rtl' && ts.isJsxAttribute(n.parent) && n.parent.name.getText(ast) === 'dir') value = 'ltr';
        if(value.includes('gsi/client?hl=he')) value = value.replace('hl=he', `hl=${locale}`);
      }
      if(value !== n.text) changes.push([n.getStart(ast),n.end,ts.isJsxAttribute(n.parent) ? `{${JSON.stringify(value)}}` : JSON.stringify(value)]);
    } else if(ts.isJsxText(n)) {
      const key = n.text.replace(/\s+/g,' ').trim();
      if (/[\u0590-\u05ff\u2013\u2014]/.test(key)) {
        const prefix = /^[ \t]/.test(n.text) && !/^\s*\n/.test(n.text) ? ' ' : '';
        const suffix = /[ \t]$/.test(n.text) && !/\n\s*$/.test(n.text) ? ' ' : '';
        changes.push([n.pos,n.end,`{${JSON.stringify(prefix+translate(key)+suffix)}}`]);
      }
    } else if(ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)) {
      const value=translate(n.text);
      if(value!==n.text) changes.push([n.getStart(ast),n.end,`${ts.isTemplateHead(n)?'`':'}'}${template(value)}${ts.isTemplateTail(n)?'`':'${'}`]);
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);
  for (const [start,end,text] of changes.sort((a,b)=>b[0]-a[0])) source=source.slice(0,start)+text+source.slice(end);
  if(filename.endsWith('lib/locale.ts')) source=source.replace('UI_LOCALE: Locale = "he"',`UI_LOCALE: Locale = "${locale}"`);
  return '// Generated from the Hebrew source and reviewed dictionaries. Do not edit.\n'+source;
}
export function generateLocales() {
  const catalog=messageCatalog();
  const sourceFiles=filesAt(src).filter(file=>/\.(tsx?|json)$/.test(file) && !file.endsWith('proxy.ts') && !['app/layout.tsx','app/not-found.tsx'].includes(path.relative(src,file).replaceAll('\\','/')) && !shared.has(path.relative(src,file).replaceAll('\\','/')));
  for(const locale of ['en','ru']) {
    for(const file of sourceFiles) {
      const relative=path.relative(src,file).replaceAll('\\','/');
      const source=fs.readFileSync(file,'utf8');
      function translateJson(value) {
        if(typeof value === 'string') {
          const entry=catalog.get(value);
          if(/[\u0590-\u05ff]/.test(value) && !entry) throw new Error(`Missing archived translation: ${value}`);
          return cleanPunctuation(entry ? entry[locale] : value);
        }
        if(Array.isArray(value)) return value.map(translateJson);
        if(value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,text])=>[key,translateJson(text)]));
        return value;
      }
      const output=relative.endsWith('.json') ? JSON.stringify(translateJson(JSON.parse(source)),null,2)+'\n' : translateSource(source,relative,locale,catalog);
      write(path.join(src,'localized',locale,relative),output);
      if(/^app\/.*(?:page|layout)\.tsx$/.test(relative)) {
        const modulePath=`@/localized/${locale}/${relative.slice(0,-4)}`;
        // Re-exporting the original signature keeps async params, access checks,
        // metadata and server/client boundaries identical in every language.
        const exported=['default'];
        const ast=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true);
        for(const statement of ast.statements) {
          if(!statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword) || statement.modifiers.some(modifier=>modifier.kind===ts.SyntaxKind.DefaultKeyword)) continue;
          if(ts.isVariableStatement(statement)) for(const declaration of statement.declarationList.declarations) if(ts.isIdentifier(declaration.name)) exported.push(declaration.name.text);
          if(ts.isFunctionDeclaration(statement) && statement.name) exported.push(statement.name.text);
        }
        write(path.join(src,'app',locale,relative.slice(4)),`// Generated locale route.\nexport { ${exported.join(', ')} } from ${JSON.stringify(modulePath)};\n`);
      }
    }
  }
  return { messages: catalog.size, files: sourceFiles.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(generateLocales());
