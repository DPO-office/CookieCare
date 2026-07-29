import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ·· Set favicon to match the sidebar ShieldCheck logo ······················
(function setFavicon() {
  const SIZE = 64;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Rounded square background (#EBF4FD, matches sidebar icon container)
  const R = 14;
  ctx.beginPath();
  ctx.moveTo(R, 0);
  ctx.lineTo(SIZE - R, 0);
  ctx.quadraticCurveTo(SIZE, 0, SIZE, R);
  ctx.lineTo(SIZE, SIZE - R);
  ctx.quadraticCurveTo(SIZE, SIZE, SIZE - R, SIZE);
  ctx.lineTo(R, SIZE);
  ctx.quadraticCurveTo(0, SIZE, 0, SIZE - R);
  ctx.lineTo(0, R);
  ctx.quadraticCurveTo(0, 0, R, 0);
  ctx.closePath();
  ctx.fillStyle = "#EBF4FD";
  ctx.fill();

  // Lucide ShieldCheck — viewBox 0 0 24 24, scaled & centred
  const SCALE = SIZE / 24 * 0.72;
  const OFFSET = (SIZE - 24 * SCALE) / 2;
  ctx.save();
  ctx.translate(OFFSET, OFFSET);
  ctx.scale(SCALE, SCALE);
  ctx.strokeStyle = "#2175D9";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Shield body
  ctx.beginPath();
  ctx.moveTo(12, 22);
  ctx.bezierCurveTo(12, 22, 20, 18, 20, 12);
  ctx.lineTo(20, 5);
  ctx.lineTo(12, 2);
  ctx.lineTo(4, 5);
  ctx.lineTo(4, 12);
  ctx.bezierCurveTo(4, 18, 12, 22, 12, 22);
  ctx.closePath();
  ctx.stroke();

  // Checkmark  m9 12 l2 2 l4 -4
  ctx.beginPath();
  ctx.moveTo(9, 12);
  ctx.lineTo(11, 14);
  ctx.lineTo(15, 10);
  ctx.stroke();

  ctx.restore();

  // Inject into <head>
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = canvas.toDataURL("image/png");
})();
// ···········································································

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
