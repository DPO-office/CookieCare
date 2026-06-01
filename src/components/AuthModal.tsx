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
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status})`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      // Success
      onAuthSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fillQuickDemo = () => {
    setEmail("swarnaaishwarya17@gmail.com");
    setPassword("password123");
    setName("Krish Jain");
    setIsLogin(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center grid-bg p-6 font-sans">
      <div className="w-full max-w-md bg-white border border-gray-200/80 rounded-xl shadow-xl overflow-hidden p-8 relative">
        
        {/* Top security layout indicator */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-black" />

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-black text-white mb-4">
            <Scale className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-display font-bold text-gray-900 tracking-tight">
            {isLogin ? "Sign in to CookieCare AI" : "Create Security Account"}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {isLogin ? "Access your secure cloud legal desk" : "Sign up in 30 seconds to draft and analyze agreements"}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded-r-md">
            <p className="font-semibold">Identification Failed</p>
            <p className="mt-0.5">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 text-gray-400" />
                <input
                  id="auth-name-input"
                  type="text"
                  required
                  placeholder="e.g. Krish Jain"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Corporate Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 text-gray-400" />
              <input
                id="auth-email-input"
                type="email"
                required
                placeholder="e.g. krish@cookiecare.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 text-gray-400" />
              <input
                id="auth-password-input"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 text-gray-400" />
                <input
                  id="auth-confirm-password-input"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          )}

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-black text-white hover:bg-gray-800 rounded-lg py-3 px-4 font-semibold text-sm transition-all flex items-center justify-center space-x-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? "Authenticating Session..." : isLogin ? "Sign In Securely" : "Provision Private Account"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-6">
          <button
            id="auth-toggle-btn"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-gray-500 hover:text-black font-semibold underline underline-offset-4"
          >
            {isLogin ? "Need a new security account?" : "Already registered? Login here"}
          </button>

          <button
            id="fill-demo-btn"
            onClick={fillQuickDemo}
            className="text-xs text-gray-500 hover:text-black border border-gray-200 bg-gray-50 py-1.5 px-3 rounded-md hover:bg-white transition-all flex items-center space-x-1.5 font-mono"
            type="button"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
            <span>Load Demo (Krish Jain)</span>
          </button>
        </div>

        <div className="mt-8 flex items-center justify-center space-x-2 text-[10px] font-mono text-gray-400 bg-gray-50 py-2 rounded-lg border border-gray-100">
          <Lock className="w-3 h-3 text-gray-400" />
          <span>FIPS 140-2 Encrypted At-Rest & Isomorphic Channels Active</span>
        </div>

      </div>
    </div>
  );
}
