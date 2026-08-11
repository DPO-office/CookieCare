// ─── SubtleBackground — Version B ────────────────────────────────────────────
// #F7F8FA base + two extremely low-opacity ambient layers:
//   1. A soft centred radial gradient (brand blue at ~3% opacity) — provides
//      the faintest directional depth without any visible colour cast.
//   2. A fractal noise overlay at 1.4% opacity — adds micro-texture so the
//      surface reads as material rather than flat paint.
// Neither layer is visible as a design element; they exist only to stop the
// background from feeling like a blank sheet of copy paper.

export function SubtleBackground() {
  return (
    <>
      {/* 1. Soft centred radial ambient — brand blue at 3% */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 55% at 50% 42%, rgba(33,117,217,0.030) 0%, transparent 72%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* 2. Fractal noise micro-texture at 1.4% opacity */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
          opacity: 0.014,
          mixBlendMode: "multiply",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </>
  );
}
