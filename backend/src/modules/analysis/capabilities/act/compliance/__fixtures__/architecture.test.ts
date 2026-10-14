import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root=fileURLToPath(new URL("../",import.meta.url));
const groups=["contracts","verification","assessment","runtime","adapters","diagnostics"];
function files(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==="__fixtures__"?[]:e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith(".ts")?[path.join(dir,e.name)]:[]);}
const canonical=groups.flatMap(g=>files(path.join(root,g))).concat([path.join(root,"run-compliance-check.ts"),path.join(root,"index.ts")]);
test("canonical modules expose explicit interfaces and obey ownership boundaries",()=>{
 for(const file of canonical){
  const text=fs.readFileSync(file,"utf8"),owner=path.relative(root,file).split(path.sep)[0];
  assert.ok(!/export\s+\*\s+from/.test(text),"Wildcard export: "+file);
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){
    const spec=n.moduleSpecifier.text;
    if(!file.endsWith(path.join("runtime","rollout.ts")))assert.ok(!/legacy|element-schemas|compliance-schema-registry|compliance-runtime/.test(spec),"Legacy dependency: "+file);
    if(owner==="contracts")assert.ok(!/reporting|diagnostics|runtime\/|llm/.test(spec.replace(/skills\/runtime\//,"skills/")),"Impure contract: "+file);
    if(owner==="verification")assert.ok(!/investigation|assessment|reporting/.test(spec),"Verifier owns only judgment: "+file);
    if(owner==="assessment")assert.ok(!/verification\/|investigation|runtime\/|reporting|llm/.test(spec.replace(/skills\/runtime\//,"skills/")),"Impure assessment: "+file);
    if(spec.startsWith("..")&&groups.includes(spec.split("/")[1]))assert.ok(spec.endsWith("/index.js"),"Private cross-module import: "+file+" "+spec);
   }
   ts.forEachChild(n,visit);
  }visit(ast);
 }
});
test("new core has no static dependency cycles",()=>{
 const graph=new Map<string,string[]>();
 for(const file of canonical){
  const ast=ts.createSourceFile(file,fs.readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true),edges:string[]=[];
  for(const node of ast.statements)if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.startsWith(".")){
   const target=path.resolve(path.dirname(file),node.moduleSpecifier.text.replace(/\.js$/,".ts"));if(canonical.includes(target))edges.push(target);
  }
  graph.set(file,edges);
 }
 const done=new Set<string>(),active=new Set<string>();
 function visit(file:string){assert.ok(!active.has(file),"Dependency cycle at "+file);if(done.has(file))return;active.add(file);for(const next of graph.get(file)??[])visit(next);active.delete(file);done.add(file);}
 canonical.forEach(visit);
});
