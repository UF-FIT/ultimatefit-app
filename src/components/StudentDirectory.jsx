import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Apple, Archive, ArrowLeft, CalendarDays, Camera, Check, CheckCircle2, ChevronRight, Dumbbell, Edit3, ExternalLink, FileText, Mail, MessageCircle, MoreVertical, Plus, Power, RefreshCw, Search, Send, Target, Trash2, UserRound, Users, X, Flag } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../contexts/AppContext';
import ParqStatusCard from './ParqStatusCard';
import TrainingActivityCalendar from './TrainingActivityCalendar';
import { buildStudentAccessMessage, fetchAvailableTrainers, invokeStudentAction, sexOptions, studentStatusLabels, trackingTypeOptions, uploadStudentAvatar, whatsappUrl } from '../lib/students';
import { fetchChallenges } from '../lib/challenges';
import { recordWorkoutCompletion } from '../lib/training';
import { downloadAssessmentPdf } from '../lib/assessmentPdf';

// NOTE: source restored from previous blob in follow-up commit.
