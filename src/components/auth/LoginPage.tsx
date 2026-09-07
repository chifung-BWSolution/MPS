import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Chrome, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const EMAIL_HISTORY_KEY = 'mps_dev_email_history';

function loadEmailHistory(): string[] {
  try {
    const raw = localStorage.getItem(EMAIL_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveEmailToHistory(email: string) {
  try {
    const existing = loadEmailHistory().filter(e => e.toLowerCase() !== email.toLowerCase());
    const next = [email, ...existing].slice(0, 10);
    localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function LoginPage({ authError }: { authError?: string | null }) {
  const { signInWithGoogle, signInWithEmailPhone } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailHistory, setEmailHistory] = useState<string[]>([]);

  useEffect(() => {
    setEmailHistory(loadEmailHistory());
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError(err.message || '登入失敗，請稍後再試');
      toast.error('登入失敗', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPhoneLogin = async () => {
    if (!email.trim() || !phone.trim()) {
      setError('請輸入電郵及私人電話');
      return;
    }
    setEmailLoading(true);
    setError('');
    try {
      const trimmed = email.trim();
      await signInWithEmailPhone(trimmed, phone);
      saveEmailToHistory(trimmed);
      setEmailHistory(loadEmailHistory());
    } catch (err: any) {
      console.error('Email/phone login failed:', err);
      setError(err.message || '驗證失敗');
    } finally {
      setEmailLoading(false);
    }
  };

  const displayError = authError || error;

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600 rounded-xl mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-[#0d1a2d]">BWDesign Centre</h1>
          <p className="text-[14px] text-muted-foreground mt-1">Marketing Project System</p>
        </div>

        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-8">
          <h2 className="text-[20px] font-bold text-center mb-2">登入系統</h2>
          <p className="text-[13px] text-muted-foreground text-center mb-6">
            使用 Google 帳號，或電郵 + 私人電話登入
          </p>

          {displayError && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-300 rounded-lg mb-4 shadow-sm">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-rose-800 leading-relaxed">{displayError}</p>
                <p className="text-[11px] text-rose-600 mt-1">如需協助，請聯絡系統管理員。</p>
              </div>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-lg text-[14px] font-medium hover:bg-muted/30 transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Chrome size={20} className="text-blue-500" />
            <span>{loading ? '登入中...' : '使用 Google 帳號登入'}</span>
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/70" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-2 text-[11px] text-muted-foreground">或使用電郵登入</span>
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); void handleEmailPhoneLogin(); }}
          >
            <input
              type="email"
              name="email"
              autoComplete="email"
              list="login-email-history"
              placeholder="登入電郵"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            />
            <datalist id="login-email-history">
              {emailHistory.map(em => <option key={em} value={em} />)}
            </datalist>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              placeholder="私人電話（密碼）"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            />
            <button
              type="submit"
              disabled={emailLoading || !email.trim() || !phone.trim()}
              className="w-full px-4 py-2.5 bg-teal-600 text-white rounded-lg text-[13px] font-medium hover:bg-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {emailLoading ? '驗證中...' : '電郵登入'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              只有已在「設定 → 用戶管理」中登記的同事才能登入。
              電郵登入請使用員工列表上的私人電話。如需開通帳號，請聯絡管理員。
            </p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          © {new Date().getFullYear()} 志豐企業 BWDesign Centre. All rights reserved.
        </p>
      </div>
    </div>
  );
}
