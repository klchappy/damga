import { useEffect, useState } from 'react';

/**
 * DamgaSplash — modern tech splash.
 *
 * Tasarım dili: holographic + cipher + neon glow. Damga'nın "append-only hash
 * chain" doğasına göndermeli — bir şifre/kasa açılıyor hissi.
 *
 * Kompozisyon:
 *  - Cream zemin + slow-moving orange gradient blobs + ince hex grid
 *  - Merkezde glassmorphism kart + içinde dönen halka + neon "D" SVG
 *  - "DAMGA" letterspaced uppercase (mono font) — staggered fade-in
 *  - Cipher status mesajı: random-ish glyph karıştırma efektiyle değişir
 *  - Alt: 4 noktalı yürüyen yükleyici + sweep scanline
 */

const TR_MESSAGES = [
  'BAĞLANTI BAŞLATILIYOR',
  'CIPHER DOĞRULANIYOR',
  'HASH ZİNCİRİ TARANIYOR',
  'KAYIT DEFTERİ AÇILIYOR',
  'YOLCULUĞA HAZIR',
];

const CIPHER_GLYPHS = '01ΔΣΞΛφΩ░▒█▌▐';

export function DamgaSplash() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [glyph, setGlyph] = useState('');

  // Mesajı her 1.4sn'de değiştir
  useEffect(() => {
    const t = window.setInterval(() => {
      setMsgIdx((i) => (i + 1) % TR_MESSAGES.length);
    }, 1400);
    return () => window.clearInterval(t);
  }, []);

  // Cipher glyph karıştır — mesajın yanında "scanning" hissi verir
  useEffect(() => {
    const t = window.setInterval(() => {
      const len = 6;
      let s = '';
      for (let i = 0; i < len; i++) {
        s += CIPHER_GLYPHS[Math.floor(Math.random() * CIPHER_GLYPHS.length)];
      }
      setGlyph(s);
    }, 90);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="dsplash-root" role="status" aria-label="Damga yükleniyor">
      {/* Slow-moving orange gradient blobs */}
      <div className="dsplash-blob dsplash-blob-1" />
      <div className="dsplash-blob dsplash-blob-2" />

      {/* Dot/hex grid */}
      <div className="dsplash-grid" />

      {/* Vignette */}
      <div className="dsplash-vignette" />

      <div className="dsplash-stage">
        {/* Glass card */}
        <div className="dsplash-card">
          {/* Conic-rotating gradient ring + neon D */}
          <div className="dsplash-emblem">
            <div className="dsplash-ring" />
            <div className="dsplash-ring-inner" />

            <svg
              className="dsplash-d"
              viewBox="0 0 120 140"
              width="100"
              height="116"
              fill="none"
              aria-hidden
            >
              <defs>
                <linearGradient id="dsplash-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FFB07A" />
                  <stop offset="100%" stopColor="#FF6B35" />
                </linearGradient>
                <filter id="dsplash-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Outer geometric D */}
              <path
                className="dsplash-d-outer"
                d="M 18 10 L 18 130 L 60 130 Q 110 130 110 70 Q 110 10 60 10 Z"
                stroke="url(#dsplash-grad)"
                strokeWidth="3.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                filter="url(#dsplash-glow)"
              />
              {/* Inner echo */}
              <path
                className="dsplash-d-inner"
                d="M 32 28 L 32 112 L 60 112 Q 92 112 92 70 Q 92 28 60 28 Z"
                stroke="#FF6B35"
                strokeWidth="1.5"
                strokeOpacity="0.55"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Circuit accents (left) */}
              <line
                className="dsplash-d-acc dsplash-d-acc-1"
                x1="6"
                y1="40"
                x2="18"
                y2="40"
                stroke="url(#dsplash-grad)"
                strokeWidth="2"
              />
              <line
                className="dsplash-d-acc dsplash-d-acc-2"
                x1="6"
                y1="100"
                x2="18"
                y2="100"
                stroke="url(#dsplash-grad)"
                strokeWidth="2"
              />
              {/* Right diode dots */}
              <circle
                className="dsplash-d-dot dsplash-d-dot-1"
                cx="110"
                cy="50"
                r="2"
                fill="#FF6B35"
              />
              <circle
                className="dsplash-d-dot dsplash-d-dot-2"
                cx="110"
                cy="90"
                r="2"
                fill="#FF6B35"
              />
              {/* Center pulse */}
              <circle
                className="dsplash-d-pulse"
                cx="60"
                cy="70"
                r="3"
                fill="url(#dsplash-grad)"
                filter="url(#dsplash-glow)"
              />
            </svg>
          </div>

          {/* DAMGA wordmark */}
          <h1 className="dsplash-wordmark">
            {['D', 'A', 'M', 'G', 'A'].map((c, i) => (
              <span
                key={i}
                className="dsplash-letter"
                style={{ animationDelay: `${0.7 + i * 0.08}s` }}
              >
                {c}
              </span>
            ))}
          </h1>

          {/* Walker dots */}
          <div className="dsplash-walker" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>

          {/* Cipher / status line */}
          <div className="dsplash-status">
            <span className="dsplash-status-glyph">{glyph}</span>
            <span className="dsplash-status-msg">{TR_MESSAGES[msgIdx]}</span>
          </div>
        </div>

        {/* Sweeping scanline below card */}
        <div className="dsplash-scanline">
          <div className="dsplash-scanline-bar" />
        </div>
      </div>

      <style>{`
        .dsplash-root {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background:
            radial-gradient(1200px 600px at 50% 50%, rgba(255, 134, 71, 0.10), transparent 60%),
            #FFF4E8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif;
          overflow: hidden;
          color: #1a0e08;
        }

        /* Background blobs */
        .dsplash-blob {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.55;
          pointer-events: none;
          will-change: transform;
        }
        .dsplash-blob-1 {
          background: radial-gradient(circle at 30% 30%, #FF6B35, transparent 60%);
          top: -120px;
          left: -100px;
          animation: dsplash-blob1 14s ease-in-out infinite alternate;
        }
        .dsplash-blob-2 {
          background: radial-gradient(circle at 70% 70%, #FFA15C, transparent 60%);
          bottom: -160px;
          right: -120px;
          animation: dsplash-blob2 16s ease-in-out infinite alternate;
        }
        @keyframes dsplash-blob1 {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(120px, 60px) scale(1.1); }
        }
        @keyframes dsplash-blob2 {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-100px, -50px) scale(1.05); }
        }

        /* Hex/dot grid */
        .dsplash-grid {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 1px 1px, rgba(255, 107, 53, 0.18) 1px, transparent 0);
          background-size: 24px 24px;
          mask-image: radial-gradient(circle at center, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 75%);
          opacity: 0.55;
          pointer-events: none;
        }

        .dsplash-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(ellipse at center, transparent 60%, rgba(255, 244, 232, 0.6) 100%);
        }

        .dsplash-stage {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
        }

        /* Glass card */
        .dsplash-card {
          position: relative;
          width: 320px;
          padding: 28px 24px 20px;
          border-radius: 28px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.55));
          backdrop-filter: blur(22px) saturate(140%);
          -webkit-backdrop-filter: blur(22px) saturate(140%);
          border: 1px solid rgba(255, 107, 53, 0.18);
          box-shadow:
            0 20px 60px -25px rgba(255, 107, 53, 0.45),
            0 1px 0 rgba(255, 255, 255, 0.7) inset;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        /* Emblem stage */
        .dsplash-emblem {
          position: relative;
          width: 160px;
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Outer rotating conic ring */
        .dsplash-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(from 0deg,
            #FF6B35 0deg,
            #FFB07A 90deg,
            transparent 140deg,
            transparent 220deg,
            #FFB07A 270deg,
            #FF6B35 360deg);
          mask: radial-gradient(circle, transparent 67px, black 68px, black 78px, transparent 79px);
          -webkit-mask: radial-gradient(circle, transparent 67px, black 68px, black 78px, transparent 79px);
          animation: dsplash-spin 6s linear infinite;
          filter: drop-shadow(0 0 12px rgba(255, 107, 53, 0.45));
        }
        .dsplash-ring-inner {
          position: absolute;
          inset: 18px;
          border-radius: 50%;
          border: 1px dashed rgba(255, 107, 53, 0.35);
          animation: dsplash-spin-r 18s linear infinite;
        }
        @keyframes dsplash-spin    { to { transform: rotate(360deg); } }
        @keyframes dsplash-spin-r  { to { transform: rotate(-360deg); } }

        /* Neon "D" — paths animate stroke-dashoffset */
        .dsplash-d {
          position: relative;
          z-index: 1;
        }
        .dsplash-d-outer {
          stroke-dasharray: 360;
          stroke-dashoffset: 360;
          animation: dsplash-draw 1.4s cubic-bezier(0.65, 0, 0.35, 1) 0.15s forwards,
                     dsplash-pulse 2.6s ease-in-out 1.6s infinite;
        }
        .dsplash-d-inner {
          stroke-dasharray: 280;
          stroke-dashoffset: 280;
          animation: dsplash-draw 1.4s cubic-bezier(0.65, 0, 0.35, 1) 0.55s forwards;
        }
        .dsplash-d-acc {
          stroke-dasharray: 14;
          stroke-dashoffset: 14;
          opacity: 0;
        }
        .dsplash-d-acc-1 { animation: dsplash-draw-acc 0.4s ease-out 1.05s forwards; }
        .dsplash-d-acc-2 { animation: dsplash-draw-acc 0.4s ease-out 1.20s forwards; }
        .dsplash-d-dot {
          opacity: 0;
          transform-origin: center;
          animation: dsplash-dot-on 0.4s ease-out forwards;
        }
        .dsplash-d-dot-1 { animation-delay: 1.35s; }
        .dsplash-d-dot-2 { animation-delay: 1.50s; }
        .dsplash-d-pulse {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation: dsplash-dot-on 0.3s ease-out 1.65s forwards,
                     dsplash-pulse-c 1.6s ease-in-out 2s infinite;
        }
        @keyframes dsplash-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes dsplash-draw-acc {
          0% { opacity: 0; stroke-dashoffset: 14; }
          100% { opacity: 1; stroke-dashoffset: 0; }
        }
        @keyframes dsplash-dot-on {
          to { opacity: 1; }
        }
        @keyframes dsplash-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(255, 107, 53, 0.6)); }
          50% { filter: drop-shadow(0 0 14px rgba(255, 107, 53, 0.9)); }
        }
        @keyframes dsplash-pulse-c {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.6); }
        }

        /* Wordmark */
        .dsplash-wordmark {
          margin: 0;
          font-family: 'JetBrains Mono', 'DM Mono', ui-monospace, Consolas, monospace;
          font-weight: 700;
          font-size: 26px;
          letter-spacing: 0.42em;
          padding-left: 0.42em; /* tracking compensation */
          color: #1a0e08;
          line-height: 1;
          display: inline-flex;
        }
        .dsplash-letter {
          opacity: 0;
          transform: translateY(6px);
          animation: dsplash-letter-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          background: linear-gradient(180deg, #1a0e08 0%, #4a2410 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        @keyframes dsplash-letter-in {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Walker dots */
        .dsplash-walker {
          display: flex;
          gap: 6px;
        }
        .dsplash-walker span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #FF6B35;
          opacity: 0.25;
          animation: dsplash-walker 1.2s ease-in-out infinite;
        }
        .dsplash-walker span:nth-child(1) { animation-delay: 0s; }
        .dsplash-walker span:nth-child(2) { animation-delay: 0.15s; }
        .dsplash-walker span:nth-child(3) { animation-delay: 0.30s; }
        .dsplash-walker span:nth-child(4) { animation-delay: 0.45s; }
        @keyframes dsplash-walker {
          0%, 100% { opacity: 0.25; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.25); box-shadow: 0 0 8px rgba(255, 107, 53, 0.65); }
        }

        /* Status / cipher line */
        .dsplash-status {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'JetBrains Mono', 'DM Mono', ui-monospace, Consolas, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: rgba(26, 14, 8, 0.55);
          height: 14px;
        }
        .dsplash-status-glyph {
          color: #FF6B35;
          opacity: 0.85;
          letter-spacing: 0;
          font-weight: 600;
        }
        .dsplash-status-msg {
          text-transform: uppercase;
          animation: dsplash-msg-in 0.3s ease-out;
        }
        @keyframes dsplash-msg-in {
          0%   { opacity: 0; transform: translateX(2px); filter: blur(2px); }
          100% { opacity: 1; transform: translateX(0);   filter: blur(0); }
        }

        /* Sweeping scanline below card */
        .dsplash-scanline {
          width: 220px;
          height: 2px;
          background: rgba(255, 107, 53, 0.12);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }
        .dsplash-scanline-bar {
          position: absolute;
          inset: 0;
          width: 60px;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(255, 107, 53, 0.5) 30%,
            #FF6B35 50%,
            rgba(255, 107, 53, 0.5) 70%,
            transparent 100%);
          animation: dsplash-sweep 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          filter: drop-shadow(0 0 6px rgba(255, 107, 53, 0.8));
        }
        @keyframes dsplash-sweep {
          0%   { transform: translateX(-60px); }
          100% { transform: translateX(220px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .dsplash-blob,
          .dsplash-ring,
          .dsplash-ring-inner,
          .dsplash-d-outer,
          .dsplash-d-inner,
          .dsplash-d-acc,
          .dsplash-d-dot,
          .dsplash-d-pulse,
          .dsplash-walker span,
          .dsplash-scanline-bar {
            animation: none !important;
          }
          .dsplash-d-outer, .dsplash-d-inner, .dsplash-d-acc {
            stroke-dashoffset: 0 !important;
          }
          .dsplash-d-dot, .dsplash-d-pulse, .dsplash-letter {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
