import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Download,ExternalLink} from 'lucide-react';
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
      <div className="installBrand"><BrandLogo/></div>
      <h1>Instalar a app</h1>
      <p className="installLead">O teu treino à distância de um toque.</p>

      {installed?<div className="installSuccess" role="status"><CheckCircle2/><div><b>App instalada</b><span>Abre-a no ecrã principal.</span></div></div>:
      platform==='ios'?<div className="installInstructions iosInstructions">
        <h2>No iPhone ou iPad</h2>
        <ol className="installSteps">
          <li>Toca em <b>Partilhar</b> no navegador.</li>
          <li>Escolhe <b>Adicionar ao ecrã principal</b>.</li>
          <li>Confirma em <b>Adicionar</b>.</li>
        </ol>
      </div>:
      <div className="installInstructions">
        {installPrompt&&<button className="installPrimary" onClick={install} disabled={installing}><Download/>{installing?'A abrir…':'Instalar app'}</button>}
        {!installPrompt&&<>
          <h2>{platform==='android'?'No Android':'No navegador'}</h2>
          <ol className="installSteps">
            <li>Abre o <b>menu do navegador</b>.</li>
            <li>Escolhe <b>Instalar app</b> ou <b>Adicionar ao ecrã principal</b>.</li>
            <li>Confirma a instalação.</li>
          </ol>
        </>}
      </div>}

      {message&&<div className="installMessage" role="status">{message}</div>}
      <a className="installOpenApp" href="/inicio"><ExternalLink/>Abrir app</a>
      <p className="installFootnote">Sem App Store ou Google Play.</p>
    </section>
  </main>;
}
