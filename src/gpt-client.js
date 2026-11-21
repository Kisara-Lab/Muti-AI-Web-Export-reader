function gptLabel(zh,en){return currentLang==='en'?en:zh;}
document.getElementById('source-platform').addEventListener('change',()=>renderConvList(getSortedConvs()));
const gptComponentStates=new Map();let gptComponentGeneration=-1;
function gptComponentState(key){
  if(gptComponentGeneration!==dataWorkerGeneration){gptComponentStates.clear();gptComponentGeneration=dataWorkerGeneration;}
  const state=gptComponentStates.get(key)||{index:0};gptComponentStates.delete(key);gptComponentStates.set(key,state);while(gptComponentStates.size>32)gptComponentStates.delete(gptComponentStates.keys().next().value);return state;
}
function renderGptViews(block,location=''){
  if(!Array.isArray(block.gptViews))return '';
  const host=document.createElement('div');host.className='gpt-components';
  const add=(parent,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=String(text);parent.append(element);return element;};
  for(const [position,view]of block.gptViews.slice(0,256).entries()){
    const card=add(host,'section');card.className='attachment-block';card.style.display='block';add(card,'strong',view.title||gptLabel('组件','Component'));
    if(view.description)add(card,'p',view.description);
    if(view.url){const url=gptExportCore().safeUrl(view.url);if(url){const anchor=add(card,'a',gptLabel('外部链接','External link'));anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.referrerPolicy='no-referrer';}}
    if(view.kind==='images'){const gallery=add(card,'div'),key=JSON.stringify([dataWorkerGeneration,currentConv?.uuid,location,position]),state=gptComponentState(key);gallery.dataset.gptGallery=key;for(const [index,image]of (view.images||[]).entries()){const row=add(gallery,'p',gptLabel('远程图片未加载：','Remote image not loaded: ')+image.title);row.hidden=index!==state.index;const url=gptExportCore().safeUrl(image.url);if(url){const anchor=add(row,'a',gptLabel('打开链接','Open link'));anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.referrerPolicy='no-referrer';}}if((view.images||[]).length>1){for(const [direction,label]of [[-1,gptLabel('上一张','Previous')],[1,gptLabel('下一张','Next')]]){const button=add(gallery,'button',label);button.type='button';button.dataset.gptGalleryStep=String(direction);}}}
    if(view.kind==='map'){
      const points=(view.points||[]).filter(point=>Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&Math.abs(point.latitude)<=90&&Math.abs(point.longitude)<=180),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 360 180');svg.setAttribute('role','img');svg.setAttribute('aria-label',gptLabel('坐标分布图','Coordinate plot'));
      if(points.length){const latitudes=points.map(point=>point.latitude),longitudes=points.map(point=>point.longitude),minLat=Math.min(...latitudes),maxLat=Math.max(...latitudes),minLon=Math.min(...longitudes),maxLon=Math.max(...longitudes);for(const [index,point]of points.entries()){const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',String(15+330*(point.longitude-minLon)/(maxLon-minLon||1)));circle.setAttribute('cy',String(165-150*(point.latitude-minLat)/(maxLat-minLat||1)));circle.setAttribute('r','5');circle.setAttribute('fill','currentColor');const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=(index+1)+'. '+point.title;circle.append(title);svg.append(circle);}card.append(svg);}
    }
    if(view.kind==='disabled'){for(const label of view.buttons||[]){const button=add(card,'button',label);button.type='button';button.disabled=true;}add(card,'p',gptLabel('历史记录中不可执行','Unavailable in history'));}
    if(view.kind==='file'){
      const resource=findGptResource(view.fileId);if(resource){const button=add(card,'button',gptLabel('本地附件','Local attachment'));button.type='button';button.dataset.gptResource=resource.path;}else add(card,'p',gptLabel('附件未包含在导出中','Attachment not included in export'));
    }
    if(view.details){const details=add(card,'details');add(details,'summary',gptLabel('查看导出信息','View exported data'));add(details,'pre',view.details);}
  }
  return host.outerHTML;
}
function findGptResource(fileId){return (exportSession.resources||[]).find(resource=>resource.packageId===currentConv?._sourcePackage&&(resource.fileId===fileId||resource.path===fileId));}
document.addEventListener('click',async event=>{
  const galleryButton=event.target.closest('[data-gpt-gallery-step]');if(galleryButton){const gallery=galleryButton.closest('[data-gpt-gallery]'),rows=[...gallery.querySelectorAll('p')],current=rows.findIndex(row=>!row.hidden),next=(current+Number(galleryButton.dataset.gptGalleryStep)+rows.length)%rows.length;gptComponentState(gallery.dataset.gptGallery).index=next;rows.forEach((row,index)=>{row.hidden=index!==next;});return;}
  const button=event.target.closest('[data-gpt-resource]');if(!button)return;
  const resource=findGptResource(button.dataset.gptResource),generation=dataWorkerGeneration,uuid=currentConv?.uuid;if(!resource)return;button.disabled=true;
  try{const {blob}=await featureRequest('import','resource',resource);if(generation!==dataWorkerGeneration||uuid!==currentConv?.uuid||!button.isConnected)return;
    if(resource.mime==='text/markdown'||resource.mime==='text/plain'){
      const preview=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre');summary.textContent=resource.name;body.textContent=await blob.slice(0,1024*1024).text();if(generation!==dataWorkerGeneration||uuid!==currentConv?.uuid||!button.isConnected)return;preview.append(summary,body);preview.open=true;button.after(preview);
    }
    downloadBlob(blob,resource.name);
  }catch(error){if(error.name!=='AbortError')button.title=error.message;}finally{button.disabled=false;}
});
