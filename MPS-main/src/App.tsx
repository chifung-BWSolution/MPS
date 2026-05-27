import { Suspense, ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/home";
import { Toaster } from "./components/ui/sonner";
import { useAuth, AuthProvider } from "./context/AuthContext";
import { LoginPage } from "./components/auth/LoginPage";
import { Loader2 } from "lucide-react";

function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAuthorized, loading, authError } = useAuth();

  // Show fullscreen loading spinner during auth state transition
  // This prevents the AuthGuard from bouncing the user to login prematurely
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-teal-100 rounded-full" />
            <Loader2 size={40} className="text-teal-600 animate-spin absolute inset-0 m-auto" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-medium text-[#0d1a2d]">正在驗證身份...</p>
            <p className="text-[12px] text-muted-foreground mt-1">請稍候，系統正在確認您的帳戶權限</p>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated or not authorized — show login page
  if (!isAuthenticated || !isAuthorized) {
    return <LoginPage authError={authError} />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<p>Loading...</p>}>
        <>
          <AuthGuard>
            <Routes>
              <Route path="/*" element={<Home />} />
            </Routes>
          </AuthGuard>
          <Toaster />
        </>
      </Suspense>
    </AuthProvider>
  );
}

export default App;
