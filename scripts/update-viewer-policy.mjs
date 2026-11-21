import fs from 'node:fs/promises';
import {viewerPolicy} from './viewer-policy.mjs';
import {embedFeatures} from './build-worker-assets.mjs';
const path=new URL('../viewer.html',import.meta.url);let html=await fs.readFile(path,'utf8');
const dataWorker=(await fs.readFile(new URL('../src/data-worker.js',import.meta.url),'utf8')).trim();
html=html.replace(/(\/\/ BEGIN GENERATED DATA WORKER[^\r\n]*\r?\n)[\s\S]*?(\r?\n\/\/ END GENERATED DATA WORKER)/,(_,before,after)=>before+dataWorker+after);
await fs.writeFile(path,viewerPolicy(embedFeatures(html)));
console.log('Viewer content policy synchronized (1 inline script, 1 static Artifact bootstrap).');
