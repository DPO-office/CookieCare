import { useState, useEffect, useRef } from "react";
import { PRIMARY_BRAND, PRIMARY_BRAND_LIGHT } from "../../shared/theme/colors";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock, Mail, User, ShieldCheck, ArrowRight, Clock,
  Eye, EyeOff, ChevronLeft, ChevronRight, Check,
} from "lucide-react";
import { BrandLogo } from "../../shared/components/BrandLogo";
import { AuthUser } from "./types";
import { useAuth } from "./hooks/useAuth";

interface AuthModalProps {
  onAuthSuccess: (token: string, user: AuthUser) => void;
}

const FEATURES = [
  "AI contract review",
  "DPA reviewer",
  "Cookie scanner",
  "Vendor risk assessment",
  "AI governance & compliance",
];

const INSIGHTS = [
  { id: "gdpr", tag: "Privacy Insights", tagColor: "#6B7280", title: "GDPR Update", body: "European Data Protection Board publishes updated AI transparency guidance for organisations deploying generative models." },
  { id: "ai-act", tag: "Compliance Highlights", tagColor: "#374151", title: "EU AI Act", body: "New obligations for high-risk AI systems- providers must document conformity assessments before market release." },
  { id: "cookie", tag: "Industry Updates", tagColor: "#6B7280", title: "Cookie Compliance", body: "Chrome's Privacy Sandbox rollout continues. Enterprises should review first-party data strategies now." },
  { id: "nist", tag: "Privacy Insights", tagColor: "#6B7280", title: "NIST Privacy Framework", body: "Updated enterprise guidance released, emphasising data minimisation and purpose limitation controls." },
  { id: "iso", tag: "Industry Updates", tagColor: "#6B7280", title: "ISO 42001", body: "Growing enterprise adoption of AI Governance Management Systems as boards demand structured AI risk oversight." },
];

const BADGES = ["GDPR", "ISO 27001", "ISO 42001", "SOC 2", "CCPA"];

function InsightCarousel() {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = (next: number, d: number) => { setDir(d); setIndex(next); };
  const startTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setDir(1);
      setIndex((i) => (i + 1) % INSIGHTS.length);
    }, 5000);
  };

  useEffect(() => {
    startTimer();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const prev = () => { go((index - 1 + INSIGHTS.length) % INSIGHTS.length, -1); startTimer(); };
  const next = () => { go((index + 1) % INSIGHTS.length, 1); startTimer(); };
  const card = INSIGHTS[index];

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * 14 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -14 }),
  };

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "#94A3B8" }}>Compliance intelligence</p>
      <div className="relative h-[88px] mb-2.5">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={card.id} custom={dir} variants={variants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 rounded-xl px-4 py-3 flex flex-col justify-between"
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: card.tagColor }}>
                {card.tag}
              </span>
              <span style={{ color: "#CBD5E1" }}>·</span>
              <span className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>{card.title}</span>
            </div>
            <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: "#64748B" }}>{card.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {INSIGHTS.map((_, i) => (
            <button key={i} aria-label={`Go to insight ${i + 1}`}
              onClick={() => { go(i, i > index ? 1 : -1); startTimer(); }}
              className="h-1 rounded-full transition-all duration-300"
              style={{ background: i === index ? "#111827" : "#D1D5DB", width: i === index ? "1rem" : "0.25rem" }} />
          ))}
        </div>
        <div className="flex gap-1">
          {[prev, next].map((fn, i) => (
            <button key={i} onClick={fn} aria-label={i === 0 ? "Previous" : "Next"}
              className="w-5 h-5 rounded-full flex items-center justify-center transition-colors"
              style={{ border: "1px solid #E5E7EB", color: "#9CA3AF" }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "#374151"}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "#9CA3AF"}
            >
              {i === 0 ? <ChevronLeft className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputBase =
  "w-full bg-white border border-gray-200 rounded-lg py-[17px] pl-11 pr-4 text-[15px] text-gray-900 " +
  "placeholder:text-gray-400 outline-none transition-all duration-150";

const labelClass = "block text-[12px] font-semibold uppercase tracking-widest mb-2 text-gray-500" as const;

export default function AuthModal({ onAuthSuccess }: AuthModalProps) {
  const {
    isLogin, setIsLogin, email, setEmail, password, setPassword,
    confirmPassword, setConfirmPassword, name, setName,
    error, loading, googleLoading, isGoogleAuthConfigured, viewState,
    handleSubmit, handleGoogleLogin, backToForm, fillQuickDemo,
  } = useAuth({ onAuthSuccess });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: "#F3F4F6" }}>
      <div
        className="w-full max-w-[1400px] flex rounded-2xl overflow-hidden"
        style={{
          minHeight: "640px",
          border: "1px solid #E5E7EB",
          boxShadow: "0 24px 80px rgba(0,0,0,0.12)",
        }}
      >
        {/* ── LEFT — marketing panel ───────────────────────────── */}
        <div
          className="hidden lg:flex w-[44%] flex-col justify-between px-14 py-12"
          style={{ background: "#FFFFFF", borderRight: "1px solid #E5E7EB" }}
        >
          <div>
            <div className="flex items-center gap-4 mb-9">
              <BrandLogo size="lg" />
            </div>
            <h1 className="text-[33px] font-bold leading-[1.2] tracking-tight mb-5 max-w-[400px]" style={{ color: "#2175D9" }}>
              Enterprise AI for privacy, security &amp; legal compliance
            </h1>
            <p className="text-[15px] leading-[1.65] max-w-[380px] text-gray-400">
              Automate privacy reviews, contract analysis, vendor assessments and AI
              governance from one intelligent platform.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3 text-gray-400">
              Why RandTrust
            </p>
            <ul className="space-y-2.5 mb-7">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <Check className="w-3.5 h-3.5 shrink-0 text-gray-900" strokeWidth={3} />
                  <span className="text-[14px] text-gray-600">{f}</span>
                </li>
              ))}
            </ul>
            <InsightCarousel />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5 text-gray-400">
              Trusted compliance standards
            </p>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <span key={b}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280" }}>{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT — form / pending panel ─────────────────────── */}
        <div className="flex-1 flex flex-col justify-center bg-white px-14 py-12">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center mb-8 justify-center">
            <BrandLogo size="md" />
          </div>

          <AnimatePresence mode="wait">
            {viewState === "pending" ? (
              /* ── Awaiting approval screen ──────────────────────── */
              <motion.div
                key="pending"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
                className="w-full max-w-[480px] mx-auto text-center"
              >
                <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                  style={{ background: "#FEF3C7" }}>
                  <Clock className="w-8 h-8" style={{ color: "#D97706" }} />
                </div>
                <h2 className="text-[28px] font-bold tracking-tight mb-3" style={{ color: "#111827" }}>
                  Awaiting admin approval
                </h2>
                <p className="text-[15px] leading-[1.7] mb-8" style={{ color: "#6B7280" }}>
                  Your account has been created successfully. An administrator needs to
                  review and approve your access before you can use the platform.
                  You will be able to sign in once approved.
                </p>
                <button
                  onClick={backToForm}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold transition-colors"
                  style={{ background: "#F3F4F6", color: "#374151" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E5E7EB"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F3F4F6"; }}
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  Back to sign in
                </button>
              </motion.div>
            ) : (
              /* ── Auth form ────────────────────────────────────── */
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: "easeOut" }}
                className="w-full max-w-[480px] mx-auto"
              >
                <h2 className="text-[32px] font-bold tracking-tight mb-1.5" style={{ color: "#2175D9", letterSpacing: "-0.025em" }}>
                  {isLogin ? "Welcome back" : "Create your account"}
                </h2>
                <p className="text-[15px] mb-8 text-gray-400">
                  {isLogin ? "Sign in to continue to your randtrust workspace." : "Get started with randtrust in seconds."}
                </p>

                {/* ── Google sign-in — only when Identity Platform is configured ── */}
                {isGoogleAuthConfigured && (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={googleLoading || loading}
                      className="w-full flex items-center justify-center gap-3 py-[14px] rounded-xl text-[15px] font-medium transition-all duration-150 disabled:opacity-60 mb-6"
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #D1D5DB",
                        color: "#374151",
                      }}
                      onMouseEnter={(e) => { if (!googleLoading) (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FFFFFF"; }}
                    >
                      {googleLoading ? (
                        <span className="text-[14px]">Signing in with Google...</span>
                      ) : (
                        <>
                          <svg width="20" height="20" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                          </svg>
                          <span>Continue with Google</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
                      <span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "#9CA3AF" }}>or</span>
                      <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
                    </div>
                  </>
                )}

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div key="err"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
                      className="mb-5 px-4 py-3 rounded-lg text-[13px] bg-red-50 border border-red-200 text-red-600"
                      role="alert"
                    >{error}</motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <AnimatePresence>
                    {!isLogin && (
                      <motion.div key="name"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <label htmlFor="auth-name-input" className={labelClass}>Full Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                          <input id="auth-name-input" type="text" required autoComplete="name"
                            placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)}
                            className={inputBase}
                            onFocus={(e) => { e.target.style.borderColor = "#374151"; e.target.style.boxShadow = "0 0 0 3px rgba(55,65,81,0.08)"; }}
                            onBlur={(e)  => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label htmlFor="auth-email-input" className={labelClass}>Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                      <input id="auth-email-input" type="email" required autoComplete="email"
                        placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
                        className={inputBase}
                        onFocus={(e) => { e.target.style.borderColor = "#374151"; e.target.style.boxShadow = "0 0 0 3px rgba(55,65,81,0.08)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="auth-password-input" className={labelClass} style={{ marginBottom: 0 }}>Password</label>
                      {isLogin && (
                        <button type="button" className="text-[12px] font-medium text-gray-400 hover:text-gray-700 transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                      <input id="auth-password-input" type={showPassword ? "text" : "password"} required
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                        className={`${inputBase} pr-12`}
                        onFocus={(e) => { e.target.style.borderColor = "#374151"; e.target.style.boxShadow = "0 0 0 3px rgba(55,65,81,0.08)"; }}
                        onBlur={(e)  => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
                      <button type="button" aria-label={showPassword ? "Hide" : "Show"}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {!isLogin && (
                      <motion.div key="confirm"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <label htmlFor="auth-confirm-password-input" className={labelClass}>Confirm Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                          <input id="auth-confirm-password-input" type={showConfirm ? "text" : "password"} required
                            autoComplete="new-password" placeholder="••••••••"
                            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                            className={`${inputBase} pr-12`}
                            onFocus={(e) => { e.target.style.borderColor = "#374151"; e.target.style.boxShadow = "0 0 0 3px rgba(55,65,81,0.08)"; }}
                            onBlur={(e)  => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
                          <button type="button" aria-label={showConfirm ? "Hide" : "Show"}
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                            {showConfirm ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {isLogin && (
                    <div className="flex items-center gap-2.5">
                      <input id="auth-remember" type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-gray-900" />
                      <label htmlFor="auth-remember" className="text-[13px] cursor-pointer select-none text-gray-500">
                        Remember me for 30 days
                      </label>
                    </div>
                  )}

                  {/* Primary CTA */}
                  <motion.button id="auth-submit-btn" type="submit" disabled={loading || googleLoading}
                    whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }} transition={{ duration: 0.1 }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[15px] font-semibold text-white transition-colors duration-150 disabled:opacity-60"
                    style={{ background: "#2175D9" }}
                  >
                    <span>{loading ? "Authenticating..." : isLogin ? "Sign in" : "Create account"}</span>
                    {!loading && <ArrowRight className="w-[18px] h-[18px]" />}
                  </motion.button>

                  <p className="text-center text-[13.5px] pt-0.5 text-gray-500">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button id="auth-toggle-btn" type="button" onClick={() => setIsLogin(!isLogin)}
                      className="font-semibold text-gray-900 hover:underline transition-colors">
                      {isLogin ? "Sign up" : "Sign in"}
                    </button>
                  </p>
                </form>

                <div className="mt-7 pt-5 flex items-center justify-end border-t border-gray-100">
                  <button id="fill-demo-btn" onClick={fillQuickDemo} type="button"
                    className="text-[12px] py-2 px-3.5 rounded-lg flex items-center gap-1.5 text-gray-400 border border-gray-200 hover:text-gray-600 hover:border-gray-300 transition-all"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Load demo</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
