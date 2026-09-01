import React from 'react';
import {createRoot} from 'react-dom/client';
import {Mail} from 'lucide-react';
import EmailCommunicationsModule from '../components/EmailCommunicationsModule';

let root=null;
let host=null;
let scheduled=false;
let active=false;
let installed=false;

function communicationsPath(){return window.location.pathname.toLowerCase().replace(/\/+$/,'')==='/backoffice/comunicacoes'}
function setUrl(isActive){const target=isActive?'/backoffice/comunicacoes':'/backoffice/definicoes';if(window.location.pathname!==target)window.history.pushState({},'',target)}
function deactivate(page,button){active=false;page?.removeAttribute('data-email-communications-active');button?.classList.remove('active');if(host)host.hidden=true}
function activate(page,button,{updateUrl=true}={}){active=true;page?.setAttribute('data-email-communications-active','true');button?.classList.add('active');if(host)host.hidden=false;if(updateUrl)setUrl(true)}
function ensureHost(page,tabs){
 if(!host||!host.isConnected){host=document.createElement('div');host.dataset.emailCommunicationsHost='true';tabs.insertAdjacentElement('afterend',host);root=createRoot(host);root.render(<EmailCommunicationsModule/>)}
 return host;
}
function enhance(){
 const page=document.querySelector('.backofficePage');
 const tabs=page?.querySelector('.backofficeTabs');
 if(!page||!tabs)return;
 let button=tabs.querySelector('[data-email-communications-tab]');
 if(!button){button=document.createElement('button');button.type='button';button.dataset.emailCommunicationsTab='true';button.innerHTML='<span data-email-icon></span><span>Comunicações</span>';const iconTarget=button.querySelector('[data-email-icon]');if(iconTarget){const iconRoot=createRoot(iconTarget);iconRoot.render(<Mail size={16}/>)}button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();ensureHost(page,tabs);activate(page,button)});tabs.appendChild(button)}
 ensureHost(page,tabs);
 [...tabs.querySelectorAll('button')].filter(item=>item!==button).forEach(nativeButton=>{if(nativeButton.dataset.emailCommsBound)return;nativeButton.dataset.emailCommsBound='true';nativeButton.addEventListener('click',()=>{deactivate(page,button)})});
 if(communicationsPath()){activate(page,button,{updateUrl:false})}else if(!active){deactivate(page,button)}
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance()})}
export function startBackofficeEmailCommunicationsEnhancer(){
 if(installed)return;installed=true;
 const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
 window.addEventListener('popstate',()=>{active=communicationsPath();schedule()});
 schedule();
}
