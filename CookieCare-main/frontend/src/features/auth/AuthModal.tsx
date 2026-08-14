import { useState, useEffect, useRef, type FocusEvent } from "react";
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

const HAIRLINE = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";
const FOCUS_RING = "0 0 0 1.5px #8e98ff, 0 8px 24px rgba(96,107,235,0.08)";

const FEATURES = [
  "AI contract review",
  "DPA reviewer",
  "Cookie scanner",
  "Vendor risk assessment",
  "AI governance & compliance",
];

const INSIGHTS = [
  { id: "gdpr", tag: "Privacy insights", title: "GDPR update", body: "European Data Protection Board publishes updated AI transparency guidance for organisations deploying generative models." },
  { id: "ai-act", tag: "Compliance highlights", title: "EU AI Act", body: "New obligations for high-risk AI systems — providers must document conformity assessments before market release." },
  { id: "cookie", tag: "Industry updates", title: "Cookie compliance", body: "Chrome's Privacy Sandbox rollout continues. Enterprises should review first-party data strategies now." },
  { id: "nist", tag: "Privacy insights", title: "NIST privacy framework", body: "Updated enterprise guidance released, emphasising data minimisation and purpose limitation controls." },
  { id: "iso", tag: "Industry updates", title: "ISO 42001", body: "Growing enterprise adoption of AI governance management systems as boards demand structured AI risk oversight." },
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
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
        Compliance intelligence
      </p>
      <div className="relative mb-3 h-[96px]">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={card.id}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 flex flex-col justify-between rounded-[18px] px-4 py-3.5"
            style={{ background: "#F7F8FB", boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.04)" }}
          >
            <div className="flex items-center gap-2">
              <span className="score-badge bg-[#EEF2FF] text-[10px] font-medium text-[#4F5BD9]">
                {card.tag}
              </span>
              <span className="text-[13px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
                {card.title}
              </span>
            </div>
            <p className="line-clamp-2 text-[12px] leading-relaxed text-[#667085]">{card.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {INSIGHTS.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to insight ${i + 1}`}
              onClick={() => { go(i, i > index ? 1 : -1); startTimer(); }}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                background: i === index ? "#4F5BD9" : "#E5E7EB",
                width: i === index ? "1rem" : "0.25rem",
              }}
            />
          ))}
        </div>
        <div className="flex gap-1">
          {[prev, next].map((fn, i) => (
            <button
              key={i}
              onClick={fn}
              aria-label={i === 0 ? "Previous" : "Next"}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#98A2B3] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
            >
              {i === 0 ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputBase =
  "w-full rounded-[16px] border border-transparent bg-[#F7F8FB] py-3.5 pl-11 pr-4 text-[14px] text-[#1a1a1a] " +
  "placeholder:text-[#98A2B3] outline-none transition-shadow duration-150";

const labelClass = "mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]";

export default function AuthModal({ onAuthSuccess }: AuthModalProps) {
  const {
    isLogin, setIsLogin, email, setEmail, password, setPassword,
    confirmPassword, setConfirmPassword, name, setName,
    error, loading, googleLoading, isGoogleAuthConfigured, viewState,
    handleSubmit, handleGoogleLogin, backToForm, fillQuickDemo,
  } = useAuth({ onAuthSuccess });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const bindFocus = {
    onFocus: (e: FocusEvent<HTMLInputElement>) => {
      e.target.style.boxShadow = FOCUS_RING;
      e.target.style.background = "#FFFFFF";
    },
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      e.target.style.boxShadow = "none";
      e.target.style.background = "#F7F8FB";
    },
  };

  return (
    <div className="dpa-results-bg flex min-h-screen items-center justify-center px-6 py-10">
      <div
        className="flex w-full max-w-[1200px] overflow-hidden rounded-[24px] bg-white"
        style={{ minHeight: "680px", boxShadow: HAIRLINE }}
      >
        <div className="hidden w-[44%] flex-col justify-between border-r border-[#F0F0F2] bg-[#F7F8FB] px-12 py-11 lg:flex">
          <div>
            <div className="mb-8">
              <BrandLogo size="lg" tagline="Legal Operations & Risk Assistant" />
            </div>
            <h1 className="mb-3 max-w-[380px] text-[28px] font-semibold leading-[1.2] tracking-[-0.03em] text-[#1a1a1a]">
              Enterprise AI for privacy, security & legal compliance
            </h1>
            <p className="max-w-[360px] text-[14px] leading-relaxed text-[#667085]">
              Automate privacy reviews, contract analysis, vendor assessments and AI
              governance from one intelligent platform.
            </p>
          </div>

          <div className="my-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
              Why LORA
            </p>
            <ul className="mb-8 space-y-2.5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF]">
                    <Check className="h-3 w-3 text-[#4F5BD9]" strokeWidth={2.5} />
                  </span>
                  <span className="text-[13px] font-medium text-[#344054]">{f}</span>
                </li>
              ))}
            </ul>
            <InsightCarousel />
          </div>

          <div>
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
              Trusted compliance standards
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BADGES.map((b) => (
                <span
                  key={b}
                  className="score-badge bg-white text-[11px] font-medium text-[#667085]"
                  style={{ boxShadow: HAIRLINE }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center bg-white px-10 py-12 sm:px-14">
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <BrandLogo size="md" />
          </div>

          <AnimatePresence mode="wait">
            {viewState === "pending" ? (
              <motion.div
                key="pending"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="mx-auto w-full max-w-[420px] text-center"
              >
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF]">
                  <Clock className="h-7 w-7 text-[#4F5BD9]" />
                </div>
                <h2 className="mb-2 text-[26px] font-semibold tracking-[-0.03em] text-[#1a1a1a]">
                  Awaiting admin approval
                </h2>
                <p className="mb-8 text-[14px] leading-relaxed text-[#667085]">
                  Your account has been created successfully. An administrator needs to
                  review and approve your access before you can use the platform.
                </p>
                <button
                  onClick={backToForm}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#F7F8FB] px-5 py-2.5 text-[13px] font-semibold text-[#344054] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                >
                  <ArrowRight className="h-4 w-4 rotate-180" />
                  Back to sign in
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="mx-auto w-full max-w-[420px]"
              >
                <h2 className="mb-1.5 text-[28px] font-semibold tracking-[-0.03em] text-[#1a1a1a]">
                  {isLogin ? "Welcome back" : "Create your account"}
                </h2>
                <p className="mb-8 text-[14px] text-[#667085]">
                  {isLogin
                    ? "Sign in to continue to your LORA workspace."
                    : "Get started with LORA in seconds."}
                </p>

                {isGoogleAuthConfigured && (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={googleLoading || loading}
                      className="mb-6 flex w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-white py-3 text-[14px] font-medium text-[#344054] transition-colors hover:bg-[#F7F8FB] disabled:opacity-60"
                      style={{ boxShadow: HAIRLINE }}
                    >
                      {googleLoading ? (
                        <span>Signing in with Google…</span>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                          </svg>
                          <span>Continue with Google</span>
                        </>
                      )}
                    </button>

                    <div className="mb-6 flex items-center gap-3">
                      <div className="h-px flex-1 bg-[#F0F0F2]" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">or</span>
                      <div className="h-px flex-1 bg-[#F0F0F2]" />
                    </div>
                  </>
                )}

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      key="err"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="mb-5 rounded-[16px] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#991B1B]"
                      role="alert"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <AnimatePresence>
                    {!isLogin && (
                      <motion.div
                        key="name"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <label htmlFor="auth-name-input" className={labelClass}>Full name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#98A2B3]" />
                          <input
                            id="auth-name-input"
                            type="text"
                            required
                            autoComplete="name"
                            placeholder="Your full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={inputBase}
                            {...bindFocus}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label htmlFor="auth-email-input" className={labelClass}>Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#98A2B3]" />
                      <input
                        id="auth-email-input"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputBase}
                        {...bindFocus}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label htmlFor="auth-password-input" className={labelClass} style={{ marginBottom: 0 }}>
                        Password
                      </label>
                      {isLogin && (
                        <button
                          type="button"
                          className="text-[12px] font-medium text-[#98A2B3] transition-colors hover:text-[#4F5BD9]"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#98A2B3]" />
                      <input
                        id="auth-password-input"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputBase} pr-12`}
                        {...bindFocus}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide" : "Show"}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#98A2B3] transition-colors hover:text-[#4F5BD9]"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {!isLogin && (
                      <motion.div
                        key="confirm"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <label htmlFor="auth-confirm-password-input" className={labelClass}>
                          Confirm password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#98A2B3]" />
                          <input
                            id="auth-confirm-password-input"
                            type={showConfirm ? "text" : "password"}
                            required
                            autoComplete="new-password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={`${inputBase} pr-12`}
                            {...bindFocus}
                          />
                          <button
                            type="button"
                            aria-label={showConfirm ? "Hide" : "Show"}
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#98A2B3] transition-colors hover:text-[#4F5BD9]"
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {isLogin && (
                    <div className="flex items-center gap-2.5 pt-0.5">
                      <input
                        id="auth-remember"
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-[#D0D5DD] accent-[#4F5BD9]"
                      />
                      <label htmlFor="auth-remember" className="cursor-pointer select-none text-[13px] text-[#667085]">
                        Remember me for 30 days
                      </label>
                    </div>
                  )}

                  <motion.button
                    id="auth-submit-btn"
                    type="submit"
                    disabled={loading || googleLoading}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.995 }}
                    transition={{ duration: 0.1 }}
                    className="primary-gradient mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    <span>{loading ? "Authenticating…" : isLogin ? "Sign in" : "Create account"}</span>
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </motion.button>

                  <p className="pt-1 text-center text-[13px] text-[#667085]">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button
                      id="auth-toggle-btn"
                      type="button"
                      onClick={() => setIsLogin(!isLogin)}
                      className="font-semibold text-[#4F5BD9] transition-colors hover:underline"
                    >
                      {isLogin ? "Sign up" : "Sign in"}
                    </button>
                  </p>
                </form>

                <div className="mt-6 flex items-center justify-end border-t border-[#F0F0F2] pt-5">
                  <button
                    id="fill-demo-btn"
                    onClick={fillQuickDemo}
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#F7F8FB] px-3.5 py-2 text-[12px] font-medium text-[#667085] transition-colors hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
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
