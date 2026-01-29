import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import {
  Sparkles, Mic, History, Key, Shield, Search, Download, Play, Pause,
  RefreshCw, Loader2, Check, AlertCircle, X, Plus, Minus, Trash2, Eye, EyeOff,
  Copy, ChevronDown, ChevronLeft, ChevronRight, Users, BarChart3, Zap, Clock, Menu,
  Crown, Edit, Activity, User, LogOut, CreditCard, Rocket, Package, Headphones,
  Volume2, Lock, Library, Filter, Globe, Heart, Star, SlidersHorizontal, DollarSign, Image
} from 'lucide-react';

const API_BASE = '';

// API Client
const api = {
  token: localStorage.getItem('ff_token'),
  adminToken: localStorage.getItem('ff_admin_token'),
  
  setToken(token) {
    this.token = token;
    token ? localStorage.setItem('ff_token', token) : localStorage.removeItem('ff_token');
  },
  
  setAdminToken(token) {
    this.adminToken = token;
    token ? localStorage.setItem('ff_admin_token', token) : localStorage.removeItem('ff_admin_token');
  },
  
  async request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (options.admin && this.adminToken) headers['X-Admin-Token'] = this.adminToken;
    
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = { detail: raw || response.statusText || 'Request failed' };
    }
    if (!response.ok) throw new Error(data?.detail || data?.error || response.statusText || 'Request failed');
    return data;
  }
};

function getVoiceStreamUrl(taskId) {
  const t = api.token || '';
  return `${API_BASE}/api/voice/download/${taskId}?token=${encodeURIComponent(t)}`;
}

const PENDING_IMAGE_IDS_KEY = 'ff_image_pending_task_ids';
function getPendingImageTaskIds() {
  try {
    const r = JSON.parse(localStorage.getItem(PENDING_IMAGE_IDS_KEY) || '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}
function setPendingImageTaskIds(ids) {
  try {
    localStorage.setItem(PENDING_IMAGE_IDS_KEY, JSON.stringify([...new Set(ids)]));
  } catch (_) {}
}
function addPendingImageTaskIds(ids) {
  const prev = getPendingImageTaskIds();
  setPendingImageTaskIds([...new Set([...prev, ...ids])]);
}
function removePendingImageTaskIds(ids) {
  const prev = getPendingImageTaskIds();
  const s = new Set(ids);
  setPendingImageTaskIds(prev.filter((id) => !s.has(id)));
}

// Toast - positioned at bottom right
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const configs = {
    success: { bg: 'bg-emerald-500', icon: Check },
    error: { bg: 'bg-red-500', icon: AlertCircle },
    info: { bg: 'bg-blue-500', icon: AlertCircle },
    warning: { bg: 'bg-amber-500', icon: AlertCircle }
  };
  const config = configs[type] || configs.info;
  const Icon = config.icon;
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${config.bg} text-white shadow-lg shadow-black/10`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-medium">{message}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Button
function Button({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) {
  const variants = {
    primary: 'bg-black text-white hover:bg-gray-800',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-200',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100',
    danger: 'bg-red-500 text-white hover:bg-red-600'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// Input
function Input({ label, error, className = '', ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <input className={`w-full px-3 py-2.5 border rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 ${error ? 'border-red-300' : 'border-gray-200'} ${className}`} {...props} />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

// Card
function Card({ children, className = '', ...props }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`} {...props}>{children}</div>;
}

// Modal
function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Tabs
function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
      {tabs.map(tab => (
        <button key={tab.value} onClick={() => onChange(tab.value)}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${value === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Image Preview Modal — fullscreen-style overlay for viewing generated images
// Supports: (1) single job: src, prompt, allImages; (2) library mode: items[], currentIndex, onChangeIndex
function ImagePreviewModal({ open, onClose, src, prompt, allImages = [], items: libraryItems, currentIndex, onChangeIndex }) {
  const [withinIndex, setWithinIndex] = useState(0);

  const isLibrary = Array.isArray(libraryItems) && libraryItems.length > 0 && typeof currentIndex === 'number' && typeof onChangeIndex === 'function';
  const currentItem = isLibrary ? libraryItems[currentIndex] : null;
  const imgs = isLibrary
    ? (currentItem?.allImages || [])
    : (allImages?.length ? allImages : (src ? [{ data_uri: src, url: src }] : []));
  const imgsNorm = Array.isArray(imgs) ? imgs : [];
  const current = imgsNorm[withinIndex] || imgsNorm[0];
  const currentSrc = current?.data_uri || current?.url || (isLibrary ? (imgsNorm[0]?.data_uri || imgsNorm[0]?.url) : src);
  const promptText = (isLibrary ? currentItem?.prompt : prompt) || 'Image preview';
  const hasMultipleWithin = imgsNorm.length > 1;
  const hasMultipleLibrary = isLibrary && libraryItems.length > 1;

  const goPrevWithin = () => setWithinIndex(i => (i - 1 + imgsNorm.length) % imgsNorm.length);
  const goNextWithin = () => setWithinIndex(i => (i + 1) % imgsNorm.length);
  const goPrevLibrary = () => { setWithinIndex(0); onChangeIndex(Math.max(0, currentIndex - 1)); };
  const goNextLibrary = () => { setWithinIndex(0); onChangeIndex(Math.min(libraryItems.length - 1, currentIndex + 1)); };

  const canPrevLibrary = isLibrary && libraryItems.length > 1 && currentIndex > 0;
  const canNextLibrary = isLibrary && libraryItems.length > 1 && currentIndex < libraryItems.length - 1;
  const canPrevWithin = hasMultipleWithin && withinIndex > 0;
  const canNextWithin = hasMultipleWithin && withinIndex < imgsNorm.length - 1;
  const canPrev = canPrevLibrary || canPrevWithin;
  const canNext = canNextLibrary || canNextWithin;

  const goPrev = () => { if (canPrevLibrary) goPrevLibrary(); else if (canPrevWithin) goPrevWithin(); };
  const goNext = () => { if (canNextLibrary) goNextLibrary(); else if (canNextWithin) goNextWithin(); };

  useEffect(() => {
    if (open) setWithinIndex(0);
  }, [open, isLibrary ? currentIndex : undefined]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/80">
          <h3 className="text-sm font-medium text-gray-700 truncate max-w-[70%]">{promptText}</h3>
          <div className="flex items-center gap-2">
            {hasMultipleWithin && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <button type="button" onClick={goPrevWithin} className="p-1.5 rounded-lg hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
                <span>{withinIndex + 1} / {imgsNorm.length}</span>
                <button type="button" onClick={goNextWithin} className="p-1.5 rounded-lg hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
              </div>
            )}
            {isLibrary && libraryItems.length > 1 && (
              <span className="text-xs text-gray-400">{currentIndex + 1} / {libraryItems.length}</span>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="relative flex-1 overflow-auto flex items-center justify-center p-4 min-h-[200px] bg-gray-900/5">
          {(canPrev || canNext) && (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/95 hover:bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:text-black transition-colors disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/95 hover:bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:text-black transition-colors disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
          {currentSrc && <img src={currentSrc} alt={promptText} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg" />}
        </div>
      </div>
    </div>
  );
}

// Auth Screen
function AuthScreen({ onAuth, showToast }) {
  const [mode, setMode] = useState('login');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) {
        setReferralCode(ref.trim().toUpperCase());
        setMode('register');
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { nickname, password }
        : { nickname, password, email: email || null, referral_code: referralCode || null };
      const data = await api.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
      api.setToken(data.token);
      onAuth(data.user);
      showToast(mode === 'login' ? 'Welcome back!' : 'Account created!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex">
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-black" />
            </div>
            <span className="text-xl font-semibold tracking-tight">FiftyFive Labs</span>
          </div>
          <h1 className="text-5xl font-bold leading-tight mb-6">Generate stunning<br />AI voices instantly</h1>
          <p className="text-lg text-gray-400 max-w-md">Professional AI voice synthesis with ElevenLabs technology. Create natural-sounding speech in seconds.</p>
        </div>
        <div className="space-y-6">
          {[{ icon: Volume2, title: 'Natural Voices', desc: 'Over 50 professional voices' },
            { icon: Zap, title: 'Lightning Fast', desc: 'Generate audio in seconds' },
            { icon: Key, title: 'API Access', desc: 'Integrate into your workflow' }].map((f, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center"><f.icon className="w-6 h-6" /></div>
              <div><h3 className="font-medium">{f.title}</h3><p className="text-sm text-gray-400">{f.desc}</p></div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center"><Sparkles className="w-6 h-6 text-white" /></div>
            <span className="text-xl font-semibold tracking-tight">FiftyFive Labs</span>
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{mode === 'login' ? 'Welcome back' : 'Create an account'}</h2>
            <p className="text-gray-500">{mode === 'login' ? 'Enter your credentials to continue' : 'Start generating AI voices today'}</p>
          </div>
          <Tabs tabs={[{ value: 'login', label: 'Sign In' }, { value: 'register', label: 'Sign Up' }]} value={mode} onChange={setMode} />
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'register' && referralCode && (
              <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
                Referral: <span className="font-mono font-semibold">{referralCode}</span>
              </div>
            )}
            <Input label="Username" placeholder="Enter your username" value={nickname} onChange={(e) => setNickname(e.target.value)} required />
            {mode === 'register' && <Input label="Email (optional)" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 pr-10 focus:outline-none focus:ring-2 focus:ring-black/5" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" loading={loading} className="w-full" size="lg">{mode === 'login' ? 'Sign In' : 'Create Account'}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Toggle Switch Component
function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-11 h-6 rounded-full transition-colors ${checked ? 'bg-black' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
      </div>
    </label>
  );
}

// Usage Chart Component
function UsageChart({ stats }) {
  const [period, setPeriod] = useState('7d');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  // mode: 'admin' | 'user'
  const mode = stats?.__mode || 'user';

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const endpoint = mode === 'admin'
          ? `/api/admin/usage?period=${period}`
          : `/api/user/usage?period=${period}`;
        const data = await api.request(endpoint, mode === 'admin' ? { admin: true } : {});
        if (!alive) return;
        setChartData(data.series || []);
      } catch {
        if (alive) setChartData([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [period, mode]);

  const maxChars = Math.max(...chartData.map(d => d.chars), 1);
  const totalChars = chartData.reduce((a, b) => a + (b.chars || 0), 0);
  
  // Smart scaling: if one value dominates, use a more balanced scale
  const sortedChars = [...chartData.map(d => d.chars || 0)].sort((a, b) => b - a);
  const secondMax = sortedChars[1] || 0;
  const scaleMax = maxChars > 0 && secondMax > 0 && maxChars / secondMax > 5
    ? Math.max(maxChars * 0.7, secondMax * 2) // Cap at 70% of max if outlier exists
    : maxChars;
  
  const chartMinWidth = useMemo(() => {
    const perBar = period === '30d' ? 28 : period === '7d' ? 40 : 50;
    return Math.max(520, (chartData.length || 0) * perBar);
  }, [chartData.length, period]);
  
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-gray-900">Usage Statistics</h3>
          <p className="text-xs text-gray-500">Characters generated over time</p>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {[{ id: 'today', label: 'Today' }, { id: '7d', label: '7 Days' }, { id: '30d', label: '30 Days' }].map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Chart */}
      <div className="overflow-x-auto overflow-y-hidden -mx-2 px-2">
        <div className="h-48 flex items-end gap-0.5 relative pb-6" style={{ minWidth: chartMinWidth }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : (
          chartData.map((d, i) => {
            const barHeight = Math.max(8, (d.chars / scaleMax) * 100);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex flex-col justify-end h-36 relative">
                  <div
                    className="relative group w-full cursor-pointer"
                    style={{ height: `${barHeight}%` }}
                  >
                    <div className="w-full h-full bg-gradient-to-t from-gray-900 to-gray-600 rounded-t-sm transition-all hover:from-black hover:to-gray-700 hover:shadow-lg min-h-[2px]" />
                    {/* Tooltip - завжди внизу графіка */}
                    {(() => {
                      const edge = chartData.length >= 20 ? 3 : 2;
                      const isLeftEdge = i < edge;
                      const isRightEdge = i >= chartData.length - edge;
                      const pos = isLeftEdge
                        ? 'left-0 translate-x-0'
                        : isRightEdge
                          ? 'right-0 translate-x-0'
                          : 'left-1/2 -translate-x-1/2';
                      return (
                        <div className={`pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 absolute bottom-0 translate-y-full mt-2 ${pos} whitespace-nowrap z-30`}>
                          <div className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium shadow-2xl border-2 border-gray-700 backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">{d.label}:</span>
                              <span className="font-bold text-white">{(d.chars || 0).toLocaleString()}</span>
                              <span className="text-gray-400 text-xs">chars</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="w-full h-6 flex items-start justify-center">
                  <span 
                    className={`text-gray-400 text-center ${
                      period === '30d' ? 'text-[10px]' : 'text-[10px]'
                    }`}
                    title={`${d.label}: ${(d.chars || 0).toLocaleString()} chars`}
                  >
                    {d.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-gray-900 to-gray-600" />
          <span className="text-xs text-gray-500">Characters</span>
        </div>
        <div className="text-xs text-gray-400">
          Total: <span className="font-semibold text-gray-700">{totalChars.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}

// Voice Generation Tab
function VoiceTab({ user, refreshUser, showToast, onGoToLibrary }) {
  const [text, setText] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Tasks synced from server
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState(() => {
    try {
      // Keep completed tasks in localStorage for quick display
      return JSON.parse(localStorage.getItem('ff_completed_tasks') || '[]');
    } catch { return []; }
  });
  
  // Voice settings with localStorage persistence
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('ff_voice_id') || '21m00Tcm4TlvDq8ikWAM');
  const [modelId, setModelId] = useState(() => localStorage.getItem('ff_model_id') || 'eleven_multilingual_v2');
  const [stability, setStability] = useState(() => parseFloat(localStorage.getItem('ff_stability')) || 0.5);
  const [similarityBoost, setSimilarityBoost] = useState(() => parseFloat(localStorage.getItem('ff_similarity')) || 0.75);
  const [style, setStyle] = useState(() => parseFloat(localStorage.getItem('ff_style')) || 0.0);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(() => localStorage.getItem('ff_speaker_boost') !== 'false');
  const [speed, setSpeed] = useState(() => parseFloat(localStorage.getItem('ff_speed')) || 1.0);

  // Save settings to localStorage
  useEffect(() => { localStorage.setItem('ff_voice_id', voiceId); }, [voiceId]);
  useEffect(() => { localStorage.setItem('ff_model_id', modelId); }, [modelId]);
  useEffect(() => { localStorage.setItem('ff_stability', stability.toString()); }, [stability]);
  useEffect(() => { localStorage.setItem('ff_similarity', similarityBoost.toString()); }, [similarityBoost]);
  useEffect(() => { localStorage.setItem('ff_style', style.toString()); }, [style]);
  useEffect(() => { localStorage.setItem('ff_speaker_boost', useSpeakerBoost.toString()); }, [useSpeakerBoost]);
  useEffect(() => { localStorage.setItem('ff_speed', speed.toString()); }, [speed]);
  
  // Save completed tasks to localStorage (manual control, not auto-save)
  // useEffect removed to prevent double saves - we save manually when adding tasks

  // Get favorite voices from localStorage (synced with VoiceLibraryTab)
  const [favoriteVoices, setFavoriteVoices] = useState([]);
  const [allVoices, setAllVoices] = useState([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState('');
  
  // Load voices and favorites - check localStorage for stored favorite voice data
  useEffect(() => {
    const loadVoicesData = async () => {
      try {
        // First, try to load favorites from localStorage (stored by VoiceLibraryTab)
        const storedFavVoices = localStorage.getItem('ff_voice_favorites_data');
        if (storedFavVoices) {
          try {
            const parsed = JSON.parse(storedFavVoices);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setFavoriteVoices(parsed);
            }
          } catch {}
        }
        
        // Load all voices from API
        const data = await api.request('/api/voices/library');
        const voices = data.voices || [];
        setAllVoices(voices);
        
        // If we don't have favorites data yet, try to match by IDs
        const favIds = JSON.parse(localStorage.getItem('ff_voice_favorites') || '[]');
        if (favIds.length > 0) {
          // Try to find voices in the loaded list
          const matchedFavs = voices.filter(v => favIds.includes(v.voice_id));
          if (matchedFavs.length > 0) {
            setFavoriteVoices(prev => {
              // Merge with existing, preferring stored data
              const existingIds = new Set(prev.map(v => v.voice_id));
              const newVoices = matchedFavs.filter(v => !existingIds.has(v.voice_id));
              const merged = [...prev, ...newVoices];
              // Save to localStorage for persistence
              localStorage.setItem('ff_voice_favorites_data', JSON.stringify(merged));
              return merged;
            });
          }
        }
      } catch {}
    };
    loadVoicesData();
    
    // Listen for storage changes (when favorites are updated in VoiceLibraryTab)
    const handleStorageChange = (e) => {
      if (e.key === 'ff_voice_favorites_data' && e.newValue) {
        try {
          setFavoriteVoices(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Filter voices for modal
  const filteredAllVoices = allVoices.filter(v => 
    !voiceSearch || 
    v.name?.toLowerCase().includes(voiceSearch.toLowerCase()) ||
    v.labels?.gender?.toLowerCase().includes(voiceSearch.toLowerCase())
  );

  const models = [
    { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2', desc: 'High quality, 29 languages' },
    { id: 'eleven_turbo_v2', name: 'Eleven Turbo v2', desc: 'Fast English' },
    { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5', desc: 'Fast multilingual' },
    { id: 'eleven_flash_v2', name: 'Eleven Flash v2', desc: 'Ultra-fast' },
    { id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', desc: 'Fastest, 32 languages' },
    { id: 'eleven_v3', name: 'Eleven English v3', desc: 'Latest, most emotive' },
  ];

  // Track completed task IDs to prevent re-adding
  const completedIdsRef = useRef(new Set());

  // Centralized function to move task to completed (prevents duplicates)
  const moveToCompleted = useCallback((task, status, error = null) => {
    const taskId = task.id;
    
    // Check if already in completedIdsRef
    if (completedIdsRef.current.has(taskId)) {
      return false;
    }
    completedIdsRef.current.add(taskId);
    
    // Remove from active tasks
    setTasks(prev => prev.filter(t => t.id !== taskId));
    
    // Add to completed tasks (with duplicate check)
    setCompletedTasks(prev => {
      // Check if already exists in completedTasks
      const alreadyExists = prev.some(t => t.id === taskId);
      if (alreadyExists) return prev;
      
      const completedTask = {
        ...task,
        id: taskId,
        taskId: taskId, // Keep our internal ID for download (server will use voicer_task_id from metadata)
        status: status,
        progress: status === 'completed' ? 100 : task.progress,
        completedAt: Date.now(),
        textPreview: task.textPreview || task.text?.slice(0, 50),
        charCount: task.charCount || 0,
        error: error
      };
      
      const updated = [completedTask, ...prev].slice(0, 20);

      // Save to localStorage immediately
      localStorage.setItem('ff_completed_tasks', JSON.stringify(updated));
      return updated;
    });
    
    return true;
  }, []);

  // Fetch active tasks from server - STABLE VERSION (NO LOOP!)
  const fetchActiveTasks = useCallback(async () => {
    try {
      const data = await api.request('/api/tasks/active');
      if (data.tasks) {
        // Просто конвертуємо дані з сервера - БЕЗ додаткових запитів!
        const activeTasks = data.tasks
          .filter(t => !completedIdsRef.current.has(t.id)) // Фільтруємо тільки completed
          .map(t => ({
            id: t.id,
            taskId: t.id,
            status: t.status, // ДОВІРЯЄМО серверу!
            text: t.prompt,
            textPreview: t.prompt?.slice(0, 50) + (t.prompt?.length > 50 ? '...' : ''),
            charCount: t.char_count,
            progress: t.progress || 0, // ✅ БЕРЕМО З СЕРВЕРА!
            chunks: null, // Will be updated by pollTasks
            totalChunks: null,
            queue_position: t.queue_position, // ✅ БЕРЕМО З СЕРВЕРА!
            createdAt: t.created_at_ms
          }));

        setTasks(activeTasks);
      }
    } catch (_) {}
  }, []); // ✅ EMPTY DEPS - NO LOOP!

  // Poll task status - ОПТИМІЗОВАНА МАКСИМАЛЬНО РЕАКТИВНА СИСТЕМА
  const pollTasks = useCallback(async () => {
    // Включаємо pending, queued, processing
    const activeTasks = tasks.filter(t => 
      t.status === 'processing' || 
      t.status === 'queued' || 
      t.status === 'pending'
    );
    
    if (activeTasks.length === 0) return;

    // Паралельна перевірка всіх задач (ШВИДШЕ!) - WITH 404 HANDLING
    const updates = await Promise.allSettled(
      activeTasks.map(async (task) => {
        try {
          const data = await api.request(`/api/voice/status/${task.id}`);
          return { task, data, success: true, notFound: false };
        } catch (err) {
          // 404 = task не існує (expired/deleted) - видаляємо з UI
          const is404 = err.message?.includes('404') || err.message?.includes('not found') || err.message?.includes('Not Found');
          if (is404) {
            return { task, error: err, success: false, notFound: true };
          }
          return { task, error: err, success: false, notFound: false };
        }
      })
    );
    
    // Обробка результатів
    for (const result of updates) {
      if (result.status !== 'fulfilled') continue;
      
      const { task, data, success, notFound } = result.value;
      
      // Якщо 404 - видаляємо task з UI (expired/deleted)
      if (notFound) {
        setTasks(prev => prev.filter(t => t.id !== task.id));
        continue;
      }
      
      if (!success) continue;
      
      if (data.status === 'completed') {
        const moved = moveToCompleted(task, 'completed');
        if (moved) {
          showToast('Audio generated!', 'success');
          refreshUser();
        }
        
      } else if (data.status === 'failed' || data.status === 'cancelled') {
        const moved = moveToCompleted(task, data.status, data.error || 'Generation failed');
        if (moved) {
          showToast(data.error || 'Generation failed', 'error');
        }
        
      } else {
        // ЗАВЖДИ оновлюємо статус (навіть якщо не змінився)
        setTasks(prev => prev.map(t => 
          t.id === task.id 
            ? { 
                ...t, 
                status: data.status || t.status, // ВАЖЛИВО: оновлюємо статус!
                progress: data.progress || 0, 
                chunks: data.chunks_completed, 
                totalChunks: data.chunks_total,
                queue_position: data.queue_position,
                voicer_task_id: data.voicer_task_id || t.voicer_task_id
              }
            : t
        ));
      }
    }
  }, [tasks, showToast, refreshUser, moveToCompleted]);

  // Initial load only - ✅ RUNS ONCE!
  useEffect(() => {
    fetchActiveTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ EMPTY - NO INFINITE LOOP!

  // ULTRA-FAST POLLING - МАКСИМАЛЬНА ШВИДКІСТЬ
  useEffect(() => {
    const activeTasks = tasks.filter(t => 
      t.status === 'processing' || 
      t.status === 'queued' || 
      t.status === 'pending'
    );
    
    if (activeTasks.length === 0) {
      return; // Stop polling
    }
    
    // МАКСИМАЛЬНО АГРЕСИВНИЙ polling
    let pollInterval = 1000; // 1 секунда базово (ДУЖЕ ШВИДКО!)
    
    // НАДШВИДКИЙ для processing
    if (activeTasks.some(t => t.status === 'processing')) {
      pollInterval = 800; // 0.8 сек! (БЛИСКАВИЧНО!)
    }
    // Швидкий для pending/queued
    else if (activeTasks.some(t => t.status === 'pending' || t.status === 'queued')) {
      pollInterval = 1200; // 1.2 сек
    }
    
    // МИТТЄВА перевірка
    pollTasks();
    
    const interval = setInterval(pollTasks, pollInterval);
    return () => clearInterval(interval);
  }, [tasks, pollTasks]);

  // Cancel a task
  const cancelTask = async (taskId) => {
    try {
      const result = await api.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
      showToast(`Task cancelled. ${result.credits_refunded} credits refunded`, 'success');
      fetchActiveTasks();
      refreshUser();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);
  
  const handleGenerate = async () => {
    if (isGenerating) return; // Prevent double clicks
    
    if (!text.trim()) {
      showToast('Please enter text to synthesize', 'warning');
      return;
    }

    const charCount = text.trim().length;
    
    // Check credits - calculate from credit packages
    const totalCredits = (user?.credit_packages || []).reduce((sum, p) => sum + (p.credits_remaining || 0), 0);
    
    if (totalCredits < charCount) {
      showToast(`Insufficient credits. Need ${charCount.toLocaleString()}, have ${totalCredits.toLocaleString()}`, 'error');
      return;
    }

    setIsGenerating(true);
    
    try {
      const payload = {
        text: text.trim(),
        voice_id: voiceId,
        model_id: modelId,
        voice_settings: { 
          stability, 
          similarity_boost: similarityBoost, 
          style, 
          use_speaker_boost: useSpeakerBoost, 
          speed 
        },
      };

      await api.request('/api/voice/synthesize', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setText('');
      showToast('Task started!', 'success');
      refreshUser();
      
      // БЛИСКАВИЧНЕ оновлення - 4 рази перевірка!
      setTimeout(fetchActiveTasks, 100); // МАЙЖЕ МИТТЄВО!
      setTimeout(pollTasks, 400); // Швидка перевірка
      setTimeout(pollTasks, 1000); // Середня перевірка
      setTimeout(pollTasks, 2000); // Фінальна перевірка
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const [downloadProgress, setDownloadProgress] = useState({});
  const [playingTaskId, setPlayingTaskId] = useState(null);
  const audioRef = useRef(null);

  // Helper function to download audio with retry (used for Download / Download all only)
  const fetchAudioWithRetry = async (taskId, maxRetries = 3) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/api/voice/download/${taskId}`, {
          headers: { 'Authorization': `Bearer ${api.token}` }
        });
        
        if (response.status === 410) throw new Error('File expired');
        if (response.status === 503) {
          // Server is preparing the file, retry after delay
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error('Audio preparing, please try again in a moment');
        }
        if (!response.ok) throw new Error('Failed to load audio');
        
        return response;
      } catch (err) {
        if (attempt === maxRetries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('Failed after retries');
  };

  const handlePlay = async (task) => {
    if (!task.id) return;
    
    if (playingTaskId === task.id) {
      audioRef.current?.pause();
      setPlayingTaskId(null);
      return;
    }

    try {
      showToast('Loading audio...', 'info');
      const url = getVoiceStreamUrl(task.id);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        setPlayingTaskId(task.id);
      }
    } catch (err) {
      showToast(err.message || 'Failed to play audio', 'error');
    }
  };

  const handleDownload = async (task) => {
    if (!task.id) return;
    
    setDownloadProgress(prev => ({ ...prev, [task.id]: 0 }));
    
    try {
      const response = await fetchAudioWithRetry(task.id);
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        received += value.length;
        
        if (total > 0) {
          const progress = Math.round((received / total) * 100);
          setDownloadProgress(prev => ({ ...prev, [task.id]: progress }));
        }
      }
      
      const blob = new Blob(chunks, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice_${task.id}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast('Downloaded!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDownloadProgress(prev => {
        const { [task.id]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const removeCompletedTask = (taskId) => {
    completedIdsRef.current.delete(taskId);
    setCompletedTasks(prev => {
      const updated = prev.filter(t => t.id !== taskId);
      localStorage.setItem('ff_completed_tasks', JSON.stringify(updated));
      return updated;
    });
  };

  const clearCompleted = () => {
    completedIdsRef.current.clear();
    setCompletedTasks([]);
    localStorage.setItem('ff_completed_tasks', JSON.stringify([]));
  };

  // Active tasks from server (processing/pending)
  const activeTasks = tasks;
  
  // Update timers every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
      {/* Hidden audio element – streams from URL, no full download */}
      <audio 
        ref={audioRef} 
        onEnded={() => setPlayingTaskId(null)} 
        onPause={() => setPlayingTaskId(null)}
        onError={() => { setPlayingTaskId(null); showToast('Failed to play audio', 'error'); }}
      />
      
      <div className="lg:col-span-2 space-y-6">
        <Card className="p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Text to Synthesize</h3>
          <textarea 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
            placeholder="Enter the text you want to convert to speech..."
            rows={6} 
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-black/5" 
          />
          <div className="mt-2 flex justify-between items-center text-xs">
            <span className="text-gray-400">{text.length.toLocaleString()} characters</span>
            <span className={`font-medium ${(() => {
              const totalCredits = user.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0) || 0;
              return text.length > totalCredits ? 'text-red-500' : 'text-gray-500';
            })()}`}>
              Cost: {text.length.toLocaleString()} credits
            </span>
          </div>
          
          {/* Generate Button - moved here, above voice settings */}
          <Button onClick={handleGenerate} className="w-full mt-4" size="lg" disabled={isGenerating || !text.trim()}>
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
            ) : activeTasks.length > 0 ? (
              <><Plus className="w-4 h-4" /> Add to Queue</>
            ) : (
              <><Volume2 className="w-4 h-4" /> Generate Voice</>
            )}
          </Button>
        </Card>

        <Card className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Voice</label>
            <div className="relative">
              <button 
                onClick={() => setShowVoiceModal(!showVoiceModal)}
                className="w-full px-3 py-2.5 text-left rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    // Try to find voice in allVoices first, then in favoriteVoices
                    const selectedVoice = allVoices.find(v => v.voice_id === voiceId) || favoriteVoices.find(v => v.voice_id === voiceId);
                    const gender = selectedVoice?.labels?.gender || selectedVoice?.gender || '';
                    return (
                      <>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                          gender === 'female' ? 'bg-pink-500' : 
                          gender === 'male' ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}>
                          <Mic className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedVoice?.name || 'Select Voice'}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">{voiceId?.slice(0, 20)}...</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showVoiceModal ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Voice Dropdown */}
              {showVoiceModal && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
                  {/* Search */}
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search by name or ID..."
                        value={voiceSearch}
                        onChange={(e) => setVoiceSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                      />
                    </div>
                  </div>
                  
                  {/* Voice List */}
                  <div className="overflow-y-auto max-h-60">
                    {/* Go to Library Button */}
                    <button
                      onClick={() => { setShowVoiceModal(false); onGoToLibrary && onGoToLibrary(); }}
                      className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <Library className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Browse Voice Library</p>
                        <p className="text-xs text-gray-400">Find more voices</p>
                      </div>
                    </button>
                    
                    {/* Favorite Voices */}
                    {favoriteVoices.filter(v => 
                      !voiceSearch || 
                      v.name?.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                      v.voice_id?.toLowerCase().includes(voiceSearch.toLowerCase())
                    ).map(v => (
                      <button
                        key={v.voice_id}
                        onClick={() => { setVoiceId(v.voice_id); setShowVoiceModal(false); }}
                        className={`w-full px-3 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between ${
                          voiceId === v.voice_id ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                            v.labels?.gender === 'female' ? 'bg-pink-500' : 
                            v.labels?.gender === 'male' ? 'bg-blue-500' : 'bg-purple-500'
                          }`}>
                            <Mic className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-500 fill-current" />
                              <p className="text-sm font-medium text-gray-900">{v.name}</p>
                            </div>
                            <p className="text-xs text-gray-400 font-mono">{v.voice_id?.slice(0, 20)}...</p>
                          </div>
                        </div>
                        <Star className="w-4 h-4 text-amber-500 fill-current" />
                      </button>
                    ))}
                    
                    {favoriteVoices.length === 0 && (
                      <div className="px-3 py-4 text-center text-sm text-gray-400">
                        No favorite voices yet.<br/>Add them in Voice Library ⭐
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
            <div className="grid grid-cols-3 gap-2">
              {models.map(m => (
                <button key={m.id} onClick={() => setModelId(m.id)}
                  className={`px-3 py-2 text-center rounded-lg border transition-all ${modelId === m.id ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                  <p className={`text-sm font-medium ${modelId === m.id ? 'text-white' : 'text-gray-900'}`}>{m.name}</p>
                  <p className={`text-xs ${modelId === m.id ? 'text-gray-300' : 'text-gray-500'}`}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
          
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Voice Settings
          </button>
          
          {showAdvanced && (
            <div className="space-y-5 pt-4 border-t border-gray-100">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Stability</label>
                  <span className="text-sm text-gray-500">{Math.round(stability * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={stability} onChange={(e) => setStability(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>More variable</span>
                  <span>More stable</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Clarity + Similarity</label>
                  <span className="text-sm text-gray-500">{Math.round(similarityBoost * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={similarityBoost} onChange={(e) => setSimilarityBoost(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Style Exaggeration</label>
                  <span className="text-sm text-gray-500">{Math.round(style * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={style} onChange={(e) => setStyle(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>None</span>
                  <span>Exaggerated</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Speed</label>
                  <span className="text-sm text-gray-500">{speed.toFixed(2)}x</span>
                </div>
                <input type="range" min="0.5" max="2" step="0.05" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.5x</span>
                  <span>2x</span>
                </div>
              </div>

              <div className="pt-2">
                <Toggle 
                  checked={useSpeakerBoost} 
                  onChange={setUseSpeakerBoost}
                  label="Speaker Boost"
                  description="Increases similarity to the original speaker"
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="lg:col-span-1 space-y-6">
        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                {activeTasks.length === 1 ? 'Current Task' : `Queue (${activeTasks.length})`}
              </h3>
              {activeTasks.filter(t => t.status === 'pending').length > 0 && (
                <button
                  onClick={async () => {
                    const pendingTasks = activeTasks.filter(t => t.status === 'pending');
                    for (const task of pendingTasks) {
                      try {
                        await api.request(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
                      } catch {}
                    }
                    showToast('Pending tasks cancelled', 'info');
                    fetchActiveTasks();
                    refreshUser();
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Cancel all pending
                </button>
              )}
            </div>
            <div className="space-y-3">
              {activeTasks.map((task, index) => (
                <div key={task.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {task.status === 'processing' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      ) : task.status === 'queued' ? (
                        <Clock className="w-4 h-4 text-orange-500 animate-pulse" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium">
                        {task.status === 'processing' 
                          ? 'Processing...' 
                          : task.status === 'queued' 
                          ? `Queued${task.queue_position ? ` #${task.queue_position}` : ''}` 
                          : task.status === 'pending'
                          ? 'Pending...'
                          : `#${index + 1} ${task.status || 'pending'}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{(task.charCount || 0).toLocaleString()} chars</span>
                      <button
                        onClick={() => cancelTask(task.id)}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Cancel task"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-2">{task.textPreview || task.text?.slice(0, 50)}</p>
                  {task.status === 'processing' && (
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-black transition-all" style={{ width: `${task.progress || 0}%` }} />
                    </div>
                  )}
                  {(task.status === 'queued' || task.status === 'pending') && (
                    <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 animate-pulse" style={{ width: '100%' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Completed Tasks */}
        <Card className="p-5 min-h-[300px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Recent</h3>
            {completedTasks.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const toZip = completedTasks.filter(t => t.status === 'completed' && !(t.completedAt && Date.now() > t.completedAt + 12 * 60 * 60 * 1000));
                    if (toZip.length === 0) {
                      showToast('No completed tasks to download', 'info');
                      return;
                    }
                    try {
                      showToast(`Preparing ${toZip.length} file${toZip.length !== 1 ? 's' : ''}…`, 'info');
                      const JSZip = (await import('jszip')).default;
                      const zip = new JSZip();
                      let count = 0;
                      for (const task of toZip) {
                        try {
                          const res = await fetchAudioWithRetry(task.id);
                          const blob = await res.blob();
                          zip.file(`voice_${task.id}.mp3`, blob);
                          count++;
                        } catch (_) {}
                      }
                      if (count === 0) {
                        showToast('Could not fetch any audio files', 'error');
                        return;
                      }
                      const blob = await zip.generateAsync({ type: 'blob' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `voice_recent_${Date.now()}.zip`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                      showToast(`Downloaded ${count} file${count !== 1 ? 's' : ''}`, 'success');
                    } catch (err) {
                      showToast(err?.message || 'Download failed', 'error');
                    }
                  }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download all
                </button>
                <button onClick={clearCompleted} className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors">
                  Clear all
                </button>
              </div>
            )}
          </div>
          {completedTasks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Volume2 className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">No completed tasks</p>
              <p className="text-xs text-gray-400">Finished generations will appear here</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[420px] pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400" style={{ scrollbarGutter: 'stable' }}>
              {completedTasks.slice().reverse().map(task => {
                const expiresAt = task.completedAt ? task.completedAt + (12 * 60 * 60 * 1000) : null;
                const isExpired = expiresAt && Date.now() > expiresAt;
                const timeLeft = expiresAt ? formatTimeRemaining(expiresAt) : null;
                return (
                  <div key={task.id} className={`p-3.5 rounded-xl border transition-shadow hover:shadow-sm ${
                    isExpired ? 'bg-gray-50/80 border-gray-200' :
                    task.status === 'completed' ? 'bg-emerald-50/80 border-emerald-200/60' : 'bg-red-50/80 border-red-200/60'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isExpired ? 'bg-gray-200/60 text-gray-500' :
                        task.status === 'completed' ? 'bg-emerald-200/60 text-emerald-700' : 'bg-red-200/60 text-red-700'
                      }`}>
                        {isExpired ? <Clock className="w-3 h-3" /> : task.status === 'completed' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {isExpired ? 'Expired' : task.status === 'completed' ? 'Ready' : 'Failed'}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums">{task.charCount?.toLocaleString() ?? 0} ch</span>
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-2 mb-2">{task.textPreview}</p>
                    {task.status === 'completed' && !isExpired && timeLeft && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mb-2"><Clock className="w-3 h-3" /> {timeLeft}</p>
                    )}
                    {task.error && <p className="text-xs text-red-600 mb-2">{task.error}</p>}
                    <div className="flex gap-2">
                      {task.status === 'completed' && !isExpired ? (
                        <>
                          <button
                            onClick={() => handlePlay(task)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                              playingTaskId === task.id ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {playingTaskId === task.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDownload(task)}
                            disabled={downloadProgress[task.id] !== undefined}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 bg-gray-900 text-white rounded-xl text-xs font-medium hover:bg-black disabled:opacity-50 transition-all relative overflow-hidden"
                          >
                            {downloadProgress[task.id] !== undefined ? (
                              <>
                                <div className="absolute inset-0 bg-emerald-500/30 transition-all" style={{ width: `${downloadProgress[task.id]}%` }} />
                                <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" />
                                <span className="relative z-10">{downloadProgress[task.id]}%</span>
                              </>
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </>
                      ) : isExpired ? (
                        <span className="text-xs text-gray-400 flex-1 text-center py-2">Unavailable</span>
                      ) : null}
                      <button onClick={() => removeCompletedTask(task.id)} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Click outside to close voice dropdown */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-40" onClick={() => setShowVoiceModal(false)} />
      )}
    </div>
  );
}

// Format remaining time
function formatTimeRemaining(expiresAtMs) {
  const now = Date.now();
  const remaining = expiresAtMs - now;
  
  if (remaining <= 0) return null;
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// History Tab
function HistoryTab({ showToast }) {
  const [historyType, setHistoryType] = useState('voice'); // 'voice' or 'image'
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // For re-rendering timers
  const [playingId, setPlayingId] = useState(null);
  const [downloading, setDownloading] = useState({}); // { jobId: progress 0-100 }
  const [selectedImages, setSelectedImages] = useState(new Set()); // Selected image job IDs
  const [previewImage, setPreviewImage] = useState(null); // { src, prompt, allImages, taskId }
  const audioRef = useRef(null);

  const perPage = historyType === 'image' ? 25 : 12;
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = historyType === 'image' ? '&type=image' : '&type=voice';
      const data = await api.request(`/api/history?page=${page}&limit=${perPage}${typeParam}`);
      setHistory(data.jobs || []);
      setTotal(data.total || 0);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, historyType, perPage, showToast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const viewableImageList = useMemo(() => {
    if (historyType !== 'image') return [];
    const now = Date.now();
    return history.filter(job => {
      let meta = {};
      try {
        if (job.metadata_json) meta = typeof job.metadata_json === 'string' ? JSON.parse(job.metadata_json) : job.metadata_json;
      } catch { return false; }
      if (meta?.type !== 'image' || job.status !== 'completed') return false;
      if (job.expires_at_ms && now > job.expires_at_ms) return false;
      return !!(meta.data_uri || meta.result);
    }).map(job => {
      let meta = {};
      try {
        if (job.metadata_json) meta = typeof job.metadata_json === 'string' ? JSON.parse(job.metadata_json) : job.metadata_json;
      } catch {}
      const allImages = meta.all_images || [{ data_uri: meta.data_uri || meta.result, url: meta.data_uri || meta.result }];
      return { jobId: job.id, prompt: job.prompt, allImages };
    });
  }, [history, historyType]);
  
  // Update timers every minute
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Helper: fetch full audio (used for Download / Download all only). Preview uses stream URL.
  const fetchAudioWithRetry = async (jobId, maxRetries = 3) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/api/voice/download/${jobId}`, {
          headers: { 'Authorization': `Bearer ${api.token}` }
        });
        
        if (response.status === 410) throw new Error('File expired');
        if (response.status === 503) {
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error('Audio preparing, please try again in a moment');
        }
        if (!response.ok) throw new Error('Failed to load audio');
        
        return response;
      } catch (err) {
        if (attempt === maxRetries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('Failed after retries');
  };

  const handlePlay = async (jobId) => {
    if (playingId === jobId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    try {
      showToast('Loading audio...', 'info');
      const url = getVoiceStreamUrl(jobId);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        setPlayingId(jobId);
      }
    } catch (err) {
      showToast(err.message || 'Failed to play audio', 'error');
    }
  };

  const handleDownload = async (jobId) => {
    setDownloading(prev => ({ ...prev, [jobId]: 0 }));
    
    try {
      const response = await fetchAudioWithRetry(jobId);
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        received += value.length;
        
        if (total > 0) {
          const progress = Math.round((received / total) * 100);
          setDownloading(prev => ({ ...prev, [jobId]: progress }));
        } else {
          // Unknown size, show indeterminate
          setDownloading(prev => ({ ...prev, [jobId]: -1 }));
        }
      }
      
      const blob = new Blob(chunks, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice_${jobId}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast('Downloaded!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDownloading(prev => {
        const { [jobId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} onPause={() => setPlayingId(null)} onError={() => { setPlayingId(null); showToast('Failed to play audio', 'error'); }} />
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">All History</h1>
        <p className="text-sm text-gray-500 mt-1">Voice and image generations from your account</p>
      </div>

      {/* Tabs + Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <Tabs
          tabs={[
            { value: 'voice', label: 'Voice' },
            { value: 'image', label: 'Image' }
          ]}
          value={historyType}
          onChange={(v) => { setHistoryType(v); setPage(1); setSelectedImages(new Set()); }}
        />
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {total} {historyType === 'image' ? 'images' : 'items'}
          </span>
          <Button variant="secondary" size="sm" onClick={loadHistory} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-gray-300 mb-4" />
          <p className="text-sm text-gray-500">Loading history…</p>
        </div>
      ) : history.length === 0 ? (
        <Card className="p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <History className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No generations yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">Your voice and image generations will appear here.</p>
        </Card>
      ) : (
        <>
          {historyType === 'image' && selectedImages.size > 0 && (
            <div className="mb-5 px-5 py-4 rounded-2xl border border-gray-200 bg-gray-50/80 flex flex-wrap items-center justify-between gap-4">
              <span className="text-sm font-medium text-gray-700">
                {selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    // Download selected images as ZIP
                    try {
                      const JSZip = (await import('jszip')).default;
                      const zip = new JSZip();
                      let count = 0;
                      
                      for (const jobId of selectedImages) {
                        const job = history.find(j => j.id === jobId);
                        if (!job) continue;
                        let metadata = {};
                        try {
                          if (job.metadata_json) {
                            metadata = typeof job.metadata_json === 'string' ? JSON.parse(job.metadata_json) : job.metadata_json;
                          }
                        } catch (e) {
                          continue;
                        }
                        
                        const imgSrc = metadata.data_uri || metadata.result;
                        if (imgSrc) {
                          // Handle data URI or URL
                          if (imgSrc.startsWith('data:')) {
                            // Data URI - convert to blob
                            const response = await fetch(imgSrc);
                            const blob = await response.blob();
                            zip.file(`image_${jobId}.png`, blob);
                            count++;
                          } else if (metadata.all_images && metadata.all_images.length > 1) {
                            // Multiple images
                            for (let idx = 0; idx < metadata.all_images.length; idx++) {
                              const img = metadata.all_images[idx];
                              const imgUrl = img.data_uri || img.url || imgSrc;
                              const response = await fetch(imgUrl);
                              const blob = await response.blob();
                              zip.file(`image_${jobId}_${idx + 1}.png`, blob);
                              count++;
                            }
                          } else {
                            // Single image URL
                            const response = await fetch(imgSrc);
                            const blob = await response.blob();
                            zip.file(`image_${jobId}.png`, blob);
                            count++;
                          }
                        }
                      }
                      
                      if (count > 0) {
                        const zipBlob = await zip.generateAsync({ type: 'blob' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(zipBlob);
                        link.download = `images_${Date.now()}.zip`;
                        link.click();
                        URL.revokeObjectURL(link.href);
                        showToast(`Downloaded ${count} image${count !== 1 ? 's' : ''}`, 'success');
                        setSelectedImages(new Set());
                      }
                    } catch {
                      showToast('Failed to create ZIP archive', 'error');
                    }
                  }}
                >
                  <Download className="w-4 h-4" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  onClick={async () => {
                    if (confirm(`Delete ${selectedImages.size} image${selectedImages.size !== 1 ? 's' : ''}?`)) {
                      for (const jobId of selectedImages) {
                        try {
                          await api.request(`/api/jobs/${jobId}`, { method: 'DELETE' });
                        } catch {}
                      }
                      showToast(`Deleted ${selectedImages.size} image${selectedImages.size !== 1 ? 's' : ''}`, 'success');
                      setSelectedImages(new Set());
                      loadHistory();
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </div>
          )}
          <div className={`grid gap-5 ${historyType === 'image' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {history.map(job => {
              const isExpired = job.expires_at_ms && Date.now() > job.expires_at_ms;
              const timeRemaining = job.expires_at_ms ? formatTimeRemaining(job.expires_at_ms) : null;
              let metadata = {};
              try {
                if (job.metadata_json) {
                  metadata = typeof job.metadata_json === 'string' ? JSON.parse(job.metadata_json) : job.metadata_json;
                }
              } catch {}
              // Check if this is an image job - must match current history type
              const isImage = metadata && metadata.type === 'image';
              
              // Only show items that match the current history type
              if (historyType === 'image' && !isImage) return null;
              if (historyType === 'voice' && isImage) return null;
              
              const isSelected = selectedImages.has(job.id);
              
              const allImagesForPreview = metadata.all_images || [{ data_uri: metadata.data_uri || metadata.result }];
              const imgSrc = metadata.data_uri || metadata.result;
              return (
                <Card key={job.id} className={`overflow-hidden group transition-all ${isExpired ? 'opacity-65' : ''} ${isSelected ? 'ring-2 ring-black ring-offset-2' : 'hover:shadow-md'}`}>
                  {isImage && job.status === 'completed' && !isExpired && imgSrc ? (
                    <div className="relative aspect-square bg-gray-100">
                      {historyType === 'image' && (
                        <div className="absolute top-3 left-3 z-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSelected = new Set(selectedImages);
                              if (e.target.checked) newSelected.add(job.id);
                              else newSelected.delete(job.id);
                              setSelectedImages(newSelected);
                            }}
                            className="w-5 h-5 rounded-md border-gray-300 text-black focus:ring-2 focus:ring-black/20"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                      <img
                        src={imgSrc}
                        alt={job.prompt}
                        className="w-full h-full object-cover cursor-pointer hover:scale-[1.02] transition-transform duration-200"
                        onClick={() => {
                          const idx = viewableImageList.findIndex(i => i.jobId === job.id);
                          if (idx >= 0) setPreviewImage({ list: viewableImageList, index: idx });
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3 gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = viewableImageList.findIndex(i => i.jobId === job.id);
                            if (idx >= 0) setPreviewImage({ list: viewableImageList, index: idx });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/95 text-gray-900 text-xs font-medium hover:bg-white flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const link = document.createElement('a');
                            link.href = imgSrc;
                            link.download = `image_${job.id}.png`;
                            link.click();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/95 text-gray-900 text-xs font-medium hover:bg-white flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isExpired ? 'bg-gray-100 text-gray-500' :
                        job.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        job.status === 'failed' ? 'bg-red-50 text-red-600' :
                        job.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                        job.status === 'processing' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isExpired ? <Clock className="w-3 h-3" /> : job.status === 'completed' ? <Check className="w-3 h-3" /> : job.status === 'processing' ? <Loader2 className="w-3 h-3 animate-spin" /> : job.status === 'failed' || job.status === 'cancelled' ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {isExpired ? 'Expired' : job.status}
                      </span>
                      {!isImage && job.width > 0 && <span className="text-xs text-gray-400 tabular-nums">{job.width.toLocaleString()} ch</span>}
                    </div>
                    <p className="text-sm text-gray-900 line-clamp-2 mb-3">{job.prompt}</p>
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-3 min-h-[1.25rem]">
                      <span>{new Date(job.created_at_ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {job.status === 'completed' && !isExpired && timeRemaining ? (
                        <span className="flex items-center gap-1 text-amber-600"><Clock className="w-3 h-3" /> {timeRemaining}</span>
                      ) : (
                        <span className="invisible">—</span>
                      )}
                    </div>
                    {!isImage && job.status === 'completed' && !isExpired ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePlay(job.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            playingId === job.id ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {playingId === job.id ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Play</>}
                        </button>
                        <button
                          onClick={() => handleDownload(job.id)}
                          disabled={downloading[job.id] !== undefined}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-black disabled:opacity-50 transition-all relative overflow-hidden"
                        >
                          {downloading[job.id] !== undefined ? (
                            <>
                              <div className="absolute inset-0 bg-emerald-500/30 transition-all" style={{ width: downloading[job.id] >= 0 ? `${downloading[job.id]}%` : '100%' }} />
                              <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                              <span className="relative z-10 ml-1">{downloading[job.id] >= 0 ? `${downloading[job.id]}%` : '…'}</span>
                            </>
                          ) : (
                            <><Download className="w-4 h-4" /> Download</>
                          )}
                        </button>
                      </div>
                    ) : isExpired ? (
                      <div className="py-2.5 text-center rounded-xl bg-gray-50 text-xs text-gray-400">Unavailable</div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
          
          {total > perPage && (
            <div className="flex items-center justify-center gap-3 mt-8 pt-6 border-t border-gray-100">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" /> Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {Math.ceil(total / perPage) || 1}
              </span>
              <Button variant="secondary" size="sm" disabled={page * perPage >= total} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <ImagePreviewModal
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        src={previewImage?.list ? undefined : previewImage?.src}
        prompt={previewImage?.list ? undefined : previewImage?.prompt}
        allImages={previewImage?.list ? undefined : previewImage?.allImages}
        items={previewImage?.list}
        currentIndex={previewImage?.index}
        onChangeIndex={previewImage?.list ? (i) => setPreviewImage(prev => prev ? { ...prev, index: i } : null) : undefined}
      />
    </div>
  );
}

// Voice Library Tab - ElevenLabs style voice browser with server-side filtering
function VoiceLibraryTab({ showToast }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ gender: '', age: '', accent: '', language: '', use_case: '' });
  const [activeTab, setActiveTab] = useState('all');
  const [playingId, setPlayingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [apiPage, setApiPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ff_voice_favorites') || '[]');
    } catch { return []; }
  });
  const [favVoices, setFavVoices] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ff_voice_favorites_data') || '[]');
    } catch { return []; }
  });
  const audioRef = useRef(null);
  const searchTimeout = useRef(null);

  const ITEMS_PER_PAGE = 20; // 5 rows x 4 columns

  // Filter configuration - same as amulet-voice
  const filterConfig = {
    gender: { label: 'Gender', options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' }
    ]},
    age: { label: 'Age', options: [
      { value: 'young', label: 'Young' },
      { value: 'middle_aged', label: 'Middle Aged' },
      { value: 'old', label: 'Old' }
    ]},
    accent: { label: 'Accent', options: [
      { value: 'american', label: 'American' },
      { value: 'british', label: 'British' },
      { value: 'australian', label: 'Australian' },
      { value: 'indian', label: 'Indian' },
      { value: 'irish', label: 'Irish' },
      { value: 'italian', label: 'Italian' },
      { value: 'spanish', label: 'Spanish' },
      { value: 'french', label: 'French' },
      { value: 'german', label: 'German' },
      { value: 'polish', label: 'Polish' },
      { value: 'russian', label: 'Russian' }
    ]},
    language: { label: 'Language', options: [
      { value: 'en', label: 'English' },
      { value: 'uk', label: 'Ukrainian' },
      { value: 'pl', label: 'Polish' },
      { value: 'de', label: 'German' },
      { value: 'fr', label: 'French' },
      { value: 'es', label: 'Spanish' },
      { value: 'it', label: 'Italian' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'ru', label: 'Russian' },
      { value: 'ja', label: 'Japanese' },
      { value: 'ko', label: 'Korean' },
      { value: 'zh', label: 'Chinese' }
    ]},
    use_case: { label: 'Use Case', options: [
      { value: 'narration', label: 'Narration' },
      { value: 'news', label: 'News' },
      { value: 'audiobook', label: 'Audiobook' },
      { value: 'conversational', label: 'Conversational' },
      { value: 'characters_animation', label: 'Characters' },
      { value: 'meditation', label: 'Meditation' },
      { value: 'gaming', label: 'Gaming' }
    ]}
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '') || search.trim() !== '';
  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length + (search.trim() ? 1 : 0);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [openDropdown]);

  // Load voices from ElevenLabs API with server-side filtering
  const loadVoicesFromApi = useCallback(async (newPage = 0, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page_size', '100');
      params.set('page', String(newPage));
      
      // Pass filters directly to API for server-side filtering
      if (search.trim()) params.set('search', search.trim());
      if (filters.gender) params.set('gender', filters.gender);
      if (filters.age) params.set('age', filters.age);
      if (filters.accent) params.set('accent', filters.accent);
      if (filters.language) params.set('language', filters.language);
      if (filters.use_case) params.set('use_case', filters.use_case);

      const token = localStorage.getItem('ff_token');
      const res = await fetch(`/api/elevenlabs/shared-voices?${params.toString()}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (data.ok && data.voices) {
        const newVoices = data.voices.map(v => ({
          voice_id: String(v.voice_id),
          name: v.name || 'Unknown',
          category: v.category || '',
          description: v.description || '',
          preview_url: v.preview_url || '',
          gender: v.gender || '',
          age: v.age || '',
          accent: v.accent || '',
          use_case: v.use_case || '',
          descriptive: v.descriptive || '',
          language: v.language || '',
          labels: v.labels || {}
        }));
        
        if (append) {
          setVoices(prev => [...prev, ...newVoices]);
        } else {
          setVoices(newVoices);
          setCurrentPage(1);
        }
        setHasMore(data.has_more || false);
        setApiPage(newPage);
      } else if (data.error) {
        showToast(data.error, 'error');
      }
    } catch {
      showToast('Failed to load voices', 'error');
    }
    setLoading(false);
  }, [search, filters, showToast]);

  // Initial load only
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadVoicesFromApi(0, false);
    }
  }, []);

  // Debounced search - fetch from API when search/filters change (after initial load)
  const prevSearchRef = useRef(search);
  const prevFiltersRef = useRef(JSON.stringify(filters));
  useEffect(() => {
    const filtersStr = JSON.stringify(filters);
    // Only trigger if search or filters actually changed (not on initial mount)
    if (prevSearchRef.current === search && prevFiltersRef.current === filtersStr) {
      return;
    }
    prevSearchRef.current = search;
    prevFiltersRef.current = filtersStr;
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadVoicesFromApi(0, false);
    }, 500);
    return () => clearTimeout(searchTimeout.current);
  }, [search, filters, loadVoicesFromApi]);

  // Save favorites to localStorage (both IDs and full data)
  useEffect(() => {
    localStorage.setItem('ff_voice_favorites', JSON.stringify(favorites));
    // Also save full voice data for use in VoiceTab
    localStorage.setItem('ff_voice_favorites_data', JSON.stringify(favVoices));
  }, [favorites, favVoices]);

  // Update favVoices when voices or favorites change
  useEffect(() => {
    const favSet = new Set(favorites);
    // Get stored favVoices data
    let storedFavVoices = [];
    try {
      storedFavVoices = JSON.parse(localStorage.getItem('ff_voice_favorites_data') || '[]');
    } catch (e) {}
    
    // Merge: use loaded voices if available, otherwise keep stored data
    const loadedFavs = voices.filter(v => favSet.has(v.voice_id));
    const loadedIds = new Set(loadedFavs.map(v => v.voice_id));
    
    // Keep stored favorites that are not in the loaded list (for persistence)
    const keptStored = storedFavVoices.filter(v => favSet.has(v.voice_id) && !loadedIds.has(v.voice_id));
    
    setFavVoices([...loadedFavs, ...keptStored]);
  }, [voices, favorites]);

  const clearAllFilters = () => {
    setFilters({ gender: '', age: '', accent: '', language: '', use_case: '' });
    setSearch('');
    setOpenDropdown(null);
  };

  const toggleFavorite = (voice) => {
    const voiceId = voice.voice_id;
    setFavorites(prev => {
      if (prev.includes(voiceId)) {
        return prev.filter(id => id !== voiceId);
      } else {
        return [...prev, voiceId];
      }
    });
    // Store voice data for favorites tab AND for VoiceTab sync
    setFavVoices(prev => {
      let newFavVoices;
      if (prev.find(v => v.voice_id === voiceId)) {
        newFavVoices = prev.filter(v => v.voice_id !== voiceId);
      } else {
        newFavVoices = [...prev, voice];
      }
      // Immediately update localStorage for cross-component sync
      localStorage.setItem('ff_voice_favorites_data', JSON.stringify(newFavVoices));
      return newFavVoices;
    });
  };

  const handlePlay = async (voice) => {
    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    const previewUrl = voice.preview_url;
    if (previewUrl) {
      try {
        if (audioRef.current) {
          audioRef.current.src = previewUrl;
          await audioRef.current.play();
          setPlayingId(voice.voice_id);
        }
      } catch (err) {
        showToast('Failed to play preview', 'error');
      }
    } else {
      showToast('No preview available', 'warning');
    }
  };

  const copyVoiceId = (voiceId) => {
    navigator.clipboard.writeText(voiceId);
    showToast('Voice ID copied!', 'success');
  };

  const truncateName = (name, maxLen = 22) => {
    if (!name) return 'Unknown';
    return name.length > maxLen ? name.slice(0, maxLen) + '...' : name;
  };

  // Filter for favorites tab - use stored favVoices data
  const displayVoices = useMemo(() => {
    if (activeTab === 'favorites') {
      return favVoices || [];
    }
    return voices;
  }, [voices, activeTab, favVoices]);

  // Pagination
  const totalPages = Math.ceil(displayVoices.length / ITEMS_PER_PAGE);
  const paginatedVoices = displayVoices.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset page when filters/tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  return (
    <div className="max-w-7xl mx-auto space-y-3">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
      
      {/* Header + Tabs in one row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Voice Library</h1>
          <p className="text-gray-500 text-xs">Browse and preview voices from ElevenLabs</p>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'all' 
              ? 'bg-black text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Voices
          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
            activeTab === 'all' ? 'bg-white/20' : 'bg-gray-200'
          }`}>{voices.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
            activeTab === 'favorites' 
              ? 'bg-black text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Star className={`w-4 h-4 ${activeTab === 'favorites' ? '' : 'text-amber-500'}`} />
          Favorites
          <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
            activeTab === 'favorites' ? 'bg-white/20' : 'bg-gray-200'
          }`}>{favVoices.length}</span>
        </button>
        </div>
      </div>

      {/* Search & Filters Button */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
        <div className="flex-1 relative h-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, ID or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-full pl-10 pr-4 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300"
          />
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)} 
          className={`h-10 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all whitespace-nowrap text-sm ${
            showFilters || hasActiveFilters
              ? 'bg-black text-white border-black' 
              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${showFilters || hasActiveFilters ? 'bg-white/20' : 'bg-black text-white'}`}>{activeFiltersCount}</span>
          )}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="p-4" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.keys(filterConfig).map(filterKey => {
              const config = filterConfig[filterKey];
              const isOpen = openDropdown === filterKey;
              const currentValue = filters[filterKey];
              const currentLabel = currentValue ? config.options.find(o => o.value === currentValue)?.label : null;

              return (
                <div key={filterKey} className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(isOpen ? null : filterKey); }}
                    className={`w-full px-3 py-2.5 rounded-xl text-sm text-left flex items-center justify-between transition-all ${
                      currentValue 
                        ? 'bg-black text-white' 
                        : 'bg-gray-100 border border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span className="truncate">{currentLabel || config.label}</span>
                    <ChevronDown className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {isOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="max-h-[200px] overflow-y-auto">
                        <button
                          onClick={() => { setFilters(f => ({ ...f, [filterKey]: '' })); setOpenDropdown(null); }}
                          className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${!currentValue ? 'bg-gray-50 text-black font-medium' : 'text-gray-700'}`}
                        >
                          <span>All</span>
                          {!currentValue && <Check className="w-4 h-4" />}
                        </button>
                        {config.options.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => { setFilters(f => ({ ...f, [filterKey]: opt.value })); setOpenDropdown(null); }}
                            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${currentValue === opt.value ? 'bg-gray-50 text-black font-medium' : 'text-gray-700'}`}
                          >
                            <span>{opt.label}</span>
                            {currentValue === opt.value && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {hasActiveFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex flex-wrap gap-2">
                {search.trim() && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                    "{search}"
                    <button onClick={() => setSearch('')} className="hover:text-black"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {Object.entries(filters).filter(([_, v]) => v).map(([key, value]) => (
                  <span 
                    key={key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium"
                  >
                    {filterConfig[key].options.find(o => o.value === value)?.label}
                    <button onClick={() => setFilters(f => ({ ...f, [key]: '' }))} className="hover:text-black">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <button 
                onClick={clearAllFilters} 
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium flex items-center gap-2 transition-all"
              >
                <X className="w-4 h-4" />
                Clear all
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Info Bar */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{displayVoices.length} voice{displayVoices.length !== 1 ? 's' : ''} {hasMore && '(more available)'}</span>
      </div>

      {/* Voice Grid */}
      {loading && voices.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : activeTab === 'favorites' && favVoices.length === 0 ? (
        <Card className="p-12 text-center">
          <Star className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No favorites yet</h3>
          <p className="text-gray-500 text-sm">Add voices to favorites by clicking the star icon</p>
        </Card>
      ) : displayVoices.length === 0 ? (
        <Card className="p-12 text-center">
          <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No voices found</h3>
          <p className="text-gray-500 text-sm">Try different filters or search term</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {paginatedVoices.map((voice) => (
              <Card key={voice.voice_id} className="p-4 hover:shadow-lg transition-all group">
                {/* Header: Avatar + Info + Favorite */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-semibold ${
                    (() => {
                      const g = (voice.labels?.gender || voice.gender || '').toLowerCase();
                      if (g === 'female') return 'bg-pink-500';
                      if (g === 'male') return 'bg-blue-500';
                      return 'bg-purple-500';
                    })()
                  }`}>
                    {voice.name?.charAt(0)?.toUpperCase() || 'V'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate" title={voice.name}>
                      {truncateName(voice.name)}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono truncate">{voice.voice_id?.slice(0, 16)}...</p>
                  </div>
                  <button
                    onClick={() => toggleFavorite(voice)}
                    className={`p-1.5 rounded-lg transition-all ${
                      favorites.includes(voice.voice_id)
                        ? 'text-amber-500 bg-amber-50'
                        : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                    }`}
                  >
                    <Star className={`w-5 h-5 ${favorites.includes(voice.voice_id) ? 'fill-current' : ''}`} />
                  </button>
                </div>
                
                {/* Labels */}
                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[26px]">
                  {(() => {
                    const labels = voice.labels || {};
                    const gender = labels.gender || voice.gender || '';
                    const age = labels.age || voice.age || '';
                    const accent = labels.accent || voice.accent || '';
                    const useCase = labels.use_case || voice.use_case || '';
                    
                    return (
                      <>
                        {gender && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            gender.toLowerCase() === 'female' ? 'bg-pink-100 text-pink-700' : 
                            gender.toLowerCase() === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {gender}
                          </span>
                        )}
                        {age && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                            {age}
                          </span>
                        )}
                        {accent && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs">
                            {accent}
                          </span>
                        )}
                        {useCase && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">
                            {useCase}
                          </span>
                        )}
                        {!gender && !age && !accent && !useCase && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                            voice
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                
                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePlay(voice)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      playingId === voice.voice_id
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {playingId === voice.voice_id ? (
                      <><Pause className="w-4 h-4" /> Stop</>
                    ) : (
                      <><Play className="w-4 h-4" /> Preview</>
                    )}
                  </button>
                  <button
                    onClick={() => copyVoiceId(voice.voice_id)}
                    className="px-4 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all"
                    title="Copy Voice ID"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
          
          {/* Pagination — same style as History; Next loads more when on last page */}
          {(totalPages > 1 || hasMore) && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-6 mt-6 border-t border-gray-100">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={(currentPage === totalPages && !hasMore) || (currentPage === totalPages && hasMore && loading)}
                onClick={async () => {
                  if (currentPage === totalPages && hasMore) {
                    await loadVoicesFromApi(apiPage + 1, true);
                    setCurrentPage(p => p + 1);
                  } else {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
                  }
                }}
              >
                {currentPage === totalPages && hasMore && loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Next <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Image Generation Tab
function ImageGenerationTab({ user, refreshUser, showToast }) {
  const [prompt, setPrompt] = useState(() => localStorage.getItem('ff_image_prompt') || '');
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('ff_image_aspect_ratio') || 'IMAGE_ASPECT_RATIO_LANDSCAPE');
  const [model, setModel] = useState(() => localStorage.getItem('ff_image_model') || 'IMAGEN_3_5');
  const [seed, setSeed] = useState(() => localStorage.getItem('ff_image_seed') || '');
  const [numImages, setNumImages] = useState(() => parseInt(localStorage.getItem('ff_num_images'), 10) || 1);
  const [showAdvanced, setShowAdvanced] = useState(() => localStorage.getItem('ff_image_show_advanced') === 'true');
  const [showModels, setShowModels] = useState(() => {
    const v = localStorage.getItem('ff_image_show_models');
    return v === null ? true : v === 'true';
  });
  const [tasks, setTasks] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [completedTasks, setCompletedTasks] = useState(() => {
    try {
      const s = localStorage.getItem('ff_completed_image_tasks');
      const raw = JSON.parse(s || '[]');
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      return raw.filter((t) => {
        if (!t || !t.id || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      }).slice(0, 20);
    } catch {
      return [];
    }
  });
  const completedIdsRef = useRef(new Set());
  const lastActiveTaskIdsRef = useRef([]);
  const [modelPricing, setModelPricing] = useState({});
  const [previewImage, setPreviewImage] = useState(null); // { src, prompt, allImages, taskId }
  const [fetchedImageUrls, setFetchedImageUrls] = useState({}); // taskId -> object URL (for loaded-from-storage tasks)
  const fetchedImageUrlsRef = useRef({});

  // Save Generate Image settings to localStorage
  useEffect(() => { localStorage.setItem('ff_image_prompt', prompt); }, [prompt]);
  useEffect(() => { localStorage.setItem('ff_image_aspect_ratio', aspectRatio); }, [aspectRatio]);
  useEffect(() => { localStorage.setItem('ff_image_model', model); }, [model]);
  useEffect(() => { localStorage.setItem('ff_image_seed', seed); }, [seed]);
  useEffect(() => { localStorage.setItem('ff_num_images', numImages.toString()); }, [numImages]);
  useEffect(() => { localStorage.setItem('ff_image_show_advanced', showAdvanced ? 'true' : 'false'); }, [showAdvanced]);
  useEffect(() => { localStorage.setItem('ff_image_show_models', showModels ? 'true' : 'false'); }, [showModels]);

  // Load model pricing
  useEffect(() => {
    const loadPricing = async () => {
      try {
        const data = await api.request('/api/model-pricing');
        if (data.pricing) {
          const pricingMap = {};
          data.pricing.forEach(p => {
            pricingMap[p.model_id] = p.credits_per_image;
          });
          setModelPricing(pricingMap);
        }
      } catch {
        // Set defaults if API fails
        setModelPricing({
          'IMAGEN_3_5': 1,
          'GEM_PIX': 1,
          'GEM_PIX_2': 2
        });
      }
    };
    loadPricing();
  }, []);

  const dedupeCompletedById = useCallback((list) => {
    const seen = new Set();
    return list.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, []);

  // Persist completed image tasks without base64 (avoids QuotaExceededError). Never throws.
  const persistCompletedImageTasks = useCallback((tasks) => {
    try {
      const safe = (tasks || []).slice(0, 20).map(t => ({
        id: t.id,
        prompt: String(t.prompt || '').slice(0, 500),
        status: t.status,
        error: t.error || null,
        completedAt: t.completedAt || Date.now()
      }));
      localStorage.setItem('ff_completed_image_tasks', JSON.stringify(safe));
    } catch (e) {
      try {
        if (e?.name === 'QuotaExceededError') {
          const s = (tasks || []).slice(0, 5).map(t => ({ id: t.id, prompt: String(t.prompt || '').slice(0, 500), status: t.status, error: t.error || null, completedAt: t.completedAt || Date.now() }));
          localStorage.setItem('ff_completed_image_tasks', JSON.stringify(s));
        } else {
          localStorage.setItem('ff_completed_image_tasks', '[]');
        }
      } catch (_) {}
    }
  }, []);

  const persistCompletedImageTasksSafe = useCallback((tasks) => {
    try { persistCompletedImageTasks(tasks); } catch (_) {}
  }, [persistCompletedImageTasks]);

  // Load active tasks (Image tab only – /api/image/tasks/active).
  // Catch-up: use persisted pending IDs so we recover tasks that completed while user was on another tab.
  const fetchActiveTasks = useCallback(async () => {
    try {
      const data = await api.request('/api/image/tasks/active');
      if (data.tasks) {
        const newTasks = data.tasks.map(t => ({
          id: t.id,
          prompt: t.prompt,
          status: t.status,
          progress: t.progress || 0,
          createdAt: t.created_at_ms,
          result: t.result,
          queue_position: t.queue_position
        }));
        const newIds = newTasks.map(t => t.id);
        const pending = getPendingImageTaskIds();
        const merged = [...new Set([...pending, ...newIds])];
        setPendingImageTaskIds(merged);
        const missingIds = merged.filter((id) => !newIds.includes(id));

        for (const taskId of missingIds) {
          if (completedIdsRef.current.has(taskId)) {
            removePendingImageTaskIds([taskId]);
            continue;
          }
          try {
            const st = await api.request(`/api/image/status/${taskId}`);
            if (st.status === 'completed' || st.status === 'failed' || st.status === 'cancelled') {
              completedIdsRef.current.add(taskId);
              removePendingImageTaskIds([taskId]);
              const status = st.status;
              const completedTask = {
                id: taskId,
                prompt: st.prompt ?? '',
                status,
                result: status === 'completed' ? (st.data_uri || st.result) : null,
                allImages: status === 'completed' ? (st.all_images || (st.data_uri || st.result ? [{ data_uri: st.data_uri || st.result }] : [])) : [],
                error: status !== 'completed' ? (st.error || (status === 'cancelled' ? 'Cancelled' : 'Failed')) : null,
                completedAt: Date.now()
              };
              setCompletedTasks(prev => {
                if (prev.some(t => t.id === taskId)) return prev;
                return dedupeCompletedById([completedTask, ...prev]).slice(0, 20);
              });
              if (status === 'completed') showToast('Image generated!', 'success');
              else if (status === 'cancelled') showToast('Task cancelled', 'info');
              else showToast(st.error || 'Generation failed', 'error');
              refreshUser();
            }
          } catch (_) {
            removePendingImageTaskIds([taskId]);
          }
        }

        lastActiveTaskIdsRef.current = newIds;
        const filteredTasks = newTasks.filter(t => !completedIdsRef.current.has(t.id));
        setTasks(filteredTasks);
      } else {
        lastActiveTaskIdsRef.current = [];
        setTasks([]);
        const pending = getPendingImageTaskIds();
        for (const taskId of pending) {
          if (completedIdsRef.current.has(taskId)) {
            removePendingImageTaskIds([taskId]);
            continue;
          }
          try {
            const st = await api.request(`/api/image/status/${taskId}`);
            if (st.status === 'completed' || st.status === 'failed' || st.status === 'cancelled') {
              completedIdsRef.current.add(taskId);
              removePendingImageTaskIds([taskId]);
              const status = st.status;
              const completedTask = {
                id: taskId,
                prompt: st.prompt ?? '',
                status,
                result: status === 'completed' ? (st.data_uri || st.result) : null,
                allImages: status === 'completed' ? (st.all_images || (st.data_uri || st.result ? [{ data_uri: st.data_uri || st.result }] : [])) : [],
                error: status !== 'completed' ? (st.error || (status === 'cancelled' ? 'Cancelled' : 'Failed')) : null,
                completedAt: Date.now()
              };
              setCompletedTasks(prev => {
                if (prev.some(t => t.id === taskId)) return prev;
                return dedupeCompletedById([completedTask, ...prev]).slice(0, 20);
              });
              if (status === 'completed') showToast('Image generated!', 'success');
              else if (status === 'cancelled') showToast('Task cancelled', 'info');
              else showToast(st.error || 'Generation failed', 'error');
              refreshUser();
            }
          } catch (_) {
            removePendingImageTaskIds([taskId]);
          }
        }
      }
    } catch (err) {
    }
  }, [dedupeCompletedById, showToast, refreshUser]);

  // Sync completedIdsRef with initial completedTasks (loaded from localStorage in useState).
  useLayoutEffect(() => {
    completedIdsRef.current.clear();
    completedTasks.forEach((t) => { if (t && t.id) completedIdsRef.current.add(t.id); });
  }, []);

  // Persist completed tasks when they change (initial state already from localStorage, no overwrite).
  useEffect(() => {
    persistCompletedImageTasksSafe(completedTasks);
  }, [completedTasks, persistCompletedImageTasksSafe]);

  const fetchingImagesRef = useRef(new Set());
  // Fetch images from backend for completed tasks without result (e.g. after reload from localStorage).
  const fetchImageForTask = useCallback(async (taskId) => {
    if (fetchedImageUrlsRef.current[taskId] || fetchingImagesRef.current.has(taskId)) return;
    fetchingImagesRef.current.add(taskId);
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${taskId}/image`, {
        headers: api.token ? { Authorization: `Bearer ${api.token}` } : {}
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      fetchedImageUrlsRef.current[taskId] = url;
      setFetchedImageUrls((prev) => ({ ...prev, [taskId]: url }));
    } catch (_) {}
    finally {
      fetchingImagesRef.current.delete(taskId);
    }
  }, []);

  useEffect(() => {
    const now = Date.now();
    completedTasks.forEach((t) => {
      if (!t || t.status !== 'completed' || !t.id || t.result) return;
      const exp = (t.completedAt || 0) + 12 * 60 * 60 * 1000;
      if (now > exp) return;
      fetchImageForTask(t.id);
    });
  }, [completedTasks, fetchImageForTask]);

  useEffect(() => {
    return () => {
      Object.values(fetchedImageUrlsRef.current).forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
      fetchedImageUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    fetchActiveTasks();
    const interval = setInterval(fetchActiveTasks, 2000);
    return () => clearInterval(interval);
  }, [fetchActiveTasks]);

  // Cancel an image task
  const cancelImageTask = async (taskId) => {
    try {
      const result = await api.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
      showToast(`Task cancelled. ${result.credits_refunded} credits refunded`, 'success');
      fetchActiveTasks();
      refreshUser();
    } catch (err) {
      showToast(err.message || 'Failed to cancel task', 'error');
    }
  };

  // Poll task status (Image tab: use /api/image/status only)
  const pollTasks = useCallback(async () => {
    const activeTasks = tasks.filter(t => 
      t.status === 'processing' || t.status === 'pending' || t.status === 'queued'
    );
    
    if (activeTasks.length === 0) return;

    const updates = await Promise.allSettled(
      activeTasks.map(async (task) => {
        try {
          const data = await api.request(`/api/image/status/${task.id}`);
          return { task, data, success: true };
        } catch (err) {
          return { task, error: err, success: false };
        }
      })
    );

    for (const result of updates) {
      if (result.status !== 'fulfilled') continue;
      const { task, data, success } = result.value;
      if (!success) continue;

      if (data.status === 'completed') {
        if (completedIdsRef.current.has(task.id)) continue;
        completedIdsRef.current.add(task.id);
        removePendingImageTaskIds([task.id]);
        setTasks(prev => {
          const next = prev.filter(t => t.id !== task.id);
          lastActiveTaskIdsRef.current = next.map(t => t.id);
          return next;
        });
        setCompletedTasks(prev => {
          if (prev.some(t => t.id === task.id)) return prev;
          const imgResult = data.data_uri || data.result;
          const allImages = data.all_images || (imgResult ? [{ data_uri: imgResult }] : []);
          const completedTask = {
            id: task.id,
            prompt: task.prompt,
            status: 'completed',
            result: imgResult,
            allImages: allImages,
            completedAt: Date.now()
          };
          const updated = dedupeCompletedById([completedTask, ...prev]).slice(0, 20);
          return updated;
        });
        showToast('Image generated!', 'success');
        refreshUser();
      } else if (data.status === 'failed' || data.status === 'cancelled') {
        if (completedIdsRef.current.has(task.id)) continue;
        completedIdsRef.current.add(task.id);
        removePendingImageTaskIds([task.id]);
        setTasks(prev => {
          const next = prev.filter(t => t.id !== task.id);
          lastActiveTaskIdsRef.current = next.map(t => t.id);
          return next;
        });
        setCompletedTasks(prev => {
          if (prev.some(t => t.id === task.id)) return prev;
          const completedTask = {
            id: task.id,
            prompt: task.prompt,
            status: data.status,
            error: data.error || (data.status === 'cancelled' ? 'Cancelled by user' : 'Generation failed'),
            completedAt: Date.now()
          };
          return dedupeCompletedById([completedTask, ...prev]).slice(0, 20);
        });
        showToast(data.error || (data.status === 'cancelled' ? 'Task cancelled' : 'Generation failed'), data.status === 'cancelled' ? 'info' : 'error');
        refreshUser();
      } else {
        setTasks(prev => prev.map(t => 
          t.id === task.id ? { 
            ...t, 
            status: data.status, 
            progress: data.progress || 0,
            queue_position: data.queue_position
          } : t
        ));
      }
    }
  }, [tasks, showToast, refreshUser, dedupeCompletedById]);

  useEffect(() => {
    if (tasks.length === 0) return;
    const interval = setInterval(pollTasks, 1000);
    return () => clearInterval(interval);
  }, [tasks, pollTasks]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (!prompt.trim()) {
      showToast('Please enter a prompt', 'warning');
      return;
    }

    const prompts = prompt.trim().split('\n').filter(p => p.trim().length > 0);
    if (prompts.length === 0) {
      showToast('Please enter at least one prompt', 'warning');
      return;
    }

    // Check credits from packages (same as Generate Voice)
    const creditsPerImage = modelPricing[model] || 1;
    const totalImages = prompts.length * numImages;
    const totalCost = totalImages * creditsPerImage;
    const totalCredits = (user?.credit_packages || []).reduce((sum, p) => sum + (p.credits_remaining || 0), 0);
    if (totalCredits < totalCost) {
      showToast(`Insufficient credits. Need ${totalCost.toLocaleString()}, have ${totalCredits.toLocaleString()}`, 'error');
      return;
    }

    setIsGenerating(true);
    const releaseTimer = setTimeout(() => setIsGenerating(false), 2000);

    const pairs = [];
    for (const singlePrompt of prompts) {
      for (let i = 0; i < numImages; i++) {
        const payload = {
          provider: 'imaginator',
          prompt: singlePrompt.trim(),
          aspect_ratio: aspectRatio,
          model: model,
          ...(seed && { seed: parseInt(seed) + i })
        };
        pairs.push({
          promise: api.request('/api/image/generate', { method: 'POST', body: JSON.stringify(payload) }),
          prompt: singlePrompt.trim()
        });
      }
    }

    const allPromises = pairs.map((p) => p.promise);

    Promise.allSettled(allPromises).then(async (settled) => {
      let syncCompleted = 0;
      let failed = 0;
      const toAddFailed = [];
      const createdTaskIds = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        const itemPrompt = pairs[i].prompt;
        const isSyncCompleted =
          r.status === 'fulfilled' &&
          (r.value?.status === 'completed' || (r.value?.ok && r.value?.task_id && (r.value?.data_uri || r.value?.result)));
        if (isSyncCompleted) {
          const data = r.value;
          const tid = data.task_id;
          if (tid && !completedIdsRef.current.has(tid)) {
            completedIdsRef.current.add(tid);
            const result = data.data_uri || data.result;
            const allImages = data.all_images || (result ? [{ data_uri: result }] : []);
            const completedTask = {
              id: tid,
              prompt: data.prompt || itemPrompt,
              status: 'completed',
              result,
              allImages,
              completedAt: Date.now()
            };
            setCompletedTasks((prev) => {
              if (prev.some((t) => t.id === tid)) return prev;
              return dedupeCompletedById([completedTask, ...prev]).slice(0, 20);
            });
            syncCompleted++;
          }
          if (tid) createdTaskIds.push(tid);
        } else if (r.status === 'rejected') {
          failed++;
          const errMsg = r.reason?.message || 'Generation failed';
          showToast(errMsg, 'error');
          const failId = `fail-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
          completedIdsRef.current.add(failId);
          toAddFailed.push({
            id: failId,
            prompt: itemPrompt,
            status: 'failed',
            error: errMsg,
            completedAt: Date.now()
          });
        } else if (r.status === 'fulfilled' && r.value?.task_id) {
          createdTaskIds.push(r.value.task_id);
        }
      }
      if (createdTaskIds.length > 0) addPendingImageTaskIds(createdTaskIds);
      if (toAddFailed.length > 0) {
        setCompletedTasks((prev) => dedupeCompletedById([...toAddFailed, ...prev]).slice(0, 20));
      }

      await fetchActiveTasks();
      let currentTasksCount = 0;
      try {
        const updatedTasksData = await api.request('/api/image/tasks/active');
        currentTasksCount = updatedTasksData.tasks?.length || 0;
      } catch (_) {}

      if (currentTasksCount === 0 && syncCompleted === 0 && failed === settled.length) {
        setPrompt('');
        setSeed('');
      }
      const totalImages = pairs.length;
      if (failed < settled.length) {
        if (syncCompleted > 0) {
          showToast(syncCompleted === 1 ? 'Image generated!' : `${syncCompleted} images generated!`, 'success');
        } else if (currentTasksCount > 0) {
          showToast(totalImages > 1 ? `Added ${totalImages} to queue!` : 'Added to queue!', 'success');
        } else {
          showToast(totalImages > 1 ? `Started generating ${totalImages} images!` : 'Image generation started!', 'success');
        }
      }
      refreshUser();
      if (currentTasksCount > 0) {
        setTimeout(() => fetchActiveTasks(), 400);
        setTimeout(() => fetchActiveTasks(), 1200);
      }
    }).catch((err) => {
      const msg = err?.message || '';
      const is503 = /503|service unavailable|unavailable/i.test(msg);
      showToast(
        is503 ? 'Image generation unavailable. Add Imaginator/VoidAI/Naga API keys in Admin.' : (msg || 'Generation failed'),
        'error'
      );
    }).finally(() => {
      clearTimeout(releaseTimer);
      setIsGenerating(false);
    });
  };

  const handleDownload = async (task) => {
    let url = task.result || fetchedImageUrls[task.id];
    if (!url) {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${task.id}/image`, {
          headers: api.token ? { Authorization: `Bearer ${api.token}` } : {}
        });
        if (!res.ok) {
          showToast('Image unavailable or expired', 'error');
          return;
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
      } catch (e) {
        showToast(e?.message || 'Download failed', 'error');
        return;
      }
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = `image_${task.id}.png`;
    link.click();
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  };

  const activeTasks = tasks;
  const formatTime = (ms) => {
    if (!ms) return '';
    const date = new Date(ms);
    return date.toLocaleTimeString();
  };

  return (
    <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Image Generation</h3>
          <textarea 
            value={prompt} 
            onChange={(e) => setPrompt(e.target.value)} 
            placeholder="Describe the image you want to generate..."
            rows={6} 
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-black/5" 
          />
          <div className="mt-2 flex justify-between items-center text-xs">
            {(() => {
              const prompts = prompt.trim().split('\n').filter(p => p.trim().length > 0);
              const promptCount = prompts.length || 0;
              const creditsPerImage = modelPricing[model] || 1;
              const totalImages = promptCount * numImages;
              const totalCost = totalImages * creditsPerImage;
              
              if (promptCount === 0) {
                return <span className="text-gray-400">Enter prompt(s) to see cost</span>;
              }
              
              return (
                <>
                  <span className="text-gray-600">
                    {promptCount} prompt{promptCount > 1 ? 's' : ''} × {numImages} image{numImages > 1 ? 's' : ''} = {totalImages} image{totalImages > 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold text-gray-900">
                    Cost: {totalCost} credit{totalCost !== 1 ? 's' : ''}
                  </span>
                </>
              );
            })()}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setAspectRatio('IMAGE_ASPECT_RATIO_LANDSCAPE')}
                  className={`px-3 py-2 text-center rounded-lg border transition-all ${
                    aspectRatio === 'IMAGE_ASPECT_RATIO_LANDSCAPE'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className={`text-sm font-medium ${aspectRatio === 'IMAGE_ASPECT_RATIO_LANDSCAPE' ? 'text-white' : 'text-gray-900'}`}>Landscape</p>
                  <p className={`text-xs ${aspectRatio === 'IMAGE_ASPECT_RATIO_LANDSCAPE' ? 'text-gray-300' : 'text-gray-500'}`}>16:9</p>
                </button>
                <button
                  onClick={() => setAspectRatio('IMAGE_ASPECT_RATIO_PORTRAIT')}
                  className={`px-3 py-2 text-center rounded-lg border transition-all ${
                    aspectRatio === 'IMAGE_ASPECT_RATIO_PORTRAIT'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className={`text-sm font-medium ${aspectRatio === 'IMAGE_ASPECT_RATIO_PORTRAIT' ? 'text-white' : 'text-gray-900'}`}>Portrait</p>
                  <p className={`text-xs ${aspectRatio === 'IMAGE_ASPECT_RATIO_PORTRAIT' ? 'text-gray-300' : 'text-gray-500'}`}>9:16</p>
                </button>
                <button
                  onClick={() => setAspectRatio('IMAGE_ASPECT_RATIO_SQUARE')}
                  className={`px-3 py-2 text-center rounded-lg border transition-all ${
                    aspectRatio === 'IMAGE_ASPECT_RATIO_SQUARE'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className={`text-sm font-medium ${aspectRatio === 'IMAGE_ASPECT_RATIO_SQUARE' ? 'text-white' : 'text-gray-900'}`}>Square</p>
                  <p className={`text-xs ${aspectRatio === 'IMAGE_ASPECT_RATIO_SQUARE' ? 'text-gray-300' : 'text-gray-500'}`}>1:1</p>
                </button>
              </div>
            </div>

            <button onClick={() => setShowModels(!showModels)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ChevronDown className={`w-4 h-4 transition-transform ${showModels ? 'rotate-180' : ''}`} />
              Model
            </button>

            {showModels && (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'IMAGEN_3_5', name: 'Imagen 3.5', desc: 'High quality', defaultCredits: 1 },
                    { id: 'GEM_PIX', name: 'Nano Banana', desc: 'High quality', defaultCredits: 1 },
                    { id: 'GEM_PIX_2', name: 'Nano Banana Pro', desc: 'High quality', defaultCredits: 2 },
                    { id: 'gpt-image-1', name: 'GPT Image 1', desc: 'High quality', defaultCredits: 1 },
                    { id: 'gpt-image-1.5', name: 'GPT Image 1.5', desc: 'High quality', defaultCredits: 1 },
                    { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 (VoidAI)', desc: 'High quality', defaultCredits: 2 },
                    { id: 'flux-kontext-pro', name: 'Flux Kontext Pro', desc: 'VoidAI', defaultCredits: 3 },
                    { id: 'midjourney', name: 'Midjourney', desc: 'VoidAI', defaultCredits: 10 },
                    { id: 'NAGA_DALLE3', name: 'DALL·E 3', desc: 'High quality', defaultCredits: 1 },
                    { id: 'NAGA_FLUX', name: 'Flux Schnell', desc: 'Fast', defaultCredits: 1 }
                  ].map(m => {
                    const cr = modelPricing[m.id] ?? m.defaultCredits ?? 1;
                    const isActive = model === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        className={`px-3 py-2.5 text-center rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5 ${
                          isActive
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <p className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-900'}`}>{m.name}</p>
                        <p className={`text-xs ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>{m.desc}</p>
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium mt-0.5 ${
                          isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {cr} {cr === 1 ? 'credit' : 'credits'}/img
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Image Settings
            </button>
            
            {showAdvanced && (
              <div className="space-y-5 pt-4 border-t border-gray-100">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Number of Images</label>
                    <span className="text-sm text-gray-500">{numImages}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1" 
                    value={numImages} 
                    onChange={(e) => setNumImages(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" 
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Seed (Optional)</label>
                  <Input
                    type="number"
                    placeholder="Leave empty for random"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">Seed for reproducible results</p>
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleGenerate} className="w-full mt-4" size="lg" disabled={isGenerating || !prompt.trim()}>
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
            ) : activeTasks.length > 0 ? (
              <><Plus className="w-4 h-4" /> Add to Queue</>
            ) : (
              <><Image className="w-4 h-4" /> Generate {numImages > 1 ? `${numImages} Images` : 'Image'}</>
            )}
          </Button>
        </Card>
      </div>

      <div className="lg:col-span-1 space-y-6">
        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                {activeTasks.length === 1 ? 'Current Task' : `Queue (${activeTasks.length})`}
              </h3>
              {activeTasks.filter(t => t.status === 'pending' || t.status === 'queued').length > 0 && (
                <button
                  onClick={async () => {
                    const pendingTasks = activeTasks.filter(t => t.status === 'pending' || t.status === 'queued');
                    for (const task of pendingTasks) {
                      try {
                        await api.request(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
                      } catch {}
                    }
                    showToast('Pending tasks cancelled', 'info');
                    fetchActiveTasks();
                    refreshUser();
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Cancel all pending
                </button>
              )}
            </div>
            <div className="space-y-3">
              {activeTasks.map((task, index) => (
                <div key={task.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {task.status === 'processing' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      ) : task.status === 'queued' ? (
                        <Clock className="w-4 h-4 text-orange-500 animate-pulse" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium">
                        {task.status === 'processing' 
                          ? 'Processing...' 
                          : task.status === 'queued' 
                          ? `Queued${task.queue_position ? ` #${task.queue_position}` : ''}` 
                          : task.status === 'pending'
                          ? 'Pending...'
                          : `#${index + 1} ${task.status || 'pending'}`}
                      </span>
                    </div>
                    <button
                      onClick={() => cancelImageTask(task.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Cancel task"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-2">{task.prompt?.slice(0, 50)}</p>
                  {task.status === 'processing' && (
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-black transition-all" style={{ width: `${task.progress || 0}%` }} />
                    </div>
                  )}
                  {(task.status === 'queued' || task.status === 'pending') && (
                    <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 animate-pulse" style={{ width: '100%' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Completed Tasks */}
        <Card className="p-5 min-h-[300px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Recent</h3>
            {completedTasks.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const now = Date.now();
                    const toZip = completedTasks.filter(t => t.status === 'completed' && !(t.completedAt && now > t.completedAt + 12 * 60 * 60 * 1000));
                    if (toZip.length === 0) {
                      showToast('No completed images to download', 'info');
                      return;
                    }
                    try {
                      showToast(`Preparing ${toZip.length} image${toZip.length !== 1 ? 's' : ''}…`, 'info');
                      const JSZip = (await import('jszip')).default;
                      const zip = new JSZip();
                      let count = 0;
                      for (const task of toZip) {
                        const imgSrc = task.result || fetchedImageUrls[task.id];
                        const allImages = task.allImages || (imgSrc ? [{ data_uri: imgSrc, url: imgSrc }] : []);
                        if (allImages.length === 0 && !imgSrc) {
                          try {
                            const res = await fetch(`${API_BASE}/api/jobs/${task.id}/image`, {
                              headers: api.token ? { Authorization: `Bearer ${api.token}` } : {}
                            });
                            if (!res.ok) continue;
                            const blob = await res.blob();
                            zip.file(`image_${task.id}.png`, blob);
                            count++;
                          } catch (_) {}
                          continue;
                        }
                        if (allImages.length > 1) {
                          for (let i = 0; i < allImages.length; i++) {
                            const img = allImages[i];
                            const u = img?.data_uri || img?.url || imgSrc;
                            if (!u) continue;
                            try {
                              const res = await fetch(u);
                              const blob = await res.blob();
                              zip.file(`image_${task.id}_${i + 1}.png`, blob);
                              count++;
                            } catch (_) {}
                          }
                        } else {
                          const u = imgSrc || allImages[0]?.data_uri || allImages[0]?.url;
                          if (!u) continue;
                          try {
                            const res = await fetch(u);
                            const blob = await res.blob();
                            zip.file(`image_${task.id}.png`, blob);
                            count++;
                          } catch (_) {}
                        }
                      }
                      if (count === 0) {
                        showToast('Could not fetch any images', 'error');
                        return;
                      }
                      const blob = await zip.generateAsync({ type: 'blob' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `images_recent_${Date.now()}.zip`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                      showToast(`Downloaded ${count} image${count !== 1 ? 's' : ''}`, 'success');
                    } catch (err) {
                      showToast(err?.message || 'Download failed', 'error');
                    }
                  }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download all
                </button>
                <button
                  onClick={() => {
                    Object.values(fetchedImageUrlsRef.current).forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
                    fetchedImageUrlsRef.current = {};
                    setFetchedImageUrls({});
                    completedIdsRef.current.clear();
                    setCompletedTasks([]);
                  }}
                  className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          {completedTasks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Image className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">No completed images</p>
              <p className="text-xs text-gray-400">Generated images will appear here</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[420px] pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400" style={{ scrollbarGutter: 'stable' }}>
              {completedTasks.slice().reverse().map(task => {
                const expiresAt = task.completedAt ? task.completedAt + (12 * 60 * 60 * 1000) : null;
                const isExpired = expiresAt && Date.now() > expiresAt;
                const timeLeft = expiresAt ? formatTimeRemaining(expiresAt) : null;
                const imgSrc = task.result || fetchedImageUrls[task.id];
                return (
                  <div key={task.id} className={`p-3.5 rounded-xl border transition-shadow hover:shadow-sm ${
                    isExpired ? 'bg-gray-50/80 border-gray-200' :
                    task.status === 'completed' ? 'bg-emerald-50/80 border-emerald-200/60' : 'bg-red-50/80 border-red-200/60'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isExpired ? 'bg-gray-200/60 text-gray-500' :
                        task.status === 'completed' ? 'bg-emerald-200/60 text-emerald-700' :
                        task.status === 'cancelled' ? 'bg-gray-200/60 text-gray-600' : 'bg-red-200/60 text-red-700'
                      }`}>
                        {isExpired ? <Clock className="w-3 h-3" /> : task.status === 'completed' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {isExpired ? 'Expired' : task.status === 'completed' ? 'Ready' : task.status === 'cancelled' ? 'Cancelled' : 'Failed'}
                      </span>
                    </div>
                    {imgSrc && !isExpired && task.status === 'completed' && (
                      <img
                        src={imgSrc}
                        alt={task.prompt}
                        className="w-full aspect-square object-cover rounded-xl border border-gray-200 mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          if (imgSrc) setPreviewImage({
                            src: imgSrc,
                            prompt: task.prompt,
                            allImages: task.allImages || [{ data_uri: imgSrc }],
                            taskId: task.id
                          });
                        }}
                      />
                    )}
                    <p className="text-xs text-gray-700 line-clamp-2 mb-2">{task.prompt}</p>
                    {task.status === 'completed' && !isExpired && timeLeft && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mb-2"><Clock className="w-3 h-3" /> {timeLeft}</p>
                    )}
                    {task.error && <p className="text-xs text-red-600 mb-2">{task.error}</p>}
                    <div className="flex gap-2">
                      {task.status === 'completed' && !isExpired ? (
                        <button
                          onClick={() => handleDownload(task)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 bg-gray-900 text-white rounded-xl text-xs font-medium hover:bg-black transition-all"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                      ) : isExpired ? (
                        <span className="text-xs text-gray-400 flex-1 text-center py-2">Unavailable</span>
                      ) : null}
                      <button
                        onClick={() => {
                          const url = fetchedImageUrlsRef.current[task.id];
                          if (url) {
                            try { URL.revokeObjectURL(url); } catch (_) {}
                            delete fetchedImageUrlsRef.current[task.id];
                            setFetchedImageUrls((prev) => { const n = { ...prev }; delete n[task.id]; return n; });
                          }
                          completedIdsRef.current.delete(task.id);
                          setCompletedTasks(prev => dedupeCompletedById(prev.filter(t => t.id !== task.id)));
                        }}
                        className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <ImagePreviewModal
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        src={previewImage?.src}
        prompt={previewImage?.prompt}
        allImages={previewImage?.allImages}
      />
    </div>
  );
}

// API Keys Tab
function ApiKeysTab({ showToast, user }) {
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.request('/api/user/api-keys');
      setKeys(data.api_keys || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (keys.length >= 5) {
      showToast('Maximum 5 API keys allowed', 'error');
      return;
    }
    try {
      const data = await api.request('/api/user/api-keys', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      setNewKey(data.api_key);
      loadKeys();
      setNewName('');
      setShowCreate(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this API key?')) return;
    try {
      await api.request(`/api/user/api-keys/${id}`, { method: 'DELETE' });
      setKeys(keys.filter(k => k.id !== id));
      showToast('API key deleted', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">API Access</h2>
          <p className="text-sm text-gray-600 mt-1">For programmatic access • {keys.length}/5 keys used</p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={keys.length >= 5} className="bg-black hover:bg-gray-800">
          <Plus className="w-4 h-4" /> Create Key
        </Button>
      </div>

      {newKey && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-emerald-800">API Key Created!</p>
              <p className="text-sm text-emerald-600 mt-1">Copy it now — it won't be shown again.</p>
              <div className="flex items-center gap-2 mt-3">
                <code className="flex-1 px-3 py-2 bg-white rounded-lg text-sm font-mono border border-emerald-200">{newKey.api_key}</code>
                <Button size="sm" onClick={() => { navigator.clipboard.writeText(newKey.api_key); showToast('Copied!', 'success'); }} className="bg-emerald-600 hover:bg-emerald-700">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <button onClick={() => setNewKey(null)}><X className="w-5 h-5 text-emerald-600" /></button>
          </div>
        </Card>
      )}

      {/* API Keys List */}
      <Card className="overflow-hidden border-2 border-gray-200">
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Your Keys</h3>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Key className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium">No API keys yet</p>
            <p className="text-sm text-gray-500 mt-1">Create your first key to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {keys.map(k => (
              <div key={k.id} className="p-5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
                        <Key className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{k.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{k.api_key}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 ml-13">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Active
                      </span>
                      <span>{k.total_requests.toLocaleString()} requests</span>
                      <span>Limit: {k.hourly_limit}/hour</span>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDelete(k.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* API Documentation */}
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="bg-black px-6 py-4 border-b-2 border-gray-200">
          <h3 className="text-xl font-bold text-white">API Documentation</h3>
          <p className="text-gray-300 text-sm mt-1">Complete API reference for voice synthesis</p>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Authentication */}
          <div>
            <h4 className="font-bold text-lg mb-3">Authentication</h4>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Base URL:</p>
              <code className="block bg-white px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono text-gray-800 mb-3">
                {window.location.origin}/api/v1
              </code>
              <p className="text-sm text-gray-600 mb-2">All requests require authentication header:</p>
              <code className="block bg-white px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono text-gray-800">
                X-API-Key: your-api-key-here
              </code>
            </div>
          </div>
          
          {/* Endpoints */}
          <div>
            <h4 className="font-bold text-lg mb-3">API Endpoints</h4>
            <div className="space-y-4">
              
              {/* Create Task */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">POST</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/synthesize</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Create audio generation task</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Request Body:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed mb-3">
{`{
  "text": "Text to synthesize (required)",
  "voice_id": "21m00Tcm4TlvDq8ikWAM (required)",
  "model_id": "eleven_turbo_v2 (optional, default: eleven_multilingual_v2)",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  },
  "speed": 1.0
}`}</pre>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "ok": true,
  "task_id": "abc-123-xyz",
  "status": "processing" | "queued",
  "credits_charged": 1234,
  "message": "Task started"
}`}</pre>
                </div>
              </div>
            
              {/* Get Status */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">GET</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/status/{'{task_id}'}</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Check task status and progress</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "status": "queued" | "processing" | "completed" | "failed",
  "progress": 0-100,
  "queue_position": 1,
  "audio_url": "https://...",
  "error": "error message if failed"
}`}</pre>
                </div>
              </div>

              {/* Download */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">GET</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/download/{'{task_id}'}?format=redirect|json</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Download audio file or get JSON with metadata</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Query Parameters:</p>
                  <ul className="text-xs text-gray-600 space-y-1 mb-3 ml-4">
                    <li>• format=redirect (default) - Redirect to audio URL</li>
                    <li>• format=json - Return JSON with URL and metadata</li>
                  </ul>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response (format=json):</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "ok": true,
  "task_id": "abc-123",
  "status": "completed",
  "audio_url": "https://...",
  "char_count": 1234,
  "credits_charged": 1234,
  "model": "eleven_turbo_v2",
  "created_at": 1234567890,
  "completed_at": 1234567900,
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "duration_ms": 5000
}`}</pre>
                </div>
              </div>

              {/* Cancel Task */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">DELETE</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/tasks/{'{task_id}'}</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Cancel task and refund credits</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "ok": true,
  "message": "Task cancelled successfully",
  "credits_refunded": 1234
}`}</pre>
                </div>
              </div>

              {/* List Tasks */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">GET</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/tasks?status=completed&limit=20</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">List your tasks with optional filters</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Query Parameters:</p>
                  <ul className="text-xs text-gray-600 space-y-1 mb-3 ml-4">
                    <li>• status: Filter by status (processing, queued, completed, failed)</li>
                    <li>• limit: Max results (default 20, max 100)</li>
                  </ul>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "ok": true,
  "tasks": [
    {
      "id": "task-id",
      "status": "completed",
      "created_at": 1234567890,
      "credits_charged": 1234,
      "char_count": 1234,
      "model": "eleven_turbo_v2"
    }
  ]
}`}</pre>
                </div>
              </div>

              {/* Get Balance */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">GET</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/balance</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Get credit balance and packages</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "ok": true,
  "total_credits": 5000000,
  "concurrent_slots": ${user?.concurrent_slots || 1},
  "packages": [
    {
      "id": "pkg-id",
      "credits": 1000000,
      "expires_at": 1234567890,
      "days_remaining": 25
    }
  ]
}`}</pre>
                </div>
              </div>

              {/* List Voices */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded">GET</span>
                    <code className="text-sm font-mono font-semibold text-gray-900">/voices?page=1&limit=20</code>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Get list of available voices</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                  <pre className="p-3 bg-gray-50 rounded border border-gray-200 overflow-x-auto text-xs leading-relaxed">
{`{
  "ok": true,
  "voices": [
    {
      "voice_id": "21m00Tcm4TlvDq8ikWAM",
      "name": "Rachel",
      "category": "premade"
    }
  ],
  "has_more": true
}`}</pre>
                </div>
              </div>
            </div>
          </div>
          
          {/* Voice Settings */}
          <div>
            <h4 className="font-bold text-lg mb-3">Voice Settings Parameters</h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Parameter</th>
                    <th className="px-4 py-3 text-left font-semibold">Range</th>
                    <th className="px-4 py-3 text-left font-semibold">Default</th>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">stability</td>
                    <td className="px-4 py-3 text-gray-600">0.0 - 1.0</td>
                    <td className="px-4 py-3 text-gray-600">0.5</td>
                    <td className="px-4 py-3 text-gray-600">Higher values make output more consistent</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">similarity_boost</td>
                    <td className="px-4 py-3 text-gray-600">0.0 - 1.0</td>
                    <td className="px-4 py-3 text-gray-600">0.75</td>
                    <td className="px-4 py-3 text-gray-600">Higher values boost voice similarity</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">style</td>
                    <td className="px-4 py-3 text-gray-600">0.0 - 1.0</td>
                    <td className="px-4 py-3 text-gray-600">0.0</td>
                    <td className="px-4 py-3 text-gray-600">Style exaggeration amount</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">use_speaker_boost</td>
                    <td className="px-4 py-3 text-gray-600">boolean</td>
                    <td className="px-4 py-3 text-gray-600">true</td>
                    <td className="px-4 py-3 text-gray-600">Boost speaker clarity</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">speed</td>
                    <td className="px-4 py-3 text-gray-600">0.25 - 4.0</td>
                    <td className="px-4 py-3 text-gray-600">1.0</td>
                    <td className="px-4 py-3 text-gray-600">Playback speed multiplier</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Available Models */}
          <div>
            <h4 className="font-bold text-lg mb-3">Available Models</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-lg p-4">
                <code className="text-sm font-semibold text-gray-900">eleven_turbo_v2</code>
                <p className="text-xs text-gray-600 mt-1">Fastest model, good quality</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <code className="text-sm font-semibold text-gray-900">eleven_turbo_v2_5</code>
                <p className="text-xs text-gray-600 mt-1">Enhanced turbo version</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <code className="text-sm font-semibold text-gray-900">eleven_multilingual_v2</code>
                <p className="text-xs text-gray-600 mt-1">Supports multiple languages</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <code className="text-sm font-semibold text-gray-900">eleven_monolingual_v1</code>
                <p className="text-xs text-gray-600 mt-1">English only, high quality</p>
              </div>
            </div>
          </div>

          {/* Example Code */}
          <div>
            <h4 className="font-bold text-lg mb-3">Quick Start Examples</h4>
            <div className="bg-black rounded-lg p-5 border-2 border-gray-800">
              <pre className="text-xs text-gray-300 font-mono leading-relaxed overflow-x-auto">
{`# 1. Create task
curl -X POST ${window.location.origin}/api/v1/synthesize \\
  -H "X-API-Key: your-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Hello world",
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "model_id": "eleven_turbo_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }'

# Response: {"task_id": "abc-123", "status": "processing"}

# 2. Check status
curl ${window.location.origin}/api/v1/status/abc-123 \\
  -H "X-API-Key: your-key-here"

# 3. Check balance
curl ${window.location.origin}/api/v1/balance \\
  -H "X-API-Key: your-key-here"

# 4. List tasks
curl ${window.location.origin}/api/v1/tasks?status=completed \\
  -H "X-API-Key: your-key-here"

# 5. Download audio (redirect)
curl ${window.location.origin}/api/v1/download/abc-123 \\
  -H "X-API-Key: your-key-here" -o audio.mp3

# 6. Get audio metadata (JSON)
curl ${window.location.origin}/api/v1/download/abc-123?format=json \\
  -H "X-API-Key: your-key-here"

# 7. Cancel task
curl -X DELETE ${window.location.origin}/api/v1/tasks/abc-123 \\
  -H "X-API-Key: your-key-here"`}</pre>
            </div>
          </div>

          {/* Features & Limits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-bold text-gray-900 mb-3">Features</p>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Same credit system as web interface</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Automatic task queueing (FIFO)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Credit refunds on cancellation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Real-time progress tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>All voice models supported</span>
                </li>
              </ul>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="font-bold text-gray-900 mb-3">Rate Limits</p>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  <span><strong>100</strong> requests per hour per key</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  <span><strong>{user?.concurrent_slots || 1}</strong> concurrent task{(user?.concurrent_slots || 1) > 1 ? 's' : ''} (your current limit)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  <span>Max <strong>100</strong> tasks per list call</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  <span><strong>12 hours</strong> task expiration</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  <span>Max <strong>5</strong> API keys per account</span>
                </li>
              </ul>
            </div>
          </div>
          
          {/* Error Codes */}
          <div>
            <h4 className="font-bold text-lg mb-3">HTTP Status Codes</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border-2 border-red-200 rounded-lg p-3 bg-white">
                <code className="text-lg font-bold text-red-600">401</code>
                <p className="text-xs text-gray-600 mt-1">Invalid or missing API key</p>
              </div>
              <div className="border-2 border-red-200 rounded-lg p-3 bg-white">
                <code className="text-lg font-bold text-red-600">402</code>
                <p className="text-xs text-gray-600 mt-1">Insufficient credits</p>
              </div>
              <div className="border-2 border-red-200 rounded-lg p-3 bg-white">
                <code className="text-lg font-bold text-red-600">429</code>
                <p className="text-xs text-gray-600 mt-1">Rate limit exceeded</p>
              </div>
              <div className="border-2 border-red-200 rounded-lg p-3 bg-white">
                <code className="text-lg font-bold text-red-600">503</code>
                <p className="text-xs text-gray-600 mt-1">Service unavailable</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for Create Key */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create API Key">
        <div className="space-y-4">
          <Input label="Name" placeholder="My API Key" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Pricing Tab
function PricingTab({ showToast, user }) {
  const [selectedCredits, setSelectedCredits] = useState(1000000);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [loading, setLoading] = useState(false);

  // Price tiers based on credits  
  const priceTiers = [
    { credits: 1000000, price: 5.00, savings: 60 },
    { credits: 3000000, price: 12.00, savings: 68 },
    { credits: 5000000, price: 18.00, savings: 71 },
    { credits: 10000000, price: 32.00, savings: 74.4 },
    { credits: 15000000, price: 45.00, savings: 76 },
    { credits: 30000000, price: 84.00, savings: 77.6 },
  ];

  // Duration options
  const durationOptions = [
    { days: 30, label: '1 Month', priceMultiplier: 1.0 },
    { days: 60, label: '2 Months', priceMultiplier: 1.15 },
    { days: 90, label: '3 Months', priceMultiplier: 1.30 },
  ];

  // Calculate usage estimates based on credits
  const calculateUsage = (credits) => {
    if (credits === -1) return null;
    return {
      ttsMinutes: Math.round(credits / 1000), // 1,000 chars = 1 minute
    };
  };

  const selectedTier = priceTiers.find(t => t.credits === selectedCredits) || priceTiers[0];
  const durationMultiplier = durationOptions.find(d => d.days === selectedDuration)?.priceMultiplier || 1.0;
  const finalPrice = selectedTier.price * durationMultiplier;
  const usage = calculateUsage(selectedCredits);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Paid tier */}
        <Card className="p-6 bg-white">
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-gray-900" />
            <h2 className="text-xl font-semibold text-gray-900">Paid tier</h2>
          </div>

          {/* Credits Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">Select Credits Amount</label>
            <div className="grid grid-cols-2 gap-3">
              {priceTiers.map(tier => (
                <button
                  key={tier.credits}
                  onClick={() => setSelectedCredits(tier.credits)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedCredits === tier.credits
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-300 bg-white hover:border-gray-900'
                  }`}
                >
                  <div className="font-bold text-gray-900">{(tier.credits / 1000000).toFixed(tier.credits < 1000000 ? 1 : 0)}M</div>
                  <div className="text-sm text-gray-600">${tier.price.toFixed(2)}</div>
                  {tier.savings > 0 && (
                    <div className="text-xs text-emerald-600 font-medium mt-1">
                      Save {tier.savings}%
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">Select validity period</label>
            <div className="grid grid-cols-3 gap-3">
              {durationOptions.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => setSelectedDuration(opt.days)}
                  className={`px-4 py-3 rounded-lg border-2 font-semibold text-sm transition-all ${
                    selectedDuration === opt.days
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Credits:</span>
              <span className="font-bold text-gray-900">{selectedCredits.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Duration:</span>
              <span className="font-medium text-gray-900">{selectedDuration} days</span>
            </div>
            {usage && usage.ttsMinutes > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">TTS Time:</span>
                <span className="font-medium text-gray-900">≈ {usage.ttsMinutes.toLocaleString()} min</span>
              </div>
            )}
            {selectedTier.savings > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm text-emerald-600 font-medium">Savings:</span>
                <span className="font-bold text-emerald-600">{selectedTier.savings}%</span>
              </div>
            )}
          </div>

          {/* Price Display */}
          <div className="mb-6 text-center">
            <div className="text-4xl font-bold text-gray-900 mb-1">
              ${finalPrice.toFixed(2)}
            </div>
            <div className="text-sm text-gray-500">
              Total price
            </div>
          </div>

          {/* Payment Button */}
          <div>
            <button
              onClick={() => showToast('Payment integration coming soon', 'info')}
              className="w-full py-3.5 rounded-lg font-semibold text-base bg-black hover:bg-gray-900 text-white transition-colors shadow-lg"
            >
              Proceed to Payment
            </button>
          </div>
        </Card>

        {/* Right Panel: Your Credits */}
        <Card className="p-6 bg-white">
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-gray-900" />
            <h2 className="text-xl font-semibold text-gray-900">Your Credits</h2>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Total Available</label>
            <div className="text-3xl font-bold text-gray-900">
              {(user?.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0) || 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">credits</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Credit packages</label>
            {user?.credit_packages && user.credit_packages.length > 0 ? (
              <div className="space-y-2">
                {user.credit_packages.map(pkg => {
                  const expiresDate = new Date(pkg.expires_at_ms);
                  const daysLeft = Math.ceil((pkg.expires_at_ms - Date.now()) / (24 * 60 * 60 * 1000));
                  return (
                    <div key={pkg.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {pkg.credits_remaining.toLocaleString()} credits
                        </div>
                        <div className={`text-xs px-2 py-0.5 rounded-full ${daysLeft <= 7 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {daysLeft}d left
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Expires: {expiresDate.toLocaleDateString()}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Used: {(pkg.credits_initial - pkg.credits_remaining).toLocaleString()} / {pkg.credits_initial.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500 py-4 text-center">
                No active credit packages
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Admin Login Screen
function AdminLoginScreen({ onLogin, showToast }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!token.trim()) {
      showToast('Please enter admin token', 'warning');
      return;
    }
    
    setLoading(true);
    try {
      // Test the token by making an admin request
      const response = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { 'X-Admin-Token': token.trim() }
      });
      
      if (!response.ok) {
        throw new Error('Invalid admin token');
      }
      
      api.setAdminToken(token.trim());
      onLogin();
      showToast('Welcome to Admin Panel', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Admin Panel</h1>
            <p className="text-sm text-gray-500">FiftyFive Labs</p>
          </div>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Admin Token</label>
            <input
              type="password"
              placeholder="Enter admin token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/5"
              required
            />
          </div>
          <Button type="submit" loading={loading} className="w-full" size="lg">
            <Lock className="w-4 h-4" /> Access Admin Panel
          </Button>
        </form>
        
        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700">← Back to main app</a>
        </div>
      </Card>
    </div>
  );
}

// Admin Panel (Standalone)
function AdminPanelPage({ showToast, onLogout }) {
  const [adminTab, setAdminTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [realtimeStats, setRealtimeStats] = useState(null);
  const [activeTasks, setActiveTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskLog, setTaskLog] = useState([]);
  const [activityView, setActivityView] = useState('tasks'); // tasks | user_logs | system_logs | referrals
  const [eventLogs, setEventLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyData, setNewKeyData] = useState({ name: '', api_key: '', provider: 'voicer', hourly_limit: 2000, concurrent_limit: 10 });
  const [editUser, setEditUser] = useState(null);
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [packageData, setPackageData] = useState({ credits: 15000000, duration_days: 30 });
  const [editingPackage, setEditingPackage] = useState(null);
  
  // Plans management
  const [plans, setPlans] = useState([]);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [newPlanData, setNewPlanData] = useState({
    id: '',
    title: '',
    subtitle: '',
    price_usd: 0,
    credits: 10000,
    duration_days: 30,
    description: '',
    features: [''],
    popular: false,
    is_active: true,
    sort_order: 0
  });

  // Model pricing management
  const [modelPricing, setModelPricing] = useState([]);
  const [editingModel, setEditingModel] = useState(null);

  // Load stats
  useEffect(() => {
    if (adminTab === 'stats') {
      api.request('/api/admin/stats', { admin: true }).then(data => setStats(data.stats)).catch(err => showToast(err.message, 'error'));
    }
  }, [adminTab, showToast]);

  // Real-time stats and active tasks polling - INSTANT DISPLAY + BACKGROUND UPDATES
  useEffect(() => {
    // Only poll if on stats or tasks tab
    if (adminTab !== 'stats' && adminTab !== 'tasks') {
      return;
    }
    
    const loadRealtime = async () => {
      try {
        const data = await api.request('/api/admin/realtime-stats', { admin: true });
        setRealtimeStats(data);
      } catch {}
      
      try {
        setLoadingTasks(true);
        const data = await api.request('/api/admin/active-tasks', { admin: true });
        const tasks = data.tasks || [];
        
        // MERGE з існуючими tasks - ЗБЕРІГАЄМО ПРОГРЕС! (no jumps!)
        setActiveTasks(prevTasks => {
          // Якщо немає попередніх - просто встановлюємо нові
          if (prevTasks.length === 0) {
            return tasks;
          }
          
          // Merge: зберігаємо прогрес з попередніх tasks
          return tasks.map(newTask => {
            const oldTask = prevTasks.find(t => t.id === newTask.id);
            if (oldTask && oldTask.status === 'processing' && newTask.status === 'processing') {
              // ЗБЕРІГАЄМО існуючий прогрес (не скидаємо до 0!)
              return { 
                ...newTask, 
                progress: Math.max(oldTask.progress || 0, newTask.progress || 0) // Беремо MAX!
              };
            }
            return newTask;
          });
        });
        setLoadingTasks(false);
        
        // Для processing задач - оновлюємо прогрес В ФОНІ (асинхронно)
        const processingTasks = tasks.filter(t => t.status === 'processing');
        
        if (processingTasks.length > 0) {
          const statusEndpoint = (t) => (t.type === 'image' ? '/api/image/status/' : '/api/voice/status/') + t.id;
          Promise.allSettled(
            processingTasks.map(async (task) => {
              try {
                const statusData = await api.request(statusEndpoint(task));
                return { id: task.id, progress: statusData.progress || 0, success: true };
              } catch {
                return { id: task.id, progress: task.progress || 0, success: false };
              }
            })
          ).then(progressUpdates => {
            // Оновлюємо tasks з новим прогресом (коли готово)
            setActiveTasks(prevTasks => {
              return prevTasks.map(task => {
                if (task.status !== 'processing') return task;
                
                const update = progressUpdates.find(
                  r => r.status === 'fulfilled' && r.value.id === task.id && r.value.success
                );
                
                if (update && update.value) {
                  // ТІЛЬКИ ЗБІЛЬШУЄМО прогрес, НІКОЛИ не зменшуємо!
                  const newProgress = update.value.progress;
                  const oldProgress = task.progress || 0;
                  return { 
                    ...task, 
                    progress: Math.max(newProgress, oldProgress) // Завжди беремо MAX!
                  };
                }
                return task;
              });
            });
          });
        }
      } catch {}
    };
    
    // ⚡ МИТТЄВЕ ЗАВАНТАЖЕННЯ при відкритті вкладки
    loadRealtime();
    
    // ШВИДШИЙ polling: 2sec if processing tasks, 5sec if only queued, 15sec if none
    const processingCount = activeTasks.filter(t => t.status === 'processing').length;
    const interval = processingCount > 0 ? 2000 : (activeTasks.length > 0 ? 5000 : 15000);
    const timer = setInterval(loadRealtime, interval);
    return () => clearInterval(timer);
  }, [adminTab, activeTasks.length, activeTasks.filter(t => t.status === 'processing').length]);

  // Load users
  const loadUsers = useCallback(async () => {
    try {
      const data = await api.request(`/api/admin/users?page=${userPage}&limit=20${searchQuery ? `&search=${searchQuery}` : ''}`, { admin: true });
      // Load credit packages for each user
      const usersWithPackages = await Promise.all(
        (data.users || []).map(async (user) => {
          try {
            const pkgData = await api.request(`/api/admin/users/${user.id}/packages`, { admin: true });
            return { ...user, credit_packages: pkgData.packages || [] };
          } catch {
            return { ...user, credit_packages: [] };
          }
        })
      );
      setUsers(usersWithPackages);
      setUserTotal(data.total || 0);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [userPage, searchQuery, showToast]);

  useEffect(() => {
    if (adminTab === 'users') loadUsers();
  }, [adminTab, loadUsers]);

  // Load task log
  const loadTaskLog = useCallback(async () => {
    try {
      const data = await api.request('/api/admin/task-log?limit=200', { admin: true });
      // Filter only actual tasks (not events)
      const tasks = (data.tasks || []).filter(t => t.type === 'task');
      setTaskLog(tasks);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);

  const loadEventLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (activityView === 'user_logs') params.set('scope', 'user');
      if (activityView === 'system_logs') params.set('scope', 'system');
      if (activityView === 'referrals') params.set('event_type', 'referral_signup,referral_bonus');
      const data = await api.request(`/api/admin/logs?${params.toString()}`, { admin: true });
      setEventLogs(data.logs || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [activityView, showToast]);

  useEffect(() => {
    if (adminTab !== 'log') return;
    if (activityView === 'tasks') loadTaskLog();
    else loadEventLogs();
  }, [adminTab, activityView, loadTaskLog, loadEventLogs]);

  // Load API keys
  const loadApiKeys = useCallback(async () => {
    try {
      const data = await api.request('/api/admin/api-keys', { admin: true });
      setApiKeys(data.api_keys || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (adminTab === 'keys') loadApiKeys();
  }, [adminTab, loadApiKeys]);

  // Load model pricing
  const loadModelPricing = useCallback(async () => {
    try {
      const data = await api.request('/api/admin/model-pricing', { admin: true });
      setModelPricing(data.pricing || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (adminTab === 'pricing') loadModelPricing();
  }, [adminTab, loadModelPricing]);

  // Update model pricing
  const handleUpdateModelPricing = async (modelId, creditsPerImage) => {
    try {
      await api.request(`/api/admin/model-pricing/${modelId}`, { 
        admin: true, 
        method: 'PATCH', 
        body: JSON.stringify({ credits_per_image: creditsPerImage }) 
      });
      showToast('Pricing updated', 'success');
      loadModelPricing();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Create API key
  const handleCreateKey = async () => {
    try {
      // Ensure provider is explicitly set
      const keyData = {
        ...newKeyData,
        provider: newKeyData.provider || 'voicer'
      };
      const response = await api.request('/api/admin/api-keys', { admin: true, method: 'POST', body: JSON.stringify(keyData) });
      showToast('API key created', 'success');
      setShowAddKey(false);
      setNewKeyData({ name: '', api_key: '', provider: 'voicer', hourly_limit: 2000, concurrent_limit: 10 });
      loadApiKeys();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Update API key
  const handleUpdateKey = async (id, data) => {
    try {
      await api.request(`/api/admin/api-keys/${id}`, { admin: true, method: 'PATCH', body: JSON.stringify(data) });
      showToast('Updated', 'success');
      loadApiKeys();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete API key
  const handleDeleteKey = async (id) => {
    if (!confirm('Delete this API key?')) return;
    try {
      await api.request(`/api/admin/api-keys/${id}`, { admin: true, method: 'DELETE' });
      showToast('Deleted', 'success');
      loadApiKeys();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Update user
  const handleUpdateUser = async () => {
    if (!editUser) return;
    try {
      await api.request(`/api/admin/users/${editUser.id}`, { admin: true, method: 'PATCH', body: JSON.stringify({
        credits_balance: editUser.credits_balance,
        concurrent_slots: editUser.concurrent_slots,
        image_concurrent_slots: editUser.image_concurrent_slots,
        is_active: editUser.is_active
      }) });
      showToast('User updated', 'success');
      setEditUser(null);
      loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddPackage = async () => {
    try {
      const credits = parseInt(packageData.credits);
      const days = parseInt(packageData.duration_days);
      
      if (credits < 1000000 || credits > 30000000) {
        showToast('Credits must be between 1M and 30M', 'error');
        return;
      }
      
      if (![30, 60, 90].includes(days)) {
        showToast('Duration must be 30, 60, or 90 days', 'error');
        return;
      }
      
      await api.request(`/api/admin/users/${editUser.id}/packages`, {
        method: 'POST',
        admin: true,
        body: JSON.stringify({ credits, duration_days: days, source: 'admin' })
      });
      showToast('Package added successfully', 'success');
      setShowAddPackage(false);
      setPackageData({ credits: 15000000, duration_days: 30 });
      
      // Reload packages
      const response = await api.request(`/api/admin/users/${editUser.id}/packages`, { admin: true });
      setEditUser({ ...editUser, credit_packages: response.packages || [] });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdatePackage = async () => {
    try {
      const credits = parseInt(packageData.credits);
      const days = parseInt(packageData.duration_days);
      
      if (credits < 0 || credits > editingPackage.credits_initial) {
        showToast('Invalid credits amount', 'error');
        return;
      }
      
      if (![30, 60, 90].includes(days)) {
        showToast('Duration must be 30, 60, or 90 days', 'error');
        return;
      }
      
      await api.request(`/api/admin/users/${editUser.id}/packages/${editingPackage.id}`, {
        method: 'PATCH',
        admin: true,
        body: JSON.stringify({ 
          credits_remaining: credits,
          duration_days: days 
        })
      });
      showToast('Package updated successfully', 'success');
      setEditingPackage(null);
      
      // Reload packages
      const response = await api.request(`/api/admin/users/${editUser.id}/packages`, { admin: true });
      setEditUser({ ...editUser, credit_packages: response.packages || [] });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePackage = async (packageId) => {
    try {
      await api.request(`/api/admin/users/${editUser.id}/packages/${packageId}`, {
        method: 'DELETE',
        admin: true
      });
      showToast('Package deleted', 'success');
      
      // Reload packages
      const response = await api.request(`/api/admin/users/${editUser.id}/packages`, { admin: true });
      setEditUser({ ...editUser, credit_packages: response.packages || [] });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Load plans
  const loadPlans = useCallback(async () => {
    try {
      const data = await api.request('/api/admin/plans', { admin: true });
      setPlans(data.plans || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);


  useEffect(() => {
    if (editUser && plans.length === 0) loadPlans();
  }, [editUser, plans.length, loadPlans]);

  // Create plan
  const handleCreatePlan = async () => {
    try {
      const planData = {
        ...newPlanData,
        features: newPlanData.features.filter(f => f.trim())
      };
      await api.request('/api/admin/plans', { admin: true, method: 'POST', body: JSON.stringify(planData) });
      showToast('Plan created', 'success');
      setShowAddPlan(false);
      setNewPlanData({
        id: '',
        title: '',
        subtitle: '',
        price_usd: 0,
        credits: 10000,
        duration_days: 30,
        description: '',
        features: [''],
        popular: false,
        is_active: true,
        sort_order: 0
      });
      loadPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Update plan
  const handleUpdatePlan = async () => {
    if (!editPlan) return;
    try {
      const planData = {
        ...editPlan,
        features: editPlan.features.filter(f => f.trim())
      };
      await api.request(`/api/admin/plans/${editPlan.id}`, { admin: true, method: 'PATCH', body: JSON.stringify(planData) });
      showToast('Plan updated', 'success');
      setEditPlan(null);
      loadPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete plan
  const handleDeletePlan = async (id) => {
    if (!confirm('Delete this plan?')) return;
    try {
      await api.request(`/api/admin/plans/${id}`, { admin: true, method: 'DELETE' });
      showToast('Plan deleted', 'success');
      loadPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleLogoutAdmin = () => {
    api.setAdminToken(null);
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-semibold">Admin Panel</span>
            </div>
            <div className="flex items-center gap-3">
              <a href="/" className="text-sm text-gray-500 hover:text-gray-700">← Main App</a>
              <Button variant="ghost" size="sm" onClick={handleLogoutAdmin}>
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[{ id: 'stats', label: 'Dashboard', icon: BarChart3 },
            { id: 'tasks', label: 'Active Tasks', icon: Activity },
            { id: 'log', label: 'Task Log', icon: History },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'keys', label: 'API Keys', icon: Key },
            { id: 'pricing', label: 'Model Pricing', icon: CreditCard }].map(t => (
            <button 
              key={t.id} 
              onClick={() => setAdminTab(t.id)}
              onMouseEnter={async () => {
                // ⚡ PRELOAD Active Tasks при hover на вкладку
                if (t.id === 'tasks' && adminTab !== 'tasks') {
                  try {
                    const data = await api.request('/api/admin/active-tasks', { admin: true });
                    setActiveTasks(data.tasks || []);
                  } catch {}
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${adminTab === t.id ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Stats Tab */}
        {adminTab === 'stats' && stats && (
          <div className="space-y-6">
            {/* Main Stats Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[{ label: 'Total Users', value: stats.users?.total, icon: Users, color: 'bg-blue-100 text-blue-600' },
                { label: 'Active 24h', value: stats.users?.active_24h, icon: Activity, color: 'bg-emerald-100 text-emerald-600' },
                { label: 'Total Jobs', value: stats.jobs?.total, icon: BarChart3, color: 'bg-purple-100 text-purple-600' },
                { label: 'Jobs 24h', value: stats.jobs?.last_24h, icon: Zap, color: 'bg-amber-100 text-amber-600' }].map((s, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}><s.icon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-2xl font-bold">{s.value?.toLocaleString() || 0}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            
            {/* Characters & Tasks Stats */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500 text-white"><Volume2 className="w-5 h-5" /></div>
                  <div>
                    <p className="text-2xl font-bold text-purple-900">{(stats.jobs?.characters_today || 0).toLocaleString()}</p>
                    <p className="text-xs text-purple-600">Characters Today</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-100 text-cyan-600"><Volume2 className="w-5 h-5" /></div>
                  <div>
                    <p className="text-2xl font-bold">{(stats.jobs?.total_characters || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Total Characters</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-100 text-green-600"><Check className="w-5 h-5" /></div>
                  <div>
                    <p className="text-2xl font-bold">{stats.jobs?.completed?.toLocaleString() || 0}</p>
                    <p className="text-xs text-gray-500">Completed</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-100 text-rose-600"><AlertCircle className="w-5 h-5" /></div>
                  <div>
                    <p className="text-2xl font-bold">{stats.jobs?.failed?.toLocaleString() || 0}</p>
                    <p className="text-xs text-gray-500">Failed Tasks</p>
                  </div>
                </div>
              </Card>
            </div>
            
            {/* Usage Chart */}
            <UsageChart stats={{ ...stats, __mode: 'admin' }} />
            
            {/* Quick Stats */}
            {realtimeStats && (
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    <span className="font-medium">Active Tasks: {realtimeStats.voicer_total_concurrent || 0}</span>
                  </div>
                  <button 
                    onClick={() => setAdminTab('tasks')}
                    onMouseEnter={async () => {
                      // ⚡ PRELOAD при hover - ще швидше!
                      if (adminTab !== 'tasks') {
                        try {
                          const data = await api.request('/api/admin/active-tasks', { admin: true });
                          setActiveTasks(data.tasks || []);
                        } catch {}
                      }
                    }}
                    className="text-sm text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    View Details →
                  </button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Active Tasks Tab */}
        {adminTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-medium">Active Tasks</h3>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-sm rounded-full font-medium">
                  {activeTasks.length} active
                </span>
                {realtimeStats && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                    {realtimeStats.voicer_total_concurrent || 0} slots
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {realtimeStats && realtimeStats.voicer_total_concurrent > 0 && activeTasks.length === 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    ⚠️ Slots stuck!
                  </span>
                )}
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={async () => {
                    try {
                      const result = await api.request('/api/admin/sync-concurrent', { admin: true, method: 'POST' });
                      showToast(`Synced: ${result.processing_jobs} jobs`, 'success');
                    } catch (err) {
                      showToast(err.message, 'error');
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3" /> Sync
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-red-500 hover:bg-red-50"
                  onClick={async () => {
                    if (!confirm('Reset all concurrent slots? This will clear ALL slot counters.')) return;
                    try {
                      await api.request('/api/admin/reset-concurrent', { admin: true, method: 'POST' });
                      showToast('All slots reset', 'success');
                    } catch (err) {
                      showToast(err.message, 'error');
                    }
                  }}
                >
                  <X className="w-3 h-3" /> Reset Slots
                </Button>
              </div>
            </div>
            
            
            {loadingTasks && activeTasks.length === 0 ? (
              <Card className="p-8 text-center">
                <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-3 animate-spin" />
                <p className="text-gray-500">Loading tasks...</p>
              </Card>
            ) : activeTasks.length === 0 ? (
              <Card className="p-8 text-center">
                <Activity className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500">No active tasks</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {activeTasks.map(task => (
                  <Card key={task.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="font-medium text-sm">{task.nickname || 'Unknown'}</span>
                          {task.email && <span className="text-xs text-gray-400">{task.email}</span>}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{task.prompt}</p>
                        <div className="flex flex-wrap gap-2 text-xs mb-2">
                          <span className="px-2 py-0.5 bg-gray-100 rounded">{task.model}</span>
                          <span className="px-2 py-0.5 bg-gray-100 rounded">{task.credits_charged?.toLocaleString()} credits</span>
                          {task.api_key_name && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{task.api_key_name}</span>
                          )}
                        </div>
                        
                        {/* Progress bar */}
                        {(task.status === 'processing' || task.status === 'pending') && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>{task.status === 'processing' ? 'Processing' : 'Pending'}</span>
                              <span>{task.progress || 0}%</span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-300" 
                                style={{ width: `${task.progress || 0}%` }} 
                              />
                            </div>
                          </div>
                        )}
                        {task.status === 'queued' && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>In queue</span>
                              <span>Position: {task.queue_position || '?'}</span>
                            </div>
                            <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 animate-pulse" style={{ width: '100%' }} />
                            </div>
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-400">
                          Started {new Date(task.created_at_ms).toLocaleString()}
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm('Cancel this task and refund credits?')) return;
                          try {
                            await api.request(`/api/admin/tasks/${task.id}/cancel`, { admin: true, method: 'POST' });
                            showToast('Task cancelled', 'success');
                          } catch (err) {
                            showToast(err.message, 'error');
                          }
                        }}
                      >
                        <X className="w-4 h-4" /> Cancel
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            
            {/* API Key Slots Summary */}
            {realtimeStats && realtimeStats.api_keys?.length > 0 && (
              <Card className="p-4">
                <h4 className="font-medium text-sm mb-3">API Key Slots</h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {realtimeStats.api_keys.map(k => (
                    <div key={k.key_id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{k.name}</span>
                        <span className={`text-sm font-medium ${k.current_concurrent > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {k.current_concurrent}/{k.concurrent_limit}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${k.current_concurrent > 0 ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          style={{ width: `${Math.min(100, (k.current_concurrent / k.concurrent_limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            
            {/* Active Users Summary */}
            {realtimeStats && realtimeStats.users?.length > 0 && (
              <Card className="p-4">
                <h4 className="font-medium text-sm mb-3">Active Users ({realtimeStats.users.length})</h4>
                <div className="space-y-2">
                  {realtimeStats.users.map(u => (
                    <div key={u.user_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="font-medium text-sm">{u.nickname}</span>
                      <span className="text-sm text-gray-500">{u.current_concurrent}/{u.concurrent_limit} tasks</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Task Log Tab */}
        {adminTab === 'log' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Activity Log</h3>
                <p className="text-sm text-gray-500">Recent activity (tasks & events)</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                  {[
                    { id: 'tasks', label: 'Tasks & events' },
                    { id: 'user_logs', label: 'User logs' },
                    { id: 'system_logs', label: 'System logs' },
                    { id: 'referrals', label: 'Referrals' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActivityView(t.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        activityView === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={activityView === 'tasks' ? loadTaskLog : loadEventLogs}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {activityView === 'tasks' ? (
              taskLog.length === 0 ? (
                <Card className="p-8 text-center">
                  <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500">No activity yet</p>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Details</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Credits</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Model</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Voice ID</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taskLog.filter(t => t.type === 'task').slice(0, 20).map((task, idx) => {
                          // Parse metadata to get voice_id and model
                          let metadata = {};
                          try {
                            metadata = typeof task.metadata_json === 'string' 
                              ? JSON.parse(task.metadata_json) 
                              : task.metadata_json || {};
                          } catch (e) {
                            metadata = {};
                          }
                          
                          return (
                            <tr key={task.id || idx} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                  task.status === 'failed' ? 'bg-red-100 text-red-700' :
                                  task.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                  task.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  task.status === 'queued' ? 'bg-purple-100 text-purple-700' :
                                  task.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {task.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="font-medium text-sm">{task.user_nickname}</span>
                              </td>
                              <td className="px-4 py-2.5 max-w-[200px] truncate text-gray-600 text-xs" title={task.prompt}>
                                {task.prompt || '-'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">
                                {task.char_count ? task.char_count.toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">
                                {task.model || metadata.model_id || '-'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs" title={metadata.voice_id || ''}>
                                {metadata.voice_id ? metadata.voice_id.slice(0, 12) + '...' : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">
                                {task.created_at_ms ? new Date(task.created_at_ms).toLocaleString() : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {taskLog.length > 20 && (
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-500">
                      Showing 20 of {taskLog.length} entries
                    </div>
                  )}
                </Card>
              )
            ) : (
              eventLogs.length === 0 ? (
                <Card className="p-8 text-center">
                  <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500">No logs yet</p>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Level</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Message</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventLogs.slice(0, 50).map((l) => (
                          <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-xs text-gray-600">{l.level || '-'}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-700">{l.event_type || '-'}</td>
                            <td className="px-4 py-2.5 text-xs font-medium">{l.user_nickname || (l.user_id ? l.user_id.slice(0, 8) : 'System')}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[420px] truncate" title={l.message}>
                              {l.message || '-'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{l.created_at_ms ? new Date(l.created_at_ms).toLocaleString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )
            )}
          </div>
        )}

        {/* Users Tab */}
        {adminTab === 'users' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white" />
              </div>
              <Button variant="secondary" onClick={loadUsers}><RefreshCw className="w-4 h-4" /></Button>
            </div>

            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Credits</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Referrals</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Voice Slots</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Image Slots</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map(u => {
                      const totalCredits = u.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0) || 0;
                      
                      return (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{u.nickname}</div>
                          <div className="text-xs text-gray-500">{u.email || u.id.slice(0, 8)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium">{totalCredits.toLocaleString()}</div>
                          {u.credit_packages && u.credit_packages.length > 0 && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {u.credit_packages.length} package{u.credit_packages.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {u.referral_count > 0 ? (
                            <button
                              onClick={async () => {
                                try {
                                  const data = await api.request(`/api/admin/users/${u.id}/referrals`, { admin: true });
                                  showToast(`Referrals: ${data.referrals.map(r => r.nickname).join(', ')}`, 'info');
                                } catch (err) {
                                  showToast(err.message, 'error');
                                }
                              }}
                              className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {u.referral_count}
                            </button>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${(u.active_tasks || 0) > (u.concurrent_slots || 1) ? 'text-red-600' : 'text-gray-900'}`}>
                              {u.active_tasks || 0}/{u.concurrent_slots || 1}
                            </span>
                            {(u.active_tasks || 0) > (u.concurrent_slots || 1) && (
                              <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">!</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${(u.active_image_tasks || 0) > (u.image_concurrent_slots || 3) ? 'text-red-600' : 'text-gray-900'}`}>
                              {u.active_image_tasks || 0}/{u.image_concurrent_slots || 3}
                            </span>
                            {(u.active_image_tasks || 0) > (u.image_concurrent_slots || 3) && (
                              <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">!</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {u.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" onClick={async () => {
                            // Load credit packages for this user
                            try {
                              const response = await api.request(`/api/admin/users/${u.id}/packages`, { admin: true });
                              setEditUser({ ...u, credit_packages: response.packages || [] });
                            } catch (err) {
                              showToast('Failed to load packages', 'error');
                              setEditUser({ ...u, credit_packages: [] });
                            }
                          }}><Edit className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
              </table>
            </Card>

            {userTotal > 20 && (
              <div className="flex justify-center gap-2">
                <Button variant="secondary" size="sm" disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)}>Previous</Button>
                <span className="px-4 py-2 text-sm">Page {userPage}</span>
                <Button variant="secondary" size="sm" disabled={userPage * 20 >= userTotal} onClick={() => setUserPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}

        {/* API Keys Tab */}
        {adminTab === 'keys' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-500">{apiKeys.length} API keys in pool</p>
                {realtimeStats && (
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">
                    {realtimeStats.voicer_total_concurrent || 0} active slots
                  </span>
                )}
              </div>
              <Button onClick={() => setShowAddKey(true)}><Plus className="w-4 h-4" /> Add Key</Button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apiKeys.map(k => {
                const realtimeKey = realtimeStats?.api_keys?.find(rk => rk.key_id === k.id);
                const currentConcurrent = realtimeKey?.current_concurrent || 0;
                const slotPercent = (currentConcurrent / k.concurrent_limit) * 100;
                
                return (
                  <Card key={k.id} className={`p-4 ${!k.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{k.name}</p>
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            k.provider === 'elevenlabs' 
                              ? 'bg-purple-100 text-purple-700' 
                              : (k.provider === 'imaginator' || k.provider === 'fast_api' || k.provider === 'voidai' || k.provider === 'naga')
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {k.provider === 'elevenlabs' 
                              ? 'ElevenLabs' 
                              : (k.provider === 'imaginator' || k.provider === 'fast_api') 
                              ? 'Imaginator API' 
                              : k.provider === 'voidai'
                              ? 'VoidAI API'
                              : k.provider === 'naga'
                              ? 'Naga API'
                              : 'Voicer'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-mono">{k.api_key}</p>
                      </div>
                      <button onClick={() => handleUpdateKey(k.id, { is_active: !k.is_active })}
                        className={`px-2 py-1 text-xs rounded-full ${k.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {k.is_active ? 'Active' : 'Off'}
                      </button>
                    </div>
                    
                    {/* Concurrent Slots - Only for Voicer */}
                    {k.provider !== 'elevenlabs' && k.provider !== 'imaginator' && k.provider !== 'fast_api' && k.provider !== 'voidai' && k.provider !== 'naga' && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">Concurrent Slots</span>
                          <span className={`text-sm font-bold ${currentConcurrent > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {currentConcurrent} / {k.concurrent_limit}
                          </span>
                        </div>
                        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${currentConcurrent > 0 ? 'bg-emerald-500' : 'bg-gray-300'}`}
                            style={{ width: `${Math.min(100, slotPercent)}%` }}
                          />
                        </div>
                        {currentConcurrent > 0 && (
                          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {k.concurrent_limit - currentConcurrent} slots available
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Info for ElevenLabs */}
                    {k.provider === 'elevenlabs' && (
                      <div className="mb-4 p-2 bg-purple-50 rounded-lg">
                        <p className="text-xs text-purple-700">Used for Voice Library browsing</p>
                      </div>
                    )}
                    {(k.provider === 'imaginator' || k.provider === 'fast_api' || k.provider === 'voidai' || k.provider === 'naga') && (
                      <div className="mb-4 p-2 bg-emerald-50 rounded-lg">
                        <p className="text-xs text-emerald-700">
                          {k.provider === 'voidai' ? 'Used for VoidAI Image Generation' : k.provider === 'naga' ? 'Used for Naga Image Generation' : 'Used for Image Generation'}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>
                        {k.provider === 'elevenlabs' 
                          ? 'Library access only' 
                          : (k.provider === 'imaginator' || k.provider === 'fast_api' || k.provider === 'voidai' || k.provider === 'naga') 
                          ? `${k.total_requests || 0} image generations` 
                          : `${k.total_requests || 0} total requests`
                        }
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteKey(k.id)}>
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}



        {/* Add API Key Modal */}
        <Modal open={showAddKey} onClose={() => setShowAddKey(false)} title="Add API Key">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Provider</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setNewKeyData({ ...newKeyData, provider: 'voicer' })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    newKeyData.provider === 'voicer' 
                      ? 'border-black bg-gray-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Mic className="w-4 h-4" />
                    <span className="font-medium text-sm">Voicer</span>
                  </div>
                  <p className="text-xs text-gray-500">Voice generation</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewKeyData({ ...newKeyData, provider: 'elevenlabs' })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    newKeyData.provider === 'elevenlabs' 
                      ? 'border-black bg-gray-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Library className="w-4 h-4" />
                    <span className="font-medium text-sm">ElevenLabs</span>
                  </div>
                  <p className="text-xs text-gray-500">Voice library</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewKeyData({ ...newKeyData, provider: 'imaginator' })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    newKeyData.provider === 'imaginator' 
                      ? 'border-black bg-gray-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Image className="w-4 h-4" />
                    <span className="font-medium text-sm">Imaginator API</span>
                  </div>
                  <p className="text-xs text-gray-500">Image generation</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewKeyData({ ...newKeyData, provider: 'voidai' })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    newKeyData.provider === 'voidai' 
                      ? 'border-black bg-gray-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Image className="w-4 h-4" />
                    <span className="font-medium text-sm">VoidAI API</span>
                  </div>
                  <p className="text-xs text-gray-500">Image generation</p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewKeyData({ ...newKeyData, provider: 'naga' })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    newKeyData.provider === 'naga' 
                      ? 'border-black bg-gray-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Image className="w-4 h-4" />
                    <span className="font-medium text-sm">Naga API</span>
                  </div>
                  <p className="text-xs text-gray-500">Image generation (DALL·E 3, Flux, etc.)</p>
                </button>
              </div>
            </div>
            <Input 
              label="Name" 
              placeholder={
                newKeyData.provider === 'voicer' ? 'My Voicer Key' : 
                (newKeyData.provider === 'imaginator' || newKeyData.provider === 'fast_api') ? 'My Imaginator API Key' : 
                newKeyData.provider === 'voidai' ? 'My VoidAI API Key' : 
                newKeyData.provider === 'naga' ? 'My Naga API Key' : 
                'My ElevenLabs Key'
              } 
              value={newKeyData.name} 
              onChange={(e) => setNewKeyData({ ...newKeyData, name: e.target.value })} 
            />
            <Input 
              label="API Key" 
              placeholder={
                newKeyData.provider === 'voicer' ? 'Enter Voicer API key...' : 
                (newKeyData.provider === 'imaginator' || newKeyData.provider === 'fast_api') ? 'Enter Imaginator API key...' : 
                newKeyData.provider === 'voidai' ? 'Enter VoidAI API key (sk-voidai-...)...' : 
                newKeyData.provider === 'naga' ? 'Enter Naga API key...' : 
                'Enter ElevenLabs API key...'
              } 
              value={newKeyData.api_key} 
              onChange={(e) => setNewKeyData({ ...newKeyData, api_key: e.target.value })} 
            />
            {newKeyData.provider === 'voicer' && (
              <div className="grid grid-cols-2 gap-4">
                <Input label="Hourly Limit" type="number" value={newKeyData.hourly_limit} onChange={(e) => setNewKeyData({ ...newKeyData, hourly_limit: parseInt(e.target.value) || 2000 })} />
                <Input label="Concurrent Limit" type="number" value={newKeyData.concurrent_limit} onChange={(e) => setNewKeyData({ ...newKeyData, concurrent_limit: parseInt(e.target.value) || 10 })} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowAddKey(false)}>Cancel</Button>
              <Button onClick={handleCreateKey} disabled={!newKeyData.name || !newKeyData.api_key}>Create</Button>
            </div>
          </div>
        </Modal>

        {/* Model Pricing Tab */}
        {adminTab === 'pricing' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Image Model Pricing</h2>
                <p className="text-sm text-gray-500 mt-1">Set credits cost per image for each model</p>
              </div>
            </div>

            <Card className="p-6">
              <div className="space-y-4">
                {[
                  { id: 'IMAGEN_3_5', name: 'Imagen 3.5', model: 'imagen3.5', defaultCredits: 1 },
                  { id: 'GEM_PIX', name: 'GEM_PIX (Nano Banana)', model: 'nano_banana', defaultCredits: 1 },
                  { id: 'GEM_PIX_2', name: 'GEM_PIX_2 (Nano Banana Pro)', model: 'nano_banana_pro', defaultCredits: 2 },
                  { id: 'gpt-image-1', name: 'GPT Image 1 (VoidAI)', model: 'gpt-image-1', defaultCredits: 1 },
                  { id: 'gpt-image-1.5', name: 'GPT Image 1.5 (VoidAI)', model: 'gpt-image-1.5', defaultCredits: 1 },
                  { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 (VoidAI)', model: 'imagen-3.0-generate-002', defaultCredits: 2 },
                  { id: 'flux-kontext-pro', name: 'Flux Kontext Pro (VoidAI)', model: 'flux-kontext-pro', defaultCredits: 3 },
                  { id: 'midjourney', name: 'Midjourney (VoidAI)', model: 'midjourney', defaultCredits: 10 },
                  { id: 'NAGA_DALLE3', name: 'DALL·E 3 (Naga)', model: 'dall-e-3:free', defaultCredits: 1 },
                  { id: 'NAGA_FLUX', name: 'Flux Schnell (Naga)', model: 'flux-1-schnell:free', defaultCredits: 1 }
                ].map(modelInfo => {
                  const pricing = modelPricing.find(p => p.model_id === modelInfo.id) || { 
                    model_id: modelInfo.id, 
                    credits_per_image: modelInfo.defaultCredits 
                  };
                  const isEditing = editingModel === modelInfo.id;
                  
                  return (
                    <div key={modelInfo.id} className="p-4 border-2 border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{modelInfo.name}</h3>
                          <p className="text-sm text-gray-500">Model ID: {modelInfo.model}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {isEditing ? (
                            <>
                              <input
                                type="number"
                                min="1"
                                max="100000"
                                value={pricing.credits_per_image}
                                onChange={(e) => {
                                  const newPricing = modelPricing.map(p => 
                                    p.model_id === modelInfo.id 
                                      ? { ...p, credits_per_image: parseInt(e.target.value) || 1 }
                                      : p
                                  );
                                  if (!newPricing.find(p => p.model_id === modelInfo.id)) {
                                    newPricing.push({
                                      model_id: modelInfo.id,
                                      credits_per_image: parseInt(e.target.value) || 1
                                    });
                                  }
                                  setModelPricing(newPricing);
                                }}
                                className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center font-semibold"
                              />
                              <Button 
                                size="sm" 
                                onClick={() => {
                                  handleUpdateModelPricing(modelInfo.id, pricing.credits_per_image);
                                  setEditingModel(null);
                                }}
                              >
                                Save
                              </Button>
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => {
                                  setEditingModel(null);
                                  loadModelPricing();
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-gray-900">{pricing.credits_per_image}</div>
                                <div className="text-xs text-gray-500">credits/image</div>
                              </div>
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => setEditingModel(modelInfo.id)}
                              >
                                <Edit className="w-4 h-4" /> Edit
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Edit User Modal */}
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User">
          {editUser && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-0.5">Username</p>
                <p className="font-medium">{editUser.nickname}</p>
              </div>
              
              {/* Credit Packages */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">Credit Packages</label>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => setShowAddPackage(true)}
                  >
                    <Plus className="w-3 h-3" /> Add Package
                  </Button>
                </div>
                {editUser.credit_packages && editUser.credit_packages.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {editUser.credit_packages.map(pkg => {
                      const expiresDate = new Date(pkg.expires_at_ms);
                      const createdDate = new Date(pkg.created_at_ms);
                      const daysLeft = Math.ceil((pkg.expires_at_ms - Date.now()) / (24 * 60 * 60 * 1000));
                      const usedPercent = ((pkg.credits_initial - pkg.credits_remaining) / pkg.credits_initial * 100).toFixed(0);
                      
                      return (
                        <div key={pkg.id} className="p-3 bg-white border-2 border-gray-200 rounded-lg relative group">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="text-sm font-bold text-gray-900">
                                {pkg.credits_remaining.toLocaleString()} / {pkg.credits_initial.toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {usedPercent}% used
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                                daysLeft <= 7 ? 'bg-red-100 text-red-700' : 
                                daysLeft <= 14 ? 'bg-orange-100 text-orange-700' : 
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {daysLeft}d
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <button
                                  onClick={() => {
                                    const currentDays = Math.round((pkg.expires_at_ms - pkg.created_at_ms) / (24 * 60 * 60 * 1000));
                                    setEditingPackage(pkg);
                                    setPackageData({ 
                                      credits: pkg.credits_remaining,
                                      duration_days: [30, 60, 90].includes(currentDays) ? currentDays : 30
                                    });
                                  }}
                                  className="p-1 hover:bg-blue-50 rounded"
                                  title="Edit"
                                >
                                  <Edit className="w-3 h-3 text-blue-500" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this package?')) {
                                      handleDeletePackage(pkg.id);
                                    }
                                  }}
                                  className="p-1 hover:bg-red-50 rounded"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 space-y-0.5">
                            <div>Created: {createdDate.toLocaleDateString()}</div>
                            <div>Expires: {expiresDate.toLocaleDateString()}</div>
                            {pkg.source && <div className="text-gray-400">Source: {pkg.source}</div>}
                          </div>
                          
                          {/* Progress bar */}
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full ${
                                daysLeft <= 7 ? 'bg-red-500' : 
                                daysLeft <= 14 ? 'bg-orange-500' : 
                                'bg-emerald-500'
                              }`}
                              style={{ width: `${100 - usedPercent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-500">No active credit packages</p>
                  </div>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  Total available: {editUser.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0).toLocaleString() || 0} credits
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Voice Concurrent Slots</label>
                <input type="number" min="1" max="50" value={editUser.concurrent_slots || 1}
                  onChange={(e) => setEditUser({ ...editUser, concurrent_slots: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-gray-900" />
                <p className="text-xs text-gray-500 mt-1">Number of simultaneous voice generation tasks allowed</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Image Concurrent Slots</label>
                <input type="number" min="1" max="50" value={editUser.image_concurrent_slots || 3}
                  onChange={(e) => setEditUser({ ...editUser, image_concurrent_slots: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-gray-900" />
                <p className="text-xs text-gray-500 mt-1">Number of simultaneous image generation tasks allowed (default: 3)</p>
              </div>

              <Toggle 
                label="Account Status" 
                description={editUser.is_active ? 'User can access the service' : 'User is blocked'}
                checked={editUser.is_active} 
                onChange={(checked) => setEditUser({ ...editUser, is_active: checked })} 
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button onClick={handleUpdateUser}>Save Changes</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Add Package Modal */}
        <Modal open={showAddPackage} onClose={() => setShowAddPackage(false)} title="Add Credit Package">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Credits Amount</label>
              <input
                type="number"
                min="1000000"
                max="50000000"
                step="1000000"
                value={packageData.credits}
                onChange={(e) => setPackageData({ ...packageData, credits: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                placeholder="Enter credits (1M - 50M)"
              />
              <p className="text-xs text-gray-500 mt-1">Min: 1,000,000 | Max: 50,000,000</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Validity Period</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { days: 30, label: '1 Month' },
                  { days: 60, label: '2 Months' },
                  { days: 90, label: '3 Months' }
                ].map(opt => (
                  <button
                    key={opt.days}
                    onClick={() => setPackageData({ ...packageData, duration_days: opt.days })}
                    className={`px-4 py-3 rounded-lg border-2 font-semibold text-sm transition-all ${
                      packageData.duration_days === opt.days
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowAddPackage(false)}>Cancel</Button>
              <Button onClick={handleAddPackage}>Add Package</Button>
            </div>
          </div>
        </Modal>

        {/* Edit Package Modal */}
        <Modal open={!!editingPackage} onClose={() => setEditingPackage(null)} title="Edit Credit Package">
          {editingPackage && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Package Info</p>
                <p className="text-sm font-medium mt-1">
                  Initial: {editingPackage.credits_initial.toLocaleString()} credits
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Created: {new Date(editingPackage.created_at_ms).toLocaleDateString()}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Credits Remaining</label>
                <input
                  type="number"
                  min="0"
                  max={editingPackage.credits_initial}
                  value={packageData.credits}
                  onChange={(e) => setPackageData({ ...packageData, credits: e.target.value })}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max: {editingPackage.credits_initial.toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Validity Period</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { days: 30, label: '1 Month' },
                    { days: 60, label: '2 Months' },
                    { days: 90, label: '3 Months' }
                  ].map(opt => (
                    <button
                      key={opt.days}
                      onClick={() => setPackageData({ ...packageData, duration_days: opt.days })}
                      className={`px-4 py-3 rounded-lg border-2 font-semibold text-sm transition-all ${
                        packageData.duration_days === opt.days
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This will update the expiration date from creation time
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditingPackage(null)}>Cancel</Button>
                <Button onClick={handleUpdatePackage}>Save Changes</Button>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}

// Terms of Service Page
function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500">Last updated: January 20, 2026</p>
      </div>

      <Card className="p-6 space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p className="text-gray-700 leading-relaxed">
            By accessing and using FiftyFive Labs ("Service"), you accept and agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use our Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Use of Third-Party Services</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              <strong className="text-gray-900">Important Notice:</strong> FiftyFive Labs utilizes various third-party AI services and APIs 
              to provide affordable content generation capabilities. These services include, but are not limited to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>ElevenLabs and other voice synthesis providers</li>
              <li>AI model providers and inference platforms</li>
              <li>Cloud infrastructure and storage services</li>
            </ul>
            <p>
              <strong className="text-red-600">We do not own, operate, or control these third-party services.</strong> As such:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-gray-700">
              <li>We are <strong>not responsible</strong> for the availability, reliability, or performance of third-party services</li>
              <li>We do not guarantee uptime, quality, or consistency of generated content</li>
              <li>Service interruptions, outages, or quality degradation may occur without notice</li>
              <li>We make no warranties regarding the accuracy or suitability of generated content</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. User Responsibility for Content</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p className="text-red-600 font-medium">
              YOU ARE SOLELY RESPONSIBLE FOR ALL CONTENT YOU GENERATE USING OUR SERVICE.
            </p>
            <p>This includes but is not limited to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Ensuring you have the legal right to generate and use the content</li>
              <li>Verifying that your content does not infringe on any copyrights, trademarks, or intellectual property rights</li>
              <li>Ensuring compliance with all applicable laws and regulations in your jurisdiction</li>
              <li>Not generating content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
              <li>Not impersonating any person or entity, or falsely representing your affiliation</li>
              <li>Not generating content for fraudulent, malicious, or deceptive purposes</li>
            </ul>
            <p>
              FiftyFive Labs <strong>DOES NOT</strong> review, monitor, or validate user-generated content. 
              We assume no liability for any content generated through our Service.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Prohibited Uses</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>You agree NOT to use the Service for:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Illegal activities or content that violates any laws</li>
              <li>Harassment, abuse, or threats against individuals or groups</li>
              <li>Generating deepfakes, impersonations, or misleading content without proper disclosure</li>
              <li>Spam, phishing, or other fraudulent activities</li>
              <li>Violating intellectual property rights of others</li>
              <li>Circumventing service limitations or attempting unauthorized access</li>
              <li>Reselling or redistributing our Service without authorization</li>
            </ul>
            <p className="text-red-600 font-medium">
              Violation of these terms may result in immediate account termination without refund.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Payment and Credits</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Credits are purchased packages that enable content generation</li>
              <li>Credits have an expiration date specified at time of purchase</li>
              <li>Credit consumption is based on character count, model selection, and other factors</li>
              <li>Pricing is subject to change; existing credit packages honor purchase-time rates</li>
              <li>All sales are final (see Refund Policy below)</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. No Refund Policy</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p className="text-red-600 font-bold text-lg">
              ALL PURCHASES ARE FINAL. NO REFUNDS WILL BE ISSUED.
            </p>
            <p>Due to the nature of digital services and instant credit delivery:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Refunds are <strong>NOT</strong> available for any reason, including but not limited to:
                <ul className="list-circle list-inside ml-6 mt-2 space-y-1">
                  <li>Change of mind or accidental purchases</li>
                  <li>Service unavailability or downtime</li>
                  <li>Quality of generated content not meeting expectations</li>
                  <li>Unused or expired credits</li>
                  <li>Account suspension or termination due to Terms violation</li>
                </ul>
              </li>
              <li>Credits cannot be transferred, exchanged, or redeemed for cash</li>
              <li>Please carefully review your purchase before confirming payment</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Service Availability</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We strive to provide reliable service, but <strong>we do NOT guarantee</strong>:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Uninterrupted or error-free operation</li>
              <li>Availability of specific AI models or features</li>
              <li>Maintenance-free service (scheduled or emergency maintenance may occur)</li>
              <li>Compatibility with all devices, browsers, or network configurations</li>
            </ul>
            <p>
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time without notice.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Limitation of Liability</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p className="text-red-600 font-medium">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>FiftyFive Labs is provided "AS IS" and "AS AVAILABLE" without warranties of any kind</li>
              <li>We disclaim all warranties, express or implied, including merchantability and fitness for a particular purpose</li>
              <li>We are not liable for any direct, indirect, incidental, consequential, or punitive damages</li>
              <li>Our total liability shall not exceed the amount you paid in the last 30 days</li>
              <li>We are not responsible for losses due to third-party service failures, data loss, or security breaches</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Intellectual Property</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You retain ownership of content you input into the Service</li>
              <li>Generated content ownership may be subject to third-party AI provider terms</li>
              <li>FiftyFive Labs and its branding are our intellectual property</li>
              <li>You may not reproduce, modify, or create derivative works of our platform without permission</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Privacy and Data</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              Your use of the Service is also governed by our <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>.
              By using our Service, you consent to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Collection and processing of your data as described in our Privacy Policy</li>
              <li>Transmission of your content to third-party AI providers for processing</li>
              <li>Storage of generated content and metadata for service operation</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Account Security</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You must notify us immediately of any unauthorized access</li>
              <li>We are not liable for losses due to unauthorized account access</li>
              <li>Sharing accounts or API keys is prohibited</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Termination</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We reserve the right to suspend or terminate your account at any time for:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Violation of these Terms of Service</li>
              <li>Fraudulent activity or payment disputes</li>
              <li>Abuse of the Service or its resources</li>
              <li>Any reason at our sole discretion</li>
            </ul>
            <p className="text-red-600 font-medium">
              Account termination does not entitle you to any refunds of unused credits.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Changes to Terms</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We may modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms. 
              Material changes will be communicated via email or service notification.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Governing Law</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              These Terms are governed by applicable international laws. Any disputes shall be resolved through binding arbitration 
              or in courts of competent jurisdiction.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">15. Contact</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              For questions about these Terms, please contact us at: <strong>support@fiftyfivelabs.com</strong>
            </p>
          </div>
        </section>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500 italic">
            By using FiftyFive Labs, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
          </p>
        </div>
      </Card>
    </div>
  );
}

// Privacy Policy Page
function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: January 20, 2026</p>
      </div>

      <Card className="p-6 space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p><strong>Account Information:</strong></p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Email address, username, and profile information</li>
              <li>Payment information (processed through third-party payment providers)</li>
              <li>Account preferences and settings</li>
            </ul>
            <p className="mt-3"><strong>Usage Data:</strong></p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Generated content requests and metadata</li>
              <li>API usage statistics and logs</li>
              <li>Credit usage and transaction history</li>
              <li>Device information, IP address, and browser type</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. How We Use Your Information</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide and maintain our Service</li>
              <li>Process payments and manage your account</li>
              <li>Send service-related communications</li>
              <li>Improve our Service and develop new features</li>
              <li>Prevent fraud and ensure security</li>
              <li>Comply with legal obligations</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Third-Party Services</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We use third-party services to operate our platform. Your data may be processed by:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>AI model providers (ElevenLabs, etc.) to generate content</li>
              <li>Payment processors to handle transactions</li>
              <li>Cloud hosting providers for infrastructure</li>
              <li>Analytics services to improve our Service</li>
            </ul>
            <p className="text-amber-600 font-medium">
              These third parties have their own privacy policies. We recommend reviewing them.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Retention</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Account data is retained while your account is active</li>
              <li>Generated content is stored based on your subscription tier</li>
              <li>Logs and analytics data are retained for operational purposes</li>
              <li>You may request account deletion by contacting support</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Security</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We implement reasonable security measures to protect your data, including encryption, access controls, and secure protocols. 
              However, no method of transmission over the Internet is 100% secure.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Your Rights</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Export your data</li>
            </ul>
            <p>Contact us at <strong>privacy@fiftyfivelabs.com</strong> to exercise these rights.</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies and Tracking</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We use cookies and similar technologies to maintain sessions, remember preferences, and analyze usage. 
              You can control cookies through your browser settings.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Changes to Privacy Policy</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes via email or service notification.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contact</h2>
          <div className="space-y-3 text-gray-700 leading-relaxed">
            <p>
              For privacy-related questions, contact: <strong>privacy@fiftyfivelabs.com</strong>
            </p>
          </div>
        </section>
      </Card>
    </div>
  );
}

// Footer Component
function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white border-t border-gray-100 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">FiftyFive Labs</span>
            </div>
            <p className="text-sm text-gray-600">
              Affordable AI-powered voice generation platform using cutting-edge third-party services.
            </p>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/terms');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/privacy');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Support</h3>
            <ul className="space-y-2 text-sm">
              <li className="text-gray-600">
                Email: <a href="mailto:support@fiftyfivelabs.com" className="hover:text-gray-900">support@fiftyfivelabs.com</a>
              </li>
              <li className="text-gray-600">
                Privacy: <a href="mailto:privacy@fiftyfivelabs.com" className="hover:text-gray-900">privacy@fiftyfivelabs.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-gray-100 pt-6">
          <p className="text-xs text-gray-500 mb-3">
            <strong>Disclaimer:</strong> FiftyFive Labs uses third-party AI services for content generation. 
            We are not responsible for the availability, reliability, or quality of these external services. 
            All purchases are final with no refunds. Users are solely responsible for generated content and its legal compliance.
          </p>
          <p className="text-xs text-gray-400">
            © {currentYear} FiftyFive Labs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// Main App
function MainApp({ user, setUser, showToast }) {
  const [tab, setTab] = useState('voice');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Route handling - sync URL with tab
  useEffect(() => {
    const path = window.location.pathname;
    const routeMap = {
      '/generate/voice': 'voice',
      '/generatevoice': 'voice', // backward compatibility
      '/generate/image': 'image',
      '/library/voice': 'library',
      '/libraryvoice': 'library', // backward compatibility
      '/history': 'history',
      '/apikeys': 'api',
      '/pricing': 'pricing',
      '/profile': 'profile',
      '/terms': 'terms',
      '/privacy': 'privacy',
    };
    const matchedTab = routeMap[path];
    if (matchedTab && matchedTab !== tab) {
      setTab(matchedTab);
    } else if (!matchedTab && path !== '/' && !path.startsWith('/admin')) {
      // Redirect unknown routes to /generate/voice
      window.history.replaceState({}, '', '/generate/voice');
      setTab('voice');
    }
  }, []);

  // Update URL when tab changes (NEW URLS)
  useEffect(() => {
    const pathMap = {
      'voice': '/generate/voice',
      'image': '/generate/image',
      'library': '/library/voice',
      'history': '/history',
      'api': '/apikeys',
      'pricing': '/pricing',
      'profile': '/profile',
      'terms': '/terms',
      'privacy': '/privacy',
    };
    const path = pathMap[tab] || '/generate/voice';
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }, [tab]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const routeMap = {
        '/generate/voice': 'voice',
        '/generatevoice': 'voice',
        '/generate/image': 'image',
        '/library/voice': 'library',
        '/libraryvoice': 'library',
        '/history': 'history',
        '/apikeys': 'api',
        '/pricing': 'pricing',
        '/profile': 'profile',
        '/terms': 'terms',
        '/privacy': 'privacy',
      };
      const matchedTab = routeMap[path];
      if (matchedTab) {
        setTab(matchedTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const refreshUser = async () => {
    try {
      const data = await api.request('/api/me');
      setUser(data.user);
    } catch {}
  };

  const handleLogout = () => {
    api.setToken(null);
    setUser(null);
  };

  const sidebarItems = [
    { id: 'voice', icon: Mic, label: 'Generate Voice' },
    { id: 'image', icon: Image, label: 'Generate Image' },
    { id: 'library', icon: Library, label: 'Voice Library' },
    { id: 'history', icon: History, label: 'All History' },
    { id: 'api', icon: Key, label: 'API Access' },
    { id: 'pricing', icon: CreditCard, label: 'Pricing' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 transform transition-transform lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-screen flex flex-col">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div>
              <span className="text-lg font-semibold tracking-tight">FiftyFive Labs</span>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {sidebarItems.map(item => (
              <button key={item.id} onClick={() => { 
                setTab(item.id); 
                setMobileMenuOpen(false);
                const pathMap = {
                  'voice': '/generate/voice',
                  'image': '/generate/image',
                  'library': '/library/voice',
                  'history': '/history',
                  'api': '/apikeys',
                  'pricing': '/pricing',
                  'profile': '/profile',
                };
                const path = pathMap[item.id] || '/generate/voice';
                window.history.pushState({}, '', path);
              }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === item.id ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>
                <item.icon className="w-5 h-5" />{item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-100 bg-white">
            <button
              type="button"
              className="flex items-center gap-3 mb-3 w-full text-left rounded-lg hover:bg-gray-50 px-2 py-1"
              onClick={() => {
                setTab('profile');
                window.history.pushState({}, '', '/profile');
              }}
            >
              <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-gray-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.nickname}</p>
                <p className="text-xs text-gray-500">{(user.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0) || 0).toLocaleString()} credits</p>
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-500"
              onClick={(e) => { e.stopPropagation(); handleLogout(); }}
            >
              <LogOut className="w-4 h-4" />Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

      <main className="flex-1 min-w-0 lg:ml-64">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <div className="flex items-center gap-4">
              <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100"><Menu className="w-5 h-5" /></button>
              <h1 className="text-lg font-semibold">{sidebarItems.find(i => i.id === tab)?.label}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="pointer-events-none">
                <Sparkles className="w-4 h-4" />
                <span>{(user.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0) || 0).toLocaleString()}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {
                setTab('pricing');
                window.history.pushState({}, '', '/pricing');
              }}><Crown className="w-4 h-4" /><span className="hidden sm:inline">Upgrade</span></Button>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-6">
          {tab === 'voice' && <VoiceTab user={user} refreshUser={refreshUser} showToast={showToast} onGoToLibrary={() => setTab('library')} />}
          <div className={tab === 'image' ? '' : 'hidden'} aria-hidden={tab !== 'image'}>
            <ImageGenerationTab user={user} refreshUser={refreshUser} showToast={showToast} />
          </div>
          {tab === 'library' && <VoiceLibraryTab showToast={showToast} />}
          {tab === 'history' && <HistoryTab showToast={showToast} />}
          {tab === 'api' && <ApiKeysTab showToast={showToast} user={user} />}
          {tab === 'profile' && <ProfileTab user={user} showToast={showToast} />}
          {tab === 'pricing' && <PricingTab showToast={showToast} user={user} />}
          {tab === 'terms' && <TermsPage />}
          {tab === 'privacy' && <PrivacyPage />}
        </div>
        
        {/* Footer - only show on certain tabs */}
        {(tab === 'voice' || tab === 'image' || tab === 'library' || tab === 'pricing' || tab === 'terms' || tab === 'privacy') && <Footer />}
      </main>
    </div>
  );
}

function ProfileTab({ user, showToast }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.request('/api/user/profile');
        if (!alive) return;
        setProfile(data.profile);
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [showToast]);

  const referralLink = useMemo(() => {
    const code = profile?.referral?.code;
    if (!code) return '';
    return `${window.location.origin}/?ref=${code}`;
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  const totalCredits = profile?.credit_packages?.reduce((sum, p) => sum + p.credits_remaining, 0) || 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Total Credits</p>
          <p className="text-2xl font-bold text-gray-900">{totalCredits.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Active Packages</p>
          <p className="text-2xl font-bold text-gray-900">{profile?.credit_packages?.length || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Credits Used</p>
          <p className="text-2xl font-bold text-gray-900">{(profile?.credits_used || 0).toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Referrals</p>
          <p className="text-2xl font-bold text-gray-900">{profile?.referral?.referred_count || 0}</p>
        </Card>
      </div>

      {/* Credit Packages */}
      {profile?.credit_packages && profile.credit_packages.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Credit Packages
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {profile.credit_packages.map(pkg => {
              const expiresDate = new Date(pkg.expires_at_ms);
              const createdDate = new Date(pkg.created_at_ms);
              const daysLeft = Math.ceil((pkg.expires_at_ms - Date.now()) / (24 * 60 * 60 * 1000));
              const usedPercent = ((pkg.credits_initial - pkg.credits_remaining) / pkg.credits_initial * 100).toFixed(0);
              
              return (
                <div key={pkg.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-xl font-bold text-gray-900">
                        {(pkg.credits_remaining / 1000000).toFixed(1)}M
                      </div>
                      <div className="text-xs text-gray-500">
                        of {(pkg.credits_initial / 1000000).toFixed(1)}M
                      </div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                      daysLeft <= 7 ? 'bg-red-100 text-red-700' : 
                      daysLeft <= 14 ? 'bg-orange-100 text-orange-700' : 
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {daysLeft}d
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="mb-3 w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        daysLeft <= 7 ? 'bg-red-500' : 
                        daysLeft <= 14 ? 'bg-orange-500' : 
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${100 - usedPercent}%` }}
                    />
                  </div>
                  
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Used:</span>
                      <span className="font-medium">{usedPercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Expires:</span>
                      <span className="font-medium">{expiresDate.toLocaleDateString()}</span>
                    </div>
                    {pkg.source && (
                      <div className="flex justify-between">
                        <span>Source:</span>
                        <span className="font-medium capitalize">{pkg.source}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Referral Section */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Referral Program
            </h3>
            <p className="text-xs text-gray-500 mt-1">Share and earn credits when users top up.</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!referralLink) return;
              navigator.clipboard.writeText(referralLink);
              showToast('Copied!', 'success');
            }}
            disabled={!referralLink}
          >
            <Copy className="w-4 h-4" /> Copy Link
          </Button>
        </div>
        
        <code className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono mb-4">
          {referralLink || '—'}
        </code>
        
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Your Tier</p>
            <p className="text-xl font-bold text-gray-900">{Math.round((profile?.referral?.tier_rate || 0) * 100)}%</p>
          </div>
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Referred Users</p>
            <p className="text-xl font-bold text-gray-900">{(profile?.referral?.referred_count || 0).toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Credits Earned</p>
            <p className="text-xl font-bold text-gray-900">{(profile?.referral?.credits_earned || 0).toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Usage Chart */}
      <UsageChart stats={{ __mode: 'user' }} />
    </div>
  );
}

// App Entry with Routing
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

  const showToast = (message, type = 'info') => setToast({ message, type });

  // Set page title
  useEffect(() => {
    document.title = 'FiftyFive Labs | AI Studio';
  }, []);

  // Check route
  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      setIsAdminRoute(path === '/admin' || path.startsWith('/admin/'));
    };
    
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  // Check admin token on admin route
  useEffect(() => {
    if (isAdminRoute && api.adminToken) {
      // Verify admin token
      fetch(`${API_BASE}/api/admin/stats`, {
        headers: { 'X-Admin-Token': api.adminToken }
      }).then(res => {
        if (res.ok) {
          setAdminLoggedIn(true);
        } else {
          api.setAdminToken(null);
          setAdminLoggedIn(false);
        }
      }).catch(() => {
        api.setAdminToken(null);
        setAdminLoggedIn(false);
      });
    }
  }, [isAdminRoute]);

  // Auth check for main app
  useEffect(() => {
    if (!isAdminRoute && api.token) {
      api.request('/api/me').then(data => setUser(data.user)).catch(() => api.setToken(null)).finally(() => setLoading(false));
    } else if (!isAdminRoute) {
      setLoading(false);
    }
  }, [isAdminRoute]);

  // Admin route
  if (isAdminRoute) {
    return (
      <>
        {adminLoggedIn ? (
          <AdminPanelPage showToast={showToast} onLogout={() => setAdminLoggedIn(false)} />
        ) : (
          <AdminLoginScreen onLogin={() => setAdminLoggedIn(true)} showToast={showToast} />
        )}
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </>
    );
  }

  // Main app loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
      {user ? <MainApp user={user} setUser={setUser} showToast={showToast} /> : <AuthScreen onAuth={setUser} showToast={showToast} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
