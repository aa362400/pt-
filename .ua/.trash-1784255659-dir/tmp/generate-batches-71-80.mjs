import fs from 'node:fs'; import path from 'node:path';
const i=Number(process.argv[2]); if(i<71||i>80)throw Error('71..80');
const root='G:/平台/.ua',raw=JSON.parse(fs.readFileSync(path.join(root,'intermediate','batches.json'),'utf8'));
const batch=(raw.batches??raw).find(x=>x.batchIndex===i),ext=JSON.parse(fs.readFileSync(path.join(root,'tmp',`ua-file-extract-results-${i}.json`),'utf8'));
if(!ext.scriptCompleted||ext.results.length!==batch.files.length)throw Error('incomplete'); const by=new Map(ext.results.map(x=>[x.path,x]));
const c=n=>n<50?'simple':n<=200?'moderate':'complex';
function type(f){if(f.fileCategory==='docs')return'document';if(f.fileCategory==='config')return'config';return'file'}
function summary(f,r){const p=f.path,n=path.posix.basename(p),h=r.sections?.[0]?.heading,k=r.sections?.length??0;
 if(p.includes('20260717020000')&&n==='metadata.json')return'记录 Listing 生成幂等 migration 的版本、风险、执行和回滚元数据。';
 if(p.includes('20260717020000')&&n==='migration.sql')return'为 Listing 生成路径添加幂等键、唯一约束和相关索引，防止重复生成与并发写入。';
 if(p.includes('20260717020000')&&n==='rollback.sql')return'回滚 Listing 生成幂等 migration 新增的数据库对象。';
 if(p.includes('20260717021000')&&n==='metadata.json')return'记录发布证明 NULL guard 加固 migration 的范围、验证和回滚信息。';
 if(p.includes('20260717021000')&&n==='migration.sql')return'加固发布证明与相关状态的 NULL 语义、约束和数据修复，阻止不完整证据被视为可发布。';
 if(p.includes('20260717021000')&&n==='rollback.sql')return'回滚发布证明 NULL guard 加固所新增的数据库约束。';
 if(n==='apply-indexes-concurrently.sql')return'以 CONCURRENTLY 方式创建生产索引，并包含存在性检查以降低锁表和重复执行风险。';
 if(n==='db-backup.sh')return'使用 PostgreSQL 工具生成带时间戳的数据库备份，并采用严格 shell 失败语义。';
 if(n==='db-refresh.sh')return'刷新本地数据库：重建目标库、恢复指定备份并运行必要校验。';
 if(n==='db-restore.sh')return'从指定备份恢复 PostgreSQL 数据库，并在危险操作前校验必需参数。';
 if(n==='.env.example')return p.startsWith('智能体前端/')?'声明前端 API 地址等 Vite 环境变量示例。':'提供电商图片智能体的模型、平台、存储、安全和运行参数模板。';
 if(n==='engine_config.yaml')return'配置电商图片智能体的模型路由、生成阶段、质量阈值、安全门禁和运行限制。';
 if(n==='requirements.txt')return'列出 Python 智能体 Web、图像处理、模型调用、测试和集成依赖。';
 if(n==='package.json')return'定义智能体前端的依赖、开发脚本、构建脚本和质量检查命令。';
 if(n.startsWith('tsconfig'))return`配置智能体前端 ${n} 的 TypeScript 编译目标、模块解析和严格检查。`;
 if(n==='.oxlintrc.json')return'配置智能体前端 Oxlint 规则和代码质量例外。'; if(n==='index.html')return'提供 Vite 智能体前端的 HTML 入口与根挂载节点。';
 if(p.includes('/templates/scenes/')&&n.endsWith('.json'))return`定义电商图片生成场景模板 ${n.replace('.json','')} 的构图、风格、文本和安全参数。`;
 if(n==='start_web.bat')return'在 Windows 上准备环境并启动电商图片智能体 Web 服务，提供本地访问入口。';
 if(f.fileCategory==='docs')return`文档“${h??n}”${k?`包含 ${k} 个章节`:''}，沉淀相关规则、方案、知识或交接信息。`;
 return`配置文件 ${n} 定义该模块的运行、模板或工具参数。`;}
function tags(f,t){if(f.path.includes('/migrations/'))return['database','migration','governance'];if(f.path.endsWith('.sql'))return['database','indexing','deployment'];if(f.fileCategory==='script')return['script','operations','database'];if(t==='document'){if(f.path.includes('/knowledge/'))return['documentation','knowledge-base','e-commerce'];if(f.path.includes('/docs/ADR-'))return['documentation','adr','architecture'];if(f.path.includes('/wiki/'))return['documentation','wiki','knowledge-management'];return['documentation','architecture','planning'];}if(t==='config'){if(f.path.includes('/templates/scenes/'))return['configuration','image-generation','scene-template'];return['configuration','build-system','runtime'];}return['frontend','markup','entry-point'];}
const nodes=batch.files.map(f=>{const r=by.get(f.path);if(!r)throw Error('missing '+f.path);const t=type(f);return{id:`${t}:${f.path}`,type:t,name:path.posix.basename(f.path),filePath:f.path,summary:summary(f,r),tags:tags(f,t),complexity:c(r.nonEmptyLines),...(f.fileCategory==='docs'&&(r.sections?.length??0)>20?{languageNotes:'Markdown 使用多级标题组织知识、阶段、证据与执行约束。'}:{})}});
const imports=batch.files.reduce((s,f)=>s+(batch.batchImportData[f.path]??[]).length,0);if(imports)throw Error('imports '+imports);if(new Set(nodes.map(x=>x.id)).size!==nodes.length)throw Error('dupes');
const out=path.join(root,'intermediate',`batch-${i}.json`);fs.writeFileSync(out,JSON.stringify({nodes,edges:[]},null,2)+'\n','utf8');const chk=JSON.parse(fs.readFileSync(out,'utf8'));if(chk.nodes.length!==batch.files.length)throw Error('coverage');
console.log(JSON.stringify({batchIndex:i,output:`batch-${i}.json`,nodes:nodes.length,edges:0,filesSkipped:ext.filesSkipped},null,2));
