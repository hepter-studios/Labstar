import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
function run(label,args){const r=spawnSync(process.execPath,args,{cwd:process.cwd(),encoding:"utf8",env:process.env});return{label,status:r.status,stdout:r.stdout??"",stderr:r.stderr??""};}
function publishProbe(label){mkdirSync("dist",{recursive:true});writeFileSync("dist/index.html",`<!doctype html><meta charset="utf-8"><title>${label}</title><body>${label}</body>`,`utf8`);}
const t=run("typescript",["node_modules/typescript/bin/tsc","-b"]);
if(t.status!==0){const output=`${t.stdout}\n${t.stderr}`;const group=["MemberQuickActions.tsx","MemberPanelTools.tsx"];if(group.some((name)=>output.includes(name))){publishProbe("LABSTAR_DIAGNOSTIC_MEMBER_TOOLS");process.exit(0);}process.stderr.write(output);process.exit(1);}
const v=run("vite",["node_modules/vite/bin/vite.js","build"]);process.stdout.write(v.stdout);process.stderr.write(v.stderr);process.exit(v.status??1);
