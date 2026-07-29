import { useState, useEffect, useRef } from "react";
import { PRIMARY_BRAND, PRIMARY_BRAND_LIGHT } from "../../shared/theme/colors";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock, Mail, User, ShieldCheck, ArrowRight,
  Shield, Eye, EyeOff, ChevronLeft, ChevronRight, Check,
} from "lucide-react";
import { AuthUser } from "./types";
import { useAuth } from "./hooks/useAuth";

interface AuthModalProps {
  onAuthSuccess: (token: string, user: AuthUser) => void;
}

const FEATURES = [
  "AI Contract Review",
  "DPA Reviewer",
  "Cookie Scanner",
  "Vendor Risk Assessment",
  "AI Governance & Compliance",
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
        style={{ color: "#94A3B8" }}>Compliance Intelligence</p>
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
    error, loading, handleSubmit, fillQuickDemo,
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
        {/* -- LEFT- marketing panel ---------------------------- */}
        <div
          className="hidden lg:flex w-[44%] flex-col justify-between px-14 py-12"
          style={{ background: "#FFFFFF", borderRight: "1px solid #E5E7EB" }}
        >
          {/* Zone A: logo + headline */}
          <div>
            <div className="flex items-center gap-4 mb-9">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
                style={{ background: "#EBF4FD" }}>
                <Shield className="w-[22px] h-[22px]" style={{ color: "#2175D9" }} />
              </div>
              <span className="text-[20px] font-bold tracking-tight" style={{ color: "#2175D9" }}>randtrust</span>
            </div>
            <h1 className="text-[33px] font-bold leading-[1.2] tracking-tight mb-5 max-w-[400px]" style={{ color: "#2175D9" }}>
              Enterprise AI for Privacy, Security &amp; Legal Compliance
            </h1>
            <p className="text-[15px] leading-[1.65] max-w-[380px] text-gray-400">
              Automate privacy reviews, contract analysis, vendor assessments and AI
              governance from one intelligent platform.
            </p>
          </div>

          {/* Zone B: features + carousel */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3 text-gray-400">
              Why randtrust
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

          {/* Zone C: compliance badges */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5 text-gray-400">
              Trusted Compliance Standards
            </p>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <span key={b}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide"
                  style={{
                    background: "#F9FAFB",
                    border: "1px solid #E5E7EB",
                    color: "#6B7280",
                  }}>{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* -- RIGHT- form panel -------------------------------- */}
        <div className="flex-1 flex flex-col justify-center bg-white px-14 py-12">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "#EBF4FD" }}>
              <Shield className="w-[18px] h-[18px]" style={{ color: "#2175D9" }} />
            </div>
            <span className="text-[17px] font-bold tracking-tight" style={{ color: "#2175D9" }}>randtrust</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full max-w-[480px] mx-auto"
          >
            <h2 className="text-[32px] font-bold tracking-tight mb-1.5" style={{ color: "#2175D9", letterSpacing: "-0.025em" }}>
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-[15px] mb-8 text-gray-400">
              {isLogin ? "Sign in to continue to your randtrust workspace." : "Get started with randtrust in seconds."}
            </p>

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
                        onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
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
                    placeholder="········" value={password} onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} pr-12`}
                    onFocus={(e) => { e.target.style.borderColor = "#374151"; e.target.style.boxShadow = "0 0 0 3px rgba(55,65,81,0.08)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
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
                        autoComplete="new-password" placeholder="········"
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputBase} pr-12`}
                        onFocus={(e) => { e.target.style.borderColor = "#374151"; e.target.style.boxShadow = "0 0 0 3px rgba(55,65,81,0.08)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }} />
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

              {/* Primary CTA- charcoal/black, matches rest of the app */}
              <motion.button id="auth-submit-btn" type="submit" disabled={loading}
                whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }} transition={{ duration: 0.1 }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[15px] font-semibold text-white transition-colors duration-150 disabled:opacity-60" style={{ background: "#2175D9" }}
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
        </div>
      </div>
    </div>
  );
}


