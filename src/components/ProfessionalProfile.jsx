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
import '../styles/professional-profile-view.css';

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
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setProfile(await fetchProfessionalProfile(currentUser.id));
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o perfil profissional.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [currentUser.id]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
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
      setEditingProfile(false);
      setNotice('Perfil profissional atualizado.');
    } catch (err) {
      setError(err.message || 'Não foi possível guardar o perfil.');
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordSaving(true);
    setError('');
    setNotice('');
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
      const result = await changeOwnPassword(currentPassword, newPassword);
      if (result?.error) throw result.error;
      event.currentTarget.reset();
      setShowPasswords(false);
      setEditingPassword(false);
      setNotice('Palavra-passe alterada com sucesso.');
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'A palavra-passe atual está incorreta.'
        : err.message || 'Não foi possível alterar a palavra-passe.');
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return <div className="card pad profileLoading">A carregar o perfil profissional…</div>;
  }

  if (!profile) {
    return <div className="errorBanner"><AlertTriangle size={18}/>{error || 'Perfil profissional indisponível.'}</div>;
  }

  return (
    <div className="professionalProfilePage">
      <div className="heading">
        <div>
          <h1>O meu perfil</h1>
          <p>Informação profissional visível aos alunos que te estão atribuídos.</p>
        </div>
      </div>

      {notice ? <div className="successBanner"><CheckCircle2 size={18}/>{notice}</div> : null}
      {error ? <div className="errorBanner"><AlertTriangle size={18}/>{error}</div> : null}

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
            {profile.socialUrl ? (
              <a href={profile.socialUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15}/>{socialDisplay(profile.socialUrl)}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid two professionalProfileGrid">
        {editingProfile ? (
          <form className="card pad professionalForm" onSubmit={saveProfile}>
            <div className="panelTitle">
              <div><h2>Editar dados profissionais</h2><p>Altera apenas os dados que pretendes atualizar.</p></div>
              <UserRound size={24}/>
            </div>

            <label className="professionalPhotoPicker">
              <Camera size={20}/>
              <div>
                <b>Fotografia de perfil</b>
                <small>JPG, PNG ou WebP. Será convertida automaticamente para um ficheiro leve.</small>
              </div>
              <input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0] || null)}/>
            </label>

            <div className="formGrid twoCols">
              <label>Nome *<input name="firstName" defaultValue={profile.firstName} required/></label>
              <label>Apelido *<input name="lastName" defaultValue={profile.lastName} required/></label>
              <label>Email<input value={profile.email} readOnly/></label>
              <label>Função<input value={currentUser.roleLabel} readOnly/></label>
              <label>WhatsApp profissional *<input name="whatsappPhone" defaultValue={profile.whatsappPhone} inputMode="tel" required/></label>
              <label>Título profissional<input name="professionalTitle" defaultValue={profile.professionalTitle}/></label>
              <label className="wide">Página de rede social / Instagram<input name="socialUrl" defaultValue={profile.socialUrl}/></label>
              <label className="wide">Apresentação profissional<textarea name="biography" defaultValue={profile.biography} rows="4"/></label>
            </div>

            <div className="professionalEditActions">
              <button type="button" className="secondary" onClick={() => { setEditingProfile(false); setPhoto(null); }}>Cancelar</button>
              <button className="primary" disabled={saving}><Save size={17}/>{saving ? 'A guardar…' : 'Guardar alterações'}</button>
            </div>
          </form>
        ) : (
          <section className="card pad professionalReadCard">
            <div className="professionalReadHeader">
              <div className="panelTitle">
                <div><h2>Dados profissionais</h2><p>Consulta os dados do teu perfil profissional.</p></div>
                <UserRound size={24}/>
              </div>
              <button type="button" className="secondary" onClick={() => setEditingProfile(true)}>Editar perfil</button>
            </div>

            <div className="professionalReadGrid">
              <div className="professionalReadField"><span>Nome</span><b>{profile.firstName || '—'}</b></div>
              <div className="professionalReadField"><span>Apelido</span><b>{profile.lastName || '—'}</b></div>
              <div className="professionalReadField"><span>Email</span><b>{profile.email || '—'}</b></div>
              <div className="professionalReadField"><span>Função</span><b>{currentUser.roleLabel || '—'}</b></div>
              <div className="professionalReadField"><span>WhatsApp profissional</span><b>{profile.whatsappPhone || '—'}</b></div>
              <div className="professionalReadField"><span>Título profissional</span><b>{profile.professionalTitle || '—'}</b></div>
              <div className="professionalReadField wide">
                <span>Rede social / Instagram</span>
                {profile.socialUrl ? <a href={profile.socialUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{socialDisplay(profile.socialUrl)}</a> : <b>—</b>}
              </div>
              <div className="professionalReadField wide"><span>Apresentação profissional</span><b>{profile.biography || '—'}</b></div>
            </div>
          </section>
        )}

        {editingPassword ? (
          <form className="card pad passwordProfileForm" onSubmit={savePassword}>
            <div className="panelTitle">
              <div><h2>Alterar palavra-passe</h2><p>Confirma a palavra-passe atual e define uma nova.</p></div>
              <KeyRound size={24}/>
            </div>

            <div className="passwordFields">
              <label>Palavra-passe atual<input name="currentPassword" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required/></label>
              <label>Nova palavra-passe<input name="newPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength="8" required/></label>
              <label>Confirmar nova palavra-passe<input name="confirmPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength="8" required/></label>
            </div>

            <button type="button" className="textButton showPasswordButton" onClick={() => setShowPasswords(value => !value)}>
              {showPasswords ? <EyeOff size={16}/> : <Eye size={16}/>} {showPasswords ? 'Ocultar palavras-passe' : 'Mostrar palavras-passe'}
            </button>

            <div className="passwordSecurityNote">
              <ShieldCheck size={18}/>
              <p>A palavra-passe atual é confirmada antes da alteração.</p>
            </div>

            <div className="professionalEditActions">
              <button type="button" className="secondary" onClick={() => { setEditingPassword(false); setShowPasswords(false); }}>Cancelar</button>
              <button className="primary" disabled={passwordSaving}>{passwordSaving ? 'A alterar…' : 'Guardar nova palavra-passe'}</button>
            </div>
          </form>
        ) : (
          <section className="card pad securityReadCard">
            <div className="securityReadHeader">
              <div className="panelTitle">
                <div><h2>Segurança</h2><p>Consulta o estado de segurança da tua conta.</p></div>
                <KeyRound size={24}/>
              </div>
              <button type="button" className="secondary" onClick={() => setEditingPassword(true)}>Alterar palavra-passe</button>
            </div>

            <div className="securityReadState">
              <div className="securityReadIcon"><ShieldCheck/></div>
              <div>
                <b>Palavra-passe configurada</b>
                <p>Por segurança, a palavra-passe nunca é mostrada nesta página.</p>
              </div>
            </div>

            <div className="securityReadInfo">
              <span>Proteção da conta</span>
              <b>Ativa</b>
              <small>A palavra-passe atual só é solicitada quando pretendes alterá-la.</small>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
