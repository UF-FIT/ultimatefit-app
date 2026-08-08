import React,{useEffect,useRef,useState} from 'react';
import {Image as ImageIcon,Trash2,Upload} from 'lucide-react';

export default function CommunityImageField({label='Imagem/cartaz',existingUrl='',value,onChange}){
  const inputRef=useRef(null);
  const [preview,setPreview]=useState(existingUrl||'');

  useEffect(()=>{
    if(!value?.file){setPreview(value?.removeExisting?'':existingUrl||'')}
  },[existingUrl,value?.removeExisting]);

  function choose(file){
    if(!file)return;
    if(!file.type?.startsWith('image/'))return;
    const objectUrl=URL.createObjectURL(file);
    setPreview(prev=>{if(prev?.startsWith('blob:'))URL.revokeObjectURL(prev);return objectUrl});
    onChange?.({file,zoom:1,positionX:.5,positionY:.5,removeExisting:false});
  }
  function patch(next){onChange?.({...value,...next})}
  function remove(){
    setPreview(prev=>{if(prev?.startsWith('blob:'))URL.revokeObjectURL(prev);return ''});
    if(inputRef.current)inputRef.current.value='';
    onChange?.({file:null,zoom:1,positionX:.5,positionY:.5,removeExisting:Boolean(existingUrl)});
  }
  const zoom=Number(value?.zoom??1),x=Number(value?.positionX??.5),y=Number(value?.positionY??.5);
  const transform=`scale(${zoom}) translate(${(0.5-x)*22}%, ${(0.5-y)*22}%)`;
  return <div className="communityImageField wide">
    <div className="communityImageLabel"><div><b>{label}</b><small>Upload JPG/PNG/HEIC/WebP. A app converte automaticamente para WebP 1080 × 1350 (4:5) e comprime para navegação rápida.</small></div></div>
    <div className="communityImageEditor">
      <div className="communityImagePreview">
        {preview?<img src={preview} alt="Pré-visualização" style={{objectPosition:`${x*100}% ${y*100}%`,transform}}/>:<div className="communityImageEmpty"><ImageIcon/><span>Pré-visualização 4:5</span></div>}
      </div>
      <div className="communityImageControls">
        <input ref={inputRef} hidden type="file" accept="image/*" onChange={e=>choose(e.target.files?.[0])}/>
        <button type="button" className="secondary" onClick={()=>inputRef.current?.click()}><Upload size={16}/>{preview?'Substituir imagem':'Escolher imagem'}</button>
        {preview&&<button type="button" className="secondary dangerText" onClick={remove}><Trash2 size={16}/>Remover</button>}
        {value?.file&&<>
          <label>Zoom <input type="range" min="1" max="2" step="0.02" value={zoom} onChange={e=>patch({zoom:Number(e.target.value)})}/></label>
          <label>Posição horizontal <input type="range" min="0" max="1" step="0.01" value={x} onChange={e=>patch({positionX:Number(e.target.value)})}/></label>
          <label>Posição vertical <input type="range" min="0" max="1" step="0.01" value={y} onChange={e=>patch({positionY:Number(e.target.value)})}/></label>
          <small>A pré-visualização mostra o enquadramento. Usa zoom e posição para ajustar cartazes muito grandes, pequenos ou com conteúdo importante junto às margens.</small>
        </>}
      </div>
    </div>
  </div>
}
