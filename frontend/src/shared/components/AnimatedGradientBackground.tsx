import { motion } from "motion/react";
import React, { useEffect, useRef } from "react";

interface AnimatedGradientBackgroundProps {
  /** Initial size of the radial gradient as a percentage width. @default 125 */
  startingGap?: number;
  /** Enables the breathing (pulse) animation. @default false */
  Breathing?: boolean;
  /**
   * Colors for each stop in the radial gradient.
   * Must be the same length as `gradientStops`.
   */
  gradientColors?: string[];
  /**
   * Percentage positions for each color stop (0–100).
   * Must be the same length as `gradientColors`.
   */
  gradientStops?: number[];
  /** Speed of the breathing pulse — lower = slower. @default 0.02 */
  animationSpeed?: number;
  /** How many percentage points the gradient expands/contracts. @default 5 */
  breathingRange?: number;
  /** Extra inline styles applied to the gradient `<div>`. @default {} */
  containerStyle?: React.CSSProperties;
  /** Extra class names for the gradient `<div>`. @default "" */
  containerClassName?: string;
  /**
   * Vertical offset (in %) applied to the radial-gradient y-center.
   * Positive values pull the bloom upward. @default 0
   */
  topOffset?: number;
}

/**
 * AnimatedGradientBackground
 *
 * Renders a full-bleed radial gradient that optionally breathes (expands and
 * contracts) using rAF. The entrance uses a Motion scale+fade so the bloom
 * appears to emerge rather than snap in.
 *
 * NOTE: This project uses the `motion` package (Motion One / Framer Motion v12).
 * Imports are from `"motion/react"` — NOT `"framer-motion"`.
 */
const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 125,
  Breathing = false,
  gradientColors = [
    "#0A0A0A",
    "#2979FF",
    "#FF80AB",
    "#FF6D00",
    "#FFD600",
    "#00E676",
    "#3D5AFE",
  ],
  gradientStops = [35, 50, 60, 70, 80, 90, 100],
  animationSpeed = 0.02,
  breathingRange = 5,
  containerStyle = {},
  topOffset = 0,
  containerClassName = "",
}) => {
  if (gradientColors.length !== gradientStops.length) {
    throw new Error(
      `AnimatedGradientBackground: gradientColors and gradientStops must have the same length.\n` +
        `  gradientColors.length = ${gradientColors.length}\n` +
        `  gradientStops.length  = ${gradientStops.length}`
    );
  }

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animationFrame: number;
    let width = startingGap;
    let directionWidth = 1;

    const animate = () => {
      if (Breathing) {
        if (width >= startingGap + breathingRange) directionWidth = -1;
        if (width <= startingGap - breathingRange) directionWidth = 1;
      } else {
        directionWidth = 0;
      }

      width += directionWidth * animationSpeed;

      const stops = gradientStops
        .map((stop, i) => `${gradientColors[i]} ${stop}%`)
        .join(", ");

      const gradient = `radial-gradient(${width}% ${width + topOffset}% at 50% 20%, ${stops})`;

      if (containerRef.current) {
        containerRef.current.style.background = gradient;
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    startingGap,
    Breathing,
    gradientColors,
    gradientStops,
    animationSpeed,
    breathingRange,
    topOffset,
  ]);

  return (
    <motion.div
      key="animated-gradient-background"
      initial={{ opacity: 0, scale: 1.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: {
          duration: 2,
          ease: [0.25, 0.1, 0.25, 1],
        },
      }}
      className={`absolute inset-0 overflow-hidden ${containerClassName}`}
    >
      <div
        ref={containerRef}
        style={containerStyle}
        className="absolute inset-0"
      />
    </motion.div>
  );
};

export default AnimatedGradientBackground;
