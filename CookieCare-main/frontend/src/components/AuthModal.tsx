import React, { useState } from "react";
import { Lock, Mail, User, ShieldCheck, Scale, ArrowRight } from "lucide-react";
import { apiUrl } from "../config";

interface AuthModalProps {
  onAuthSuccess: (token: string, user: { id: string; email: string; name: string }) => void;
}

export default function AuthModal({ onAuthSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? apiUrl("/api/auth/login") : apiUrl("/api/auth/register");
    const body = isLogin ? { email, password } : { email, password, name };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let errorMsg = "Authentication failed";
        try { const data = await res.json(); errorMsg = data.error || errorMsg; } catch { errorMsg = `Server error (${res.status})`; }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      onAuthSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fillQuickDemo = () => {
    setEmail("swarnaaishwarya17@gmail.com");
    setPassword("MamuSecure2026!");
    setName("Aishwarya");
    setIsLogin(true);
  };

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-[13px] text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 transition placeholder:text-gray-400";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] p-6">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-[20px] shadow-lg overflow-hidden">
          {/* Top accent bar */}
          <div className="h-0.5 bg-gradient-to-r from-gray-800 via-gray-600 to-gray-400" />

          <div className="p-9">
            {/* Brand */}
            <div className="text-center mb-9">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] bg-gray-900 text-white mb-5 shadow-md">
                <Scale className="w-6 h-6" />
              </div>
              <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">
                {isLogin ? "Sign in to Lexify" : "Create your account"}
              </h2>
              <p className="text-[13px] text-gray-500 mt-1.5">
                {isLogin ? "Access your secure legal workspace" : "Get started in seconds"}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input id="auth-name-input" type="text" required placeholder="e.g. Aishwarya" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input id="auth-email-input" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input id="auth-password-input" type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input id="auth-confirm-password-input" type="password" required placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}

              <button
                id="auth-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full mt-1 bg-gray-900 text-white hover:bg-gray-800 rounded-xl py-2.5 px-4 font-semibold text-[13px] transition flex items-center justify-center gap-2 shadow-xs hover:shadow-sm disabled:opacity-50"
              >
                <span>{loading ? "Authenticating..." : isLogin ? "Sign in" : "Create account"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
              <button
                id="auth-toggle-btn"
                onClick={() => setIsLogin(!isLogin)}
                className="text-[12px] text-gray-500 hover:text-gray-900 font-medium underline underline-offset-4 transition"
              >
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>

              <button
                id="fill-demo-btn"
                onClick={fillQuickDemo}
                type="button"
                className="text-[12px] text-gray-500 hover:text-gray-800 border border-gray-200 bg-gray-50 py-1.5 px-3 rounded-lg hover:bg-white transition flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Load demo</span>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          FIPS 140-2 Encrypted · Secure AI workspace
        </p>
      </div>
    </div>
  );
}
