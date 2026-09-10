// ─── VideoBackground ──────────────────────────────────────────────────────────
// Ambient video lighting. Anchored to the bottom edge — the center stays dark.
// Layering: video (z:0) → vignette (z:1) → blue glow (z:2) → noise (z:3)

import { useRef, useEffect } from "react";

export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <>
      {/* 1. The video */}
      <video
        ref={videoRef}
        src="/animated%20bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center bottom",
          opacity: 0.55,
          filter: "saturate(0.75) brightness(0.85)",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />

      {/* 2. Vignette */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: [
            "radial-gradient(ellipse 65% 60% at 50% 48%, rgba(11,13,16,0.72) 0%, rgba(11,13,16,0.55) 45%, transparent 72%)",
            "linear-gradient(to bottom, rgba(11,13,16,0.95) 0%, transparent 16%, transparent 78%, rgba(11,13,16,0.92) 100%)",
            "linear-gradient(to right, rgba(11,13,16,0.80) 0%, transparent 18%, transparent 82%, rgba(11,13,16,0.80) 100%)",
          ].join(", "),
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* 3. Brand blue radial glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 58% 45% at 50% 46%, rgba(33,117,217,0.08) 0%, transparent 68%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* 4. Subtle noise texture */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
          opacity: 0.018,
          mixBlendMode: "overlay",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
    </>
  );
}
