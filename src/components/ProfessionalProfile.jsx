import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, ExternalLink, Eye, EyeOff,
  KeyRound, Save, ShieldCheck, UserRound,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchProfessionalProfile, socialDisplay, updateProfessionalProfile,
  uploadProfessionalAvatar,
} from '../lib/professional';

function initials(name) {
  return String(name || 'UF').split(' ').filter(Boolean).map(item => item[0]).slice(0, 2).join('').toUpperCase();
}

export default function ProfessionalProfile() {
  const { currentUser } = useApp();
  const { refreshProfile, changeOwnPassword } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try { setProfile(await fetchProfessionalProfile(currentUser.id)); }
    catch (err) { setError(err.message || 'Não foi possível carregar o perfil profissional.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [currentUser.id]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);setError('');setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      await updateProfessionalProfile({
        profileId: profile.id,
        trainerProfileId: profile.trainerProfileId,
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        whatsappPhone: form.get('whatsappPhone'),
        professionalTitle: form.get('professionalTitle'),
        biography: form.get('biography'),
        socialUrl: form.get('socialUrl'),
      });
      if (photo) await uploadProfessionalAvatar(profile.id, photo);
      await refreshProfile();
      await load();
      setPhoto(null);
      setNotice('Perfil profissional atualizado.');
    } catch (err) { setError(err.message || 'Não foi possível guardar o perfil.'); }
    finally { setSaving(false); }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordSaving(true);setError('');setNotice('');
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (newPassword.length < 8) {
      setError('A nova palavra-passe deve ter pelo menos 8 caracteres.');
      setPasswordSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova palavra-passe não coincide.');
      setPasswordSaving(false);
      return;
    }
    try {
      const { error: passwordError } = await changeOwnPassword(currentPassword, newPassword);
      if (passwordError) throw passwordError;
      event.currentTarget.reset();
      setNotice('Palavra-passe alterada com sucesso.');
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'A palavra-passe atual está incorreta.'
        : err.message || 'Não foi possível alterar a palavra-passe.');
    } finally { setPasswordSaving(false); }
  }

  if (loading) return <div className="card pad profileLoading">A carregar o perfil profissional…</div>;
  if (!profile) return <div className="errorBanner"><AlertTriangle size={18}/>{error || 'Perfil profissional indisponível.'}</div>;

  return <div className="professionalProfilePage">
    <div className="heading"><div><h1>O meu perfil</h1><p>Informação profissional visível aos alunos que te estão atribuídos.</p></div></div>
    {notice && <div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    {error && <div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}

    <section className="professionalHero card">
      <div className="professionalAvatar">
        {profile.photoUrl || profile.thumbUrl
          ? <img src={profile.photoUrl || profile.thumbUrl} alt={profile.full_name}/>
          : <span>{initials(profile.full_name)}</span>}
      </div>
      <div className="professionalHeroText">
        <span className="eyebrow">PERFIL PROFISSIONAL</span>
        <h2>{profile.full_name}</h2>
        <p>{profile.professionalTitle} · {currentUser.roleLabel}</p>
        <div className="professionalLinks">
          <span><ShieldCheck size={15}/>WhatsApp obrigatório</span>
          {profile.socialUrl && <a href={profile.socialUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{socialDisplay(profile.socialUrl)}</a>}
        </div>
      </div>
    </section>

    <div className="grid two professionalProfileGrid">
      <form className="card pad professionalForm" onSubmit={saveProfile}>
        <div className="panelTitle"><div><h2>Dados profissionais</h2><p>Estes dados ajudam o aluno a identificar e contactar o professor.</p></div><UserRound size={24}/></div>
        <label className="professionalPhotoPicker"><Camera size={20}/><div><b>Fotografia de perfil</b><small>JPG, PNG ou WebP. Será convertida automaticamente para um ficheiro leve.</small></div><input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0] || null)}/></label>
        <div className="formGrid twoCols">
          <label>Nome *<input name="firstName" defaultValue={profile.firstName} required/></label>
          <label>Apelido *<input name="lastName" defaultValue={profile.lastName} required/></label>
          <label>Email<input value={profile.email} readOnly/></label>
          <label>Função<input value={currentUser.roleLabel} readOnly/></label>
          <label>WhatsApp profissional *<input name="whatsappPhone" defaultValue={profile.whatsappPhone} inputMode="tel" required/></label>
          <label>Título profissional<input name="professionalTitle" defaultValue={profile.professionalTitle}/></label>
          <label className="wide">Página de rede social / Instagram<input name="socialUrl" defaultValue={profile.socialUrl} placeholder="https://instagram.com/teu_perfil ou @teu_perfil"/></label>
          <label className="wide">Apresentação profissional<textarea name="biography" defaultValue={profile.biography} rows="4" placeholder="Pequena apresentação opcional para os alunos."/></label>
        </div>
        <button className="primary profileSaveButton" disabled={saving}><Save size={17}/>{saving ? 'A guardar…' : 'Guardar perfil'}</button>
      </form>

      <form className="card pad passwordProfileForm" onSubmit={savePassword}>
        <div className="panelTitle"><div><h2>Segurança</h2><p>Altera a palavra-passe sem sair da aplicação.</p></div><KeyRound size={24}/></div>
        <div className="passwordFields">
          <label>Palavra-passe atual<input name="currentPassword" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required/></label>
          <label>Nova palavra-passe<input name="newPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength="8" required/></label>
          <label>Confirmar nova palavra-passe<input name="confirmPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength="8" required/></label>
        </div>
        <button type="button" className="textButton showPasswordButton" onClick={() => setShowPasswords(value => !value)}>{showPasswords ? <EyeOff size={16}/> : <Eye size={16}/>} {showPasswords ? 'Ocultar palavras-passe' : 'Mostrar palavras-passe'}</button>
        <div className="passwordSecurityNote"><ShieldCheck size={18}/><p>A palavra-passe atual é confirmada antes da alteração. As outras sessões ativas serão encerradas sempre que possível.</p></div>
        <button className="secondary full" disabled={passwordSaving}>{passwordSaving ? 'A alterar…' : 'Alterar palavra-passe'}</button>
      </form>
    </div>
  </div>;
}
