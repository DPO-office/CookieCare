import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock, Mail, User, ShieldCheck, ArrowRight,
  Shield, Eye, EyeOff, ChevronLeft, ChevronRight, Check,
} from "lucide-react";
import { AuthUser } from "./types";
import { useAuth } from "./hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthModalProps {
  onAuthSuccess: (token: string, user: AuthUser) => void;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const FEATURES = [
  "AI Contract Review",
  "DPA Reviewer",
  "Cookie Scanner",
  "Vendor Risk Assessment",
  "AI Governance & Compliance",
];

const INSIGHTS = [
  {
    id: "gdpr",
    tag: "Privacy Insights",
    title: "GDPR Update",
    body: "European Data Protection Board publishes updated AI transparency guidance for organisations deploying generative models.",
    tagColor: "text-blue-600",
  },
  {
    id: "ai-act",
    tag: "Compliance Highlights",
    title: "EU AI Act",
    body: "New obligations for high-risk AI systems — providers must document conformity assessments before market release.",
    tagColor: "text-violet-600",
  },
  {
    id: "cookie",
    tag: "Industry Updates",
    title: "Cookie Compliance",
    body: "Chrome's Privacy Sandbox rollout continues. Enterprises should review first-party data strategies now.",
    tagColor: "text-emerald-600",
  },
  {
    id: "nist",
    tag: "Privacy Insights",
    title: "NIST Privacy Framework",
    body: "Updated enterprise guidance released, emphasising data minimisation and purpose limitation controls.",
    tagColor: "text-blue-600",
  },
  {
    id: "iso",
    tag: "Industry Updates",
    title: "ISO 42001",
    body: "Growing enterprise adoption of AI Governance Management Systems as boards demand structured AI risk oversight.",
    tagColor: "text-emerald-600",
  },
];

const BADGES = ["GDPR", "ISO 27001", "ISO 42001", "SOC 2", "CCPA"];

// ─── Insight Carousel ─────────────────────────────────────────────────────────

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prev = () => { go((index - 1 + INSIGHTS.length) % INSIGHTS.length, -1); startTimer(); };
  const next = () => { go((index + 1) % INSIGHTS.length, 1); startTimer(); };

  const card = INSIGHTS[index];

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * 14 }),
    center: { opacity: 1, x: 0 },
    exit:  (d: number) => ({ opacity: 0, x: d * -14 }),
  };

  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
        Compliance Intelligence
      </p>

      {/* Fixed-height card */}
      <div className="relative h-[88px] mb-2.5">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={card.id}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 rounded-lg border border-gray-200 bg-[#f5f5f5] px-4 py-3 flex flex-col justify-between"
          >
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${card.tagColor}`}>
                {card.tag}
              </span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[13px] font-semibold text-gray-800">{card.title}</span>
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2">{card.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots + arrows */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {INSIGHTS.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to insight ${i + 1}`}
              onClick={() => { go(i, i > index ? 1 : -1); startTimer(); }}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index ? "bg-gray-600 w-4" : "w-1 bg-gray-300 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <button
            onClick={prev}
            aria-label="Previous insight"
            className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={next}
            aria-label="Next insight"
            className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared input / label styles ─────────────────────────────────────────────

// ~56px tall inputs: py-[17px] + text-[15px] ≈ 56px
const inputBase =
  "w-full bg-white border border-gray-200 rounded-lg py-[17px] pl-11 pr-4 text-[15px] text-gray-900 " +
  "placeholder:text-gray-400 focus:outline-none focus:border-gray-500 focus:ring-0 " +
  "transition-colors duration-150";

const labelClass =
  "block text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-2";

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuthModal({ onAuthSuccess }: AuthModalProps) {
  const {
    isLogin, setIsLogin,
    email, setEmail,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    name, setName,
    error, loading,
    handleSubmit, fillQuickDemo,
  } = useAuth({ onAuthSuccess });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    /* ── Viewport ─────────────────────────────────────────────────────────── */
    <div
      className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: "#ebebeb" }}
    >
      {/*
        ┌──────────────────────────────────────────────────────────────────┐
        │  Unified container — single card, single shadow                  │
        │  Both columns share the same min-height so they fill together    │
        └──────────────────────────────────────────────────────────────────┘
      */}
      <div
        className="w-full max-w-[1450px] flex rounded-2xl overflow-hidden border border-gray-200 shadow-[0_8px_40px_rgba(0,0,0,0.10)]"
        style={{ minHeight: "640px" }}
      >

        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN
            Three-zone layout: top anchor | middle content | bottom badges
            justify-between keeps content distributed — no floating spacer
        ══════════════════════════════════════════════════════════════════ */}
        <div className="hidden lg:flex w-[44%] flex-col justify-between bg-white px-14 py-12 border-r border-gray-200">

          {/* ── Zone A: Logo + headline + description ──────────────────── */}
          <div>
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center">
                <Shield className="w-[18px] h-[18px] text-white" />
              </div>
              <span className="text-[17px] font-bold text-gray-900 tracking-tight">Lexify</span>
            </div>

            {/* Headline */}
            <h1 className="text-[38px] font-bold text-gray-900 leading-[1.2] tracking-tight mb-4 max-w-[400px]">
              Enterprise AI for Privacy, Security &amp; Legal Compliance
            </h1>

            {/* Description */}
            <p className="text-[15px] text-gray-500 leading-[1.65] max-w-[380px]">
              Automate privacy reviews, contract analysis, vendor assessments and AI
              governance from one intelligent platform.
            </p>
          </div>

          {/* ── Zone B: Features list + carousel ───────────────────────── */}
          <div>
            {/* Why Lexify */}
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Why Lexify
            </p>
            <ul className="space-y-2.5 mb-7">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <Check className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" strokeWidth={3} />
                  <span className="text-[14px] text-gray-700">{f}</span>
                </li>
              ))}
            </ul>

            {/* Compliance Intelligence carousel */}
            <InsightCarousel />
          </div>

          {/* ── Zone C: Compliance badges (naturally pinned to bottom) ─── */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
              Trusted Compliance Standards
            </p>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <span
                  key={b}
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-gray-500 border border-gray-200 bg-gray-50 tracking-wide"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

        </div>{/* end LEFT COLUMN */}

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN
            justify-center keeps the form vertically centered.
            The form itself has a generous max-width so inputs feel wide.
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-center bg-white px-14 py-12">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-[16px] font-bold text-gray-900">Lexify</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full max-w-[480px] mx-auto"
          >
            {/* Heading */}
            <h2 className="text-[32px] font-bold text-gray-900 tracking-tight mb-1.5">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-[15px] text-gray-400 mb-8">
              {isLogin
                ? "Sign in to continue to your Lexify workspace."
                : "Get started with Lexify in seconds."}
            </p>

            {/* Error */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-[13px] text-red-600"
                  role="alert"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* Full name — signup only */}
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
                    <label htmlFor="auth-name-input" className={labelClass}>Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                      <input
                        id="auth-name-input"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder="Your full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputBase}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email */}
              <div>
                <label htmlFor="auth-email-input" className={labelClass}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                  <input
                    id="auth-email-input"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputBase}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="auth-password-input" className={labelClass} style={{ marginBottom: 0 }}>
                    Password
                  </label>
                  {isLogin && (
                    <button
                      type="button"
                      className="text-[12px] text-blue-600 hover:text-blue-700 font-medium transition-colors"
                      tabIndex={0}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                  <input
                    id="auth-password-input"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} pr-12`}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={0}
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* Confirm password — signup only */}
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
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400" />
                      <input
                        id="auth-confirm-password-input"
                        type={showConfirm ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputBase} pr-12`}
                      />
                      <button
                        type="button"
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showConfirm ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Remember me — login only */}
              {isLogin && (
                <div className="flex items-center gap-2.5">
                  <input
                    id="auth-remember"
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                  />
                  <label
                    htmlFor="auth-remember"
                    className="text-[13px] text-gray-500 cursor-pointer select-none"
                  >
                    Remember me for 30 days
                  </label>
                </div>
              )}

              {/* Submit — ~56px tall */}
              <motion.button
                id="auth-submit-btn"
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                transition={{ duration: 0.1 }}
                className="w-full flex items-center justify-center gap-2 bg-[#111111] hover:bg-black text-white rounded-lg py-[17px] text-[15px] font-semibold transition-colors duration-150 disabled:opacity-60"
              >
                <span>
                  {loading ? "Authenticating…" : isLogin ? "Sign in" : "Create account"}
                </span>
                {!loading && <ArrowRight className="w-[18px] h-[18px]" />}
              </motion.button>

              {/* Toggle */}
              <p className="text-center text-[13.5px] text-gray-500 pt-0.5">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  id="auth-toggle-btn"
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-gray-900 font-semibold hover:underline transition-colors"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </p>

            </form>{/* end form */}

            {/* Bottom row */}
            <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[12px] text-gray-400">
                Forgot password?{" "}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Reset it here
                </button>
              </p>
              <button
                id="fill-demo-btn"
                onClick={fillQuickDemo}
                type="button"
                className="text-[12px] text-gray-500 hover:text-gray-800 border border-gray-200 bg-gray-50 hover:bg-white py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Load demo</span>
              </button>
            </div>

          </motion.div>

        </div>{/* end RIGHT COLUMN */}

      </div>{/* end unified container */}

    </div>/* end viewport */
  );
}
