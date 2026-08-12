import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, ExternalLink, Eye, EyeOff,
  KeyRound, Save, ShieldCheck, UserRound, X,
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

function ReadField({ label, value, wide = false, children }) {
  return <div className={`professional