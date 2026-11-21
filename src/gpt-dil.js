function gptDilCore(){
  const tags=new Set('mark text box row badge divider grid grid-item title caption MapWidgetV2 Entity Link Rating ReservationTimePillsRefWidget list list-item label radio-group radio button input AsyncImage AsyncImageGroup icon Chart checkbox Cite'.split(' '));
  const forbidden=new Set(['__proto__','prototype','constructor','caller','callee']);
  const own=(value,key)=>value!=null&&!forbidden.has(String(key))&&Object.hasOwn(Object(value),key)?value[key]:undefined;
  const diagnostic=(code,detail)=>({code,detail:String(detail).slice(0,256)});
  function expression(source){
    let position=0,tokens=0;
    const space=()=>{while(/\s/.test(source[position]||'')&&position<source.length)position++;};
    const take=value=>{space();if(source.startsWith(value,position)){position+=value.length;return true;}return false;};
    function stringLiteral(){const quote=source[position++];let value='';while(position<source.length){const char=source[position++];if(char===quote)return {kind:'literal',value};if(char==='\\'){const escaped=source[position++];if(escaped==='u'){const hex=source.slice(position,position+4);if(!/^[\da-f]{4}$/i.test(hex))throw Error('Invalid Unicode escape');value+=String.fromCharCode(parseInt(hex,16));position+=4;}else value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'})[escaped]??escaped;}else value+=char;}throw Error('Unclosed string');}
    function primary(depth){
      if(++tokens>10000||depth>64)throw Error('Expression limit');space();let result;
      if(source[position]==='"'||source[position]==="'")result=stringLiteral();
      else if(take('`')){const parts=[];let text='';while(position<source.length&&source[position]!=='`'){if(source[position]==='\\'){position++;text+=source[position++]||'';}else if(source.startsWith('${',position)){position+=2;parts.push({kind:'literal',value:text});text='';parts.push(parse(0,depth+1));if(!take('}'))throw Error('Template closing brace');}else text+=source[position++];}if(!take('`'))throw Error('Unclosed template');parts.push({kind:'literal',value:text});result={kind:'template',parts};}
      else if(take('(')){if(take(')')){if(!take('=>'))throw Error('Empty expression');result={kind:'lambda',params:[],body:parse(0,depth+1)};}else{const saved=position;const names=[];let match;while((match=/^[A-Za-z_$][\w$]*/.exec(source.slice(position)))){names.push(match[0]);position+=match[0].length;if(!take(','))break;space();}if(names.length&&take(')')&&take('=>'))result={kind:'lambda',params:names,body:parse(0,depth+1)};else{position=saved;result=parse(0,depth+1);if(!take(')'))throw Error('Closing parenthesis');}}}
      else if(take('[')){const items=[];if(!take(']')){do{items.push(take('...')?{kind:'spread',value:parse(0,depth+1)}:parse(0,depth+1));}while(take(',')&&!source.slice(position).trimStart().startsWith(']'));if(!take(']'))throw Error('Closing array');}result={kind:'array',items};}
      else if(take('{')){const entries=[];if(!take('}')){do{space();let key;if(source[position]==='"'||source[position]==="'")key=stringLiteral().value;else{const match=/^[A-Za-z_$][\w$]*/.exec(source.slice(position));if(!match)throw Error('Object key');key=match[0];position+=key.length;}if(forbidden.has(key)||!take(':'))throw Error('Object property');entries.push([key,parse(0,depth+1)]);}while(take(',')&&!source.slice(position).trimStart().startsWith('}'));if(!take('}'))throw Error('Closing object');}result={kind:'object',entries};}
      else if(take('!'))result={kind:'unary',operator:'!',value:primary(depth+1)};
      else if(take('-'))result={kind:'unary',operator:'-',value:primary(depth+1)};
      else{space();const number=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));if(number){position+=number[0].length;result={kind:'literal',value:Number(number[0])};}else{const name=/^[A-Za-z_$][\w$]*/.exec(source.slice(position));if(!name)throw Error('Unsupported expression at '+position);position+=name[0].length;result=['true','false','null'].includes(name[0])?{kind:'literal',value:JSON.parse(name[0])}:{kind:'identifier',name:name[0]};if(take('=>'))result={kind:'lambda',params:[name[0]],body:parse(0,depth+1)};}}
      while(true){if(take('.')){const name=/^[A-Za-z_$][\w$]*/.exec(source.slice(position));if(!name||forbidden.has(name[0]))throw Error('Forbidden property');position+=name[0].length;result={kind:'member',object:result,key:{kind:'literal',value:name[0]}};}else if(take('[')){const key=parse(0,depth+1);if(!take(']'))throw Error('Closing access');result={kind:'member',object:result,key};}else if(take('(')){const args=[];if(!take(')')){do{args.push(parse(0,depth+1));}while(take(','));if(!take(')'))throw Error('Closing call');}result={kind:'call',callee:result,args};}else break;}
      return result;
    }
    const precedence={'||':1,'&&':2,'===':3,'!==':3,'==':3,'!=':3,'<=':4,'>=':4,'<':4,'>':4,'+':5,'-':5,'*':6,'/':6,'%':6};
    function parse(minimum=0,depth=0){let left=primary(depth);while(true){space();const operator=['===','!==','<=','>=','==','!=','&&','||','+','-','*','/','%','<','>'].find(value=>source.startsWith(value,position));if(!operator||precedence[operator]<minimum)break;position+=operator.length;left={kind:'binary',operator,left,right:parse(precedence[operator]+1,depth+1)};}if(minimum===0&&take('?')){const yes=parse(0,depth+1);if(!take(':'))throw Error('Conditional colon');left={kind:'conditional',test:left,yes,no:parse(0,depth+1)};}return left;}
    const result=parse();space();if(position!==source.length)throw Error('Unsupported expression at '+position);return result;
  }
  function evaluate(ast,environment,budget={remaining:100000},depth=0){
    if(!ast)return undefined;if(--budget.remaining<0||depth>64)throw Error('Evaluation limit');
    const run=value=>evaluate(value,environment,budget,depth+1);
    if(ast.kind==='literal')return ast.value;
    if(ast.kind==='identifier')return own(environment,ast.name);
    if(ast.kind==='template')return ast.parts.map(part=>String(run(part)??'')).join('').slice(0,1048576);
    if(ast.kind==='array'){const result=[];for(const item of ast.items){if(item.kind==='spread'){const value=run(item.value);if(!Array.isArray(value))throw Error('Array spread only');result.push(...value.slice(0,10000));}else result.push(run(item));if(result.length>10000)throw Error('Array limit');}return result;}
    if(ast.kind==='object'){const result=Object.create(null);for(const [key,value]of ast.entries)result[key]=run(value);return result;}
    if(ast.kind==='member'){const object=run(ast.object),key=run(ast.key);if(key==='length'&&(Array.isArray(object)||typeof object==='string'))return object.length;return own(object,key);}
    if(ast.kind==='lambda')return {dilLambda:ast,environment};
    if(ast.kind==='unary')return ast.operator==='!'?!run(ast.value):-Number(run(ast.value));
    if(ast.kind==='conditional')return run(ast.test)?run(ast.yes):run(ast.no);
    if(ast.kind==='binary'){const left=run(ast.left);if(ast.operator==='&&')return left&&run(ast.right);if(ast.operator==='||')return left||run(ast.right);const right=run(ast.right);switch(ast.operator){case '+':return typeof left==='string'||typeof right==='string'?(String(left??'')+String(right??'')).slice(0,1048576):Number(left)+Number(right);case '-':return Number(left)-Number(right);case '*':return Number(left)*Number(right);case '/':return Number(right)?Number(left)/Number(right):0;case '%':return Number(left)%Number(right);case '===':case '==':return left===right;case '!==':case '!=':return left!==right;case '<':return left<right;case '>':return left>right;case '<=':return left<=right;case '>=':return left>=right;}}
    if(ast.kind==='call'){
      if(ast.callee.kind==='member'){const object=run(ast.callee.object),method=run(ast.callee.key),args=ast.args.map(run);if(method==='includes'&&(Array.isArray(object)||typeof object==='string'))return object.includes(args[0]);if(method==='filter'&&Array.isArray(object)&&args[0]?.dilLambda)return object.filter((item,index)=>invoke(args[0],[item,index],budget,depth+1));if(method==='join'&&Array.isArray(object))return object.join(String(args[0]??',')).slice(0,1048576);throw Error('Unsupported call');}
      throw Error('Unsupported call');
    }
    throw Error('Unsupported expression');
  }
  function invoke(lambda,args,budget={remaining:100000},depth=0){if(!lambda?.dilLambda)throw Error('Expected local lambda');const environment=Object.assign(Object.create(null),lambda.environment);lambda.dilLambda.params.forEach((name,index)=>{if(!forbidden.has(name))environment[name]=args[index];});return evaluate(lambda.dilLambda.body,environment,budget,depth+1);}
  function balanced(source,start){
    const stack=['}'];let quote='',escaped=false;
    for(let position=start+1;position<source.length;position++){const char=source[position];if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';continue;}if('"\'`'.includes(char)){quote=char;continue;}if(char==='{')stack.push('}');else if(char==='[')stack.push(']');else if(char==='(')stack.push(')');else if('}])'.includes(char)){if(stack.pop()!==char)throw Error('Mismatched expression');if(!stack.length)return position+1;}}
    throw Error('Unclosed expression');
  }
  function parse(source,context={}){
    const diagnostics=[],declarations=[],counts=Object.create(null);let position=0,nodes=0,recovered=[];
    if(new TextEncoder().encode(source).length>1048576)return {version:1,nodes:[{kind:'error',detail:'Component source exceeds 1 MiB'}],declarations:[],initial:{},context:{},diagnostics:[diagnostic('source-limit','1 MiB')]};
    const readExpression=text=>{try{return expression(text);}catch(error){diagnostics.push(diagnostic('expression',error.message+': '+text));return {kind:'literal',value:undefined};}};
    const readBrace=()=>{const end=balanced(source,position),text=source.slice(position+1,end-1);position=end;return text;};
    function children(closing='',depth=0){
      if(depth>64)throw Error('Component nesting exceeds 64');const result=[];if(depth===0)recovered=result;let text='',fence=null,inline=0;
      const flush=()=>{if(text){if(closing){const lines=text.split('\n'),indents=lines.filter(line=>line.trim()).map(line=>/^ */.exec(line)[0].length),indent=indents.length?Math.min(...indents):0;if(indent)text=lines.map(line=>line.slice(Math.min(indent,/^ */.exec(line)[0].length))).join('\n');}result.push({kind:'markdown',text});text='';}};
      while(position<source.length){
        if(result.length+declarations.length>10000||nodes>10000)throw Error('Component node limit');
      if(!fence&&!inline&&closing&&source.startsWith(closing,position)){flush();position+=closing.length;return result;}
        if((position===0||source[position-1]==='\n')){const match=/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(source.slice(position));if(match){if(!fence)fence={char:match[1][0],length:match[1].length};else if(fence.char===match[1][0]&&match[1].length>=fence.length)fence=null;text+=match[0];position+=match[0].length;continue;}}
        if(!fence&&source[position]==='`'){const ticks=/^`+/.exec(source.slice(position))[0];if(!inline)inline=ticks.length;else if(inline===ticks.length)inline=0;text+=ticks;position+=ticks.length;continue;}
        if(fence||inline||source[position]==='\\'){text+=source[position++];if(text.endsWith('\\')&&position<source.length)text+=source[position++];continue;}
        if(source.startsWith('{@body',position)){flush();const declaration=readBrace().slice(5).trim(),match=/^const\s+(\[[^\]]+\]|[A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);?$/.exec(declaration);if(!match){diagnostics.push(diagnostic('declaration',declaration));continue;}const state=/^\[\s*([\w$]+)\s*,\s*([\w$]+)\s*\]$/.exec(match[1]),initial=state?/^DIL\.useState\(([\s\S]*)\)$/.exec(match[2]):null;if(state&&!initial){diagnostics.push(diagnostic('state',declaration));continue;}declarations.push({name:state?state[1]:match[1],setter:state?state[2]:'',value:readExpression(initial?initial[1]:match[2])});continue;}
        if(source.startsWith('{#each',position)){flush();const header=readBrace(),match=/^#each\s+([\s\S]+)\s+as\s+([\w$]+)(?:\s*,\s*([\w$]+))?$/.exec(header);if(!match)throw Error('Invalid each header');result.push({kind:'each',value:readExpression(match[1]),item:match[2],index:match[3]||'',children:children('{/each}',depth+1)});continue;}
        const start=/^<([A-Za-z][\w-]*)(?=[\s/>])/.exec(source.slice(position));
        if(start){nodes++;flush();const name=start[1],begin=position;position+=start[0].length;const attrs=Object.create(null);let selfClosing=false;
          while(position<source.length){while(/\s/.test(source[position]||'')&&position<source.length)position++;if(source.startsWith('/>',position)){position+=2;selfClosing=true;break;}if(source[position]==='>'){position++;break;}const attr=/^[\w$-]+/.exec(source.slice(position));if(!attr)throw Error('Invalid '+name+' attribute');position+=attr[0].length;while(/\s/.test(source[position]||'')&&position<source.length)position++;let value={kind:'literal',value:true};if(source[position]==='='){position++;while(/\s/.test(source[position]||'')&&position<source.length)position++;if(source[position]==='{')value=readExpression(readBrace());else if(source[position]==='"'||source[position]==="'"){const quote=source[position++],end=source.indexOf(quote,position);if(end<0)throw Error('Unclosed attribute');value={kind:'literal',value:source.slice(position,end)};position=end+1;}else{const literal=/^[A-Za-z0-9_.:%-]+/.exec(source.slice(position));if(!literal)throw Error('Expected literal attribute');value={kind:'literal',value:literal[0]};position+=literal[0].length;}}if(!forbidden.has(attr[0]))attrs[attr[0]]=value;}
          counts[name]=(counts[name]||0)+1;const nested=selfClosing?[]:children('</'+name+'>',depth+1);result.push(tags.has(name)?{kind:'element',name,attrs,children:nested}:{kind:'error',detail:'Unknown component: '+name,source:source.slice(begin,position).slice(0,8192)});if(!tags.has(name))diagnostics.push(diagnostic('tag',name));continue;
        }
        if(source[position]==='{'&&!source.startsWith('{/',position)){const saved=position;try{const raw=readBrace();const ast=expression(raw);flush();result.push({kind:'expression',value:ast});continue;}catch{position=saved;}}
        text+=source[position++];
      }
      flush();if(closing)throw Error('Missing '+closing);return result;
    }
    let parsed;try{parsed=children();}catch(error){diagnostics.push(diagnostic('parse',error.message+' at '+position+': '+source.slice(position,position+80)));parsed=[...recovered,{kind:'error',detail:error.message,source:source.slice(Math.max(0,position-80),position+8112)}];if(position<source.length)parsed.push({kind:'markdown',text:source.slice(position)});}
    const compact=nodes=>{const output=[];for(const node of nodes){if(node.children)node.children=compact(node.children);const previous=output.at(-1);if(node.kind==='markdown'&&previous?.kind==='markdown'){previous.text+=node.text;delete previous._html;delete previous._inlineHtml;}else output.push(node);}return output;};parsed=compact(parsed);
    const initial=Object.create(null),environment=Object.assign(Object.create(null),context.entities||{}),budget={remaining:100000};
    for(const declaration of declarations){try{const value=evaluate(declaration.value,environment,budget);environment[declaration.name]=value;if(declaration.setter){const exported=own(context.state,declaration.name);initial[declaration.name]=typeof exported===typeof value&&Array.isArray(exported)===Array.isArray(value)?exported:value;environment[declaration.name]=initial[declaration.name];}}catch(error){diagnostics.push(diagnostic('initial',error.message));}}
    return {version:1,nodes:parsed,declarations,initial,context,diagnostics,counts};
  }
  function materialize(program,state=program.initial){
    if(program.snapshot)return {nodes:program.nodes,diagnostics:program.diagnostics||[]};
    const budget={remaining:100000},environment=Object.assign(Object.create(null),program.context.entities||{}),diagnostics=[...program.diagnostics];let iterations=0;
    for(const declaration of program.declarations){try{environment[declaration.name]=declaration.setter?own(state,declaration.name):evaluate(declaration.value,environment,budget);}catch(error){diagnostics.push(diagnostic('evaluation',error.message));}}
    const visit=(nodes,scope,depth=0)=>{if(depth>64)throw Error('Materialization depth');const result=[];for(const node of nodes){if(--budget.remaining<0)throw Error('Evaluation limit');if(node.kind==='each'){const values=evaluate(node.value,scope,budget);if(!Array.isArray(values))throw Error('Each value must be an array');for(const [index,value]of values.entries()){if(++iterations>10000)throw Error('Loop limit');const local=Object.assign(Object.create(null),scope,{[node.item]:value});if(node.index)local[node.index]=index;result.push(...visit(node.children,local,depth+1));}}else if(node.kind==='expression'){result.push({kind:'markdown',text:String(evaluate(node.value,scope,budget)??'')});}else if(node.kind==='element'){const attrs=Object.create(null),events=Object.create(null);for(const [key,value]of Object.entries(node.attrs)){if(key==='onChange'||key==='onClick'){events[key]=value;continue;}if(key.startsWith('on')||key.startsWith('$'))continue;try{attrs[key]=evaluate(value,scope,budget);}catch(error){diagnostics.push(diagnostic('attribute',node.name+'.'+key+': '+error.message));}}const locals=Object.fromEntries(Object.entries(scope).filter(([key])=>!Object.hasOwn(program.context.entities||{},key)));result.push({...node,attrs,events,locals,children:visit(node.children,scope,depth+1)});}else result.push(node);}return result;};
    let nodes;try{nodes=visit(program.nodes,environment);}catch(error){diagnostics.push(diagnostic('evaluation',error.message));nodes=[{kind:'error',detail:error.message}];}if(typeof state?._generatedMessage==='string')nodes.push({kind:'markdown',text:'Local message (not sent):\n\n'+state._generatedMessage.slice(0,1048576)});return {nodes,diagnostics};
  }
  function action(program,event,locals,value,state){
    const environment=Object.assign(Object.create(null),program.context.entities||{},locals,state),setters=new Map(program.declarations.filter(item=>item.setter).map(item=>[item.setter,item.name]));
    if(event?.kind==='identifier'&&setters.has(event.name))return {state:{...state,[setters.get(event.name)]:value}};
    let body=event;if(body?.kind==='lambda'){environment[body.params[0]||'event']=value;body=body.body;}
    if(body?.kind!=='call')throw Error('Unsupported local action');
    if(body.callee.kind==='member'&&body.callee.object.kind==='identifier'&&body.callee.object.name==='GenUI'&&body.callee.key.value==='issueNewTurn')return {message:String(evaluate(body.args[0],environment)??'')};
    if(body.callee.kind==='identifier'&&setters.has(body.callee.name)){const key=setters.get(body.callee.name);let next=evaluate(body.args[0],environment);if(next?.dilLambda)next=invoke(next,[state[key]]);return {state:{...state,[key]:next}};}
    throw Error('Historical action unavailable');
  }
  function summary(nodes,context={}){
    const resolve=id=>context.entities?.[id]||{};
    nodes=nodes.map(node=>node.kind==='legacy'?{kind:'markdown',text:node.text}:node);
    const plain=value=>typeof value==='string'?value:'';
    const lines=nodes.map(node=>{
      if(node.kind==='markdown')return node.text;
      if(node.kind==='error')return '[组件未还原 / Component unavailable: '+node.detail+']';
      if(node.kind!=='element')return '';
      const attrs=node.attrs||{},children=summary(node.children||[],context),reference=resolve(attrs.ref),entity=reference.entity||reference;
      const url=value=>{try{const parsed=new URL(value);return /^https?:$/.test(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.href:'';}catch{return '';}};
      const linked=(title,value)=>{const href=url(value);return href?'['+String(title).replace(/[\[\]\\]/g,'\\$&')+'](<'+href.replace(/[<>]/g,encodeURIComponent)+'>)':String(title);};
      switch(node.name){
        case 'Entity':return plain(attrs.value)||plain(entity.name||entity.title)||plain(attrs.ref);
        case 'Cite':return (attrs.refs||[]).map(id=>{const item=resolve(id);return linked(item.title||item.name||id,item.url||item.website_url||item.entity?.website_url);}).join(' ');
        case 'Link':return linked(attrs.title||entity.title||entity.name||attrs.url||attrs.ref||children,attrs.url||entity.url||entity.website_url);
        case 'Rating':return 'Rating: '+String(attrs.data?.value??attrs.data?.rating??attrs.data??entity.rating??'')+(entity.rating_scale?' / '+entity.rating_scale:'');
        case 'AsyncImage':case 'AsyncImageGroup':return (Array.isArray(attrs.query)?attrs.query:[attrs.query]).filter(value=>typeof value==='string').join('\n');
        case 'MapWidgetV2':return plain(attrs.title)+'\n'+(attrs.points||[]).map(point=>{const resolved={...resolve(point.ref),...point};return plain(resolved.name||resolved.ref)+' '+plain(resolved.address);}).join('\n')+'\n'+(attrs.groups||[]).map(group=>plain(group.title)+'\n'+(group.locations||[]).map(location=>plain(location.notes||location.point_id)).join('\n')).join('\n');
        case 'ReservationTimePillsRefWidget':return (entity.name||attrs.ref)+' · Historical reservation snapshot\n'+(entity.reservations||entity.reservation_providers||[]).map(item=>[item.date,item.time,item.party_size,...(item.availability_data?.times||[]),item.availability_data?.party_size,linked(item.provider_name||item.provider||'Reservation',item.provider_reservation_url||item.url||item.booking_url)].filter(value=>value!=null).join(' · ')).join('\n');
        case 'Chart':{const content=attrs.content||{};return plain(content.meta?.title)+'\n'+plain(content.meta?.description)+'\n'+[content.xKey,...(content.series||[]).map(item=>item.label||item.dataKey)].join(' | ')+'\n'+(content.data||[]).map(row=>Object.values(row).join(' | ')).join('\n');}
        case 'input':return String(attrs.value??'');
        case 'radio-group':return children+'\nSelected: '+String(attrs.value??'');
        case 'checkbox':return (attrs.checked?'[x] ':'[ ] ')+children;
        default:return children;
      }
    });
    return lines.join('\n');
  }
  return {parse,expression,evaluate,materialize,action,summary,tags:[...tags]};
}
