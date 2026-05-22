import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Chrome, Shield, AlertCircle, Code2 } from 'lucide-react';
import { toast } from 'sonner';

export function LoginPage({ authError }: { authError?: string | null }) {
  const { signInWithGoogle, devBypassLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDevInput, setShowDevInput] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devLoading, setDevLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // Redirect will happen automatically
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError(err.message || '登入失敗，請稍後再試');
      toast.error('登入失敗', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = async () => {
    if (!devEmail.trim()) {
      setError('請輸入電郵地址');
      return;
    }
    setDevLoading(true);
    setError('');
    try {
      await devBypassLogin(devEmail.trim());
    } catch (err: any) {
      console.error('Dev bypass failed:', err);
      setError(err.message || '驗證失敗');
    } finally {
      setDevLoading(false);
    }
  };

  const displayError = authError || error;

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600 rounded-xl mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-[#0d1a2d]">BWDesign Centre</h1>
          <p className="text-[14px] text-muted-foreground mt-1">Marketing Project System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-8">
          <h2 className="text-[20px] font-bold text-center mb-2">登入系統</h2>
          <p className="text-[13px] text-muted-foreground text-center mb-6">
            使用您的 Google 帳號登入
          </p>

          {/* Error Message — Large & Visible */}
          {displayError && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-300 rounded-lg mb-4 shadow-sm">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-rose-800 leading-relaxed">{displayError}</p>
                <p className="text-[11px] text-rose-600 mt-1">如需協助，請聯絡系統管理員。</p>
              </div>
            </div>
          )}

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-lg text-[14px] font-medium hover:bg-muted/30 transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Chrome size={20} className="text-blue-500" />
            <span>{loading ? '登入中...' : '使用 Google 帳號登入'}</span>
          </button>

          {/* Developer Bypass Section */}
          <div className="mt-4 pt-4 border-t border-dashed border-amber-300">
            {!showDevInput ? (
              <button
                onClick={() => setShowDevInput(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[13px] font-medium text-amber-700 hover:bg-amber-100 transition-all duration-200"
              >
                <Code2 size={16} />
                <span>Developer Bypass Login</span>
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-amber-600 font-medium text-center">
                  ⚠️ 開發模式 — 輸入已授權的電郵地址
                </p>
                <input
                  type="email"
                  placeholder="輸入電郵地址 (e.g. user@company.com)"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDevBypass()}
                  className="w-full px-3 py-2.5 border border-amber-200 rounded-lg text-[13px] bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 placeholder:text-amber-400"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDevInput(false);
                      setDevEmail('');
                      setError('');
                    }}
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDevBypass}
                    disabled={devLoading || !devEmail.trim()}
                    className="flex-1 px-3 py-2 bg-amber-500 text-white rounded-lg text-[12px] font-medium hover:bg-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {devLoading ? '驗證中...' : '驗證並登入'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="mt-6 pt-5 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              只有已在「設定 → 用戶管理」中登記的 Google 電郵才能登入本系統。
              如需開通帳號，請聯絡管理員。
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-muted-foreground text-center mt-6">
          © {new Date().getFullYear()} 志豐企業 BWDesign Centre. All rights reserved.
        </p>
      </div>
    </div>
  );
}
