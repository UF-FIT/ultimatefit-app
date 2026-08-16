import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Download,ExternalLink,PlusSquare,Share2,Smartphone} from 'lucide-react';
import BrandLogo from './BrandLogo';

function detectPlatform(){
  if(typeof navigator==='undefined') return 'other';
  const ua=navigator.userAgent||'';
  const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios) return 'ios';
  if(/Android/i.test(ua)) return 'android';
  return 'other';
}

function isStandalone(){
  if(typeof window==='undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches===true||window.navigator?.standalone===true;
}

export default function InstallAppPage(){
  const platform=useMemo(detectPlatform,[]);
  const [installPrompt,setInstallPrompt]=useState(null);
  const [installed,setInstalled]=useState(isStandalone());
  const [installing,setInstalling]=useState(false);
  const [message,setMessage]=useState('');

  useEffect(()=>{
    const onPrompt=event=>{
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled=()=>{
      setInstalled(true);
      setInstallPrompt(null);
      setMessage('ULTIMATE FIT instalada com sucesso.');
    };
    window.addEventListener('beforeinstallprompt',onPrompt);
    window.addEventListener('appinstalled',onInstalled);
    return()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt);
      window.removeEventListener('appinstalled',onInstalled);
    };
  },[]);

  async function install(){
    if(!installPrompt) return;
    setInstalling(true);setMessage('');
    try{
      await installPrompt.prompt();
      const choice=await installPrompt.userChoice;
      if(choice?.outcome==='accepted') setMessage('Instalação iniciada.');
      setInstallPrompt(null);
    }catch{
      setMessage('Não foi possível abrir o instalador. Usa as instruções abaixo.');
    }finally{setInstalling(false)}
  }

  return <main className="installAppPage">
    <section className="installAppCard">
      <div className="installBrand"><BrandLogo/><span>APP</span></div>
      <div className="installIcon"><Smartphone/></div>
      <span className="installEyebrow">ULTIMATE FIT NO TEU TELEMÓVEL</span>
      <h1>Instala a ULTIMATE FIT</h1>
      <p className="installLead">Acesso rápido ao teu treino, avaliações, atividades e desafios diretamente a partir do ecrã principal.</p>

      {installed?<div className="installSuccess"><CheckCircle2/><div><b>A ULTIMATE FIT já está instalada</b><span>Podes abrir a app a partir do teu ecrã principal.</span></div></div>:
      platform==='ios'?<div className="installInstructions iosInstructions">
        <h2>Instalar no iPhone</h2>
        <div className="installStep"><span>1</span><Share2/><div><b>Carrega em Partilhar</b><small>Usa o botão de partilha do navegador.</small></div></div>
        <div className="installStep"><span>2</span><PlusSquare/><div><b>Adicionar ao ecrã principal</b><small>Escolhe esta opção no menu.</small></div></div>
        <div className="installStep"><span>3</span><CheckCircle2/><div><b>Carrega em Adicionar</b><small>O ícone ULTIMATE FIT ficará no teu iPhone.</small></div></div>
      </div>:
      <div className="installInstructions">
        {installPrompt&&<button className="installPrimary" onClick={install} disabled={installing}><Download/>{installing?'A abrir instalador…':'Instalar ULTIMATE FIT'}</button>}
        {!installPrompt&&<>
          <h2>Instalar a aplicação</h2>
          <div className="installStep"><span>1</span><Download/><div><b>Abre o menu do navegador</b><small>No Chrome procura “Instalar app” ou “Adicionar ao ecrã principal”.</small></div></div>
          <div className="installStep"><span>2</span><CheckCircle2/><div><b>Confirma a instalação</b><small>A ULTIMATE FIT passa a aparecer como uma app.</small></div></div>
        </>}
      </div>}

      {message&&<div className="installMessage">{message}</div>}
      <a className="installOpenApp" href="/inicio"><ExternalLink/>Abrir ULTIMATE FIT</a>
      <p className="installFootnote">Não precisas de descarregar nada da App Store ou Google Play.</p>
    </section>
  </main>;
}
