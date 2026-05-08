import { useEffect, useState } from 'react';

/**
 * Damga Splash — inovatif yükleme ekranı.
 *
 * Hikaye: Bir damga (mühür) havadan iniyor → kağıda vuruyor → mürekkep yayılıyor
 *         → "DAMGA" yazısı izli olarak ortaya çıkıyor.
 *
 * Tema: cream zemin + orange aksent + Bricolage Grotesque
 * Süre: ~5 saniye için tasarlandı (loop). Asıl loading bittiğinde unmount olur.
 */
const TR_MESSAGES = [
  'Damga hazırlanıyor…',
  'Kayıt zinciri doğrulanıyor…',
  'Şirket verisi yükleniyor…',
  'Kameralar uyanıyor…',
  'Hash chain bütün — devam ediyoruz…',
];

export function DamgaSplash() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setMsgIdx((i) => (i + 1) % TR_MESSAGES.length);
    }, 1200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="splash-root">
      {/* Soluk ızgara arka plan */}
      <div className="splash-grid" />

      {/* Damga sahnesi */}
      <div className="splash-stage">
        {/* Kağıt (yere değen yüzey) */}
        <div className="splash-paper">
          {/* Mürekkep dalgaları (damga çarpmasında yayılır) */}
          <span className="splash-ink splash-ink-1" />
          <span className="splash-ink splash-ink-2" />
          <span className="splash-ink splash-ink-3" />

          {/* Mürekkep izi (yarım daire — damgadan kalan iz) */}
          <div className="splash-imprint">
            <div className="splash-imprint-inner">D</div>
          </div>
        </div>

        {/* Damga (mühür) */}
        <div className="splash-stamp">
          {/* Sap */}
          <div className="splash-stamp-handle" />
          {/* Boyun */}
          <div className="splash-stamp-neck" />
          {/* Damga başı */}
          <div className="splash-stamp-head">
            <div className="splash-stamp-face">D</div>
          </div>
        </div>
      </div>

      {/* Marka */}
      <div className="splash-brand">
        <h1 className="splash-title">
          <span className="splash-letter" style={{ animationDelay: '0.7s' }}>d</span>
          <span className="splash-letter" style={{ animationDelay: '0.85s' }}>a</span>
          <span className="splash-letter" style={{ animationDelay: '1.0s' }}>m</span>
          <span className="splash-letter" style={{ animationDelay: '1.15s' }}>g</span>
          <span className="splash-letter" style={{ animationDelay: '1.3s' }}>a</span>
        </h1>
        <p className="splash-msg">{TR_MESSAGES[msgIdx]}</p>
      </div>

      {/* Yatay ilerleme barı (alt) */}
      <div className="splash-progress">
        <div className="splash-progress-bar" />
      </div>

      <style>{`
        .splash-root {
          position: fixed;
          inset: 0;
          background: #FFF4E8;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          overflow: hidden;
          font-family: 'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif;
          z-index: 9999;
        }
        .splash-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(255,107,53,.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,107,53,.06) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
          opacity: 0.7;
        }

        /* Sahne */
        .splash-stage {
          position: relative;
          width: 240px;
          height: 280px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        /* Kağıt yüzey */
        .splash-paper {
          position: relative;
          width: 200px;
          height: 80px;
          background: linear-gradient(180deg, #fffdf7 0%, #f7eedf 100%);
          border-radius: 6px;
          box-shadow:
            0 1px 0 rgba(255, 107, 53, 0.15),
            0 8px 20px rgba(192, 90, 30, 0.18),
            inset 0 -6px 12px rgba(180, 100, 40, 0.05);
          transform: perspective(400px) rotateX(20deg);
          transform-origin: bottom center;
        }

        /* Mürekkep yayılan halkalar */
        .splash-ink {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 60px;
          height: 60px;
          margin-left: -30px;
          margin-top: -30px;
          border: 2px solid #FF6B35;
          border-radius: 50%;
          opacity: 0;
          animation: splash-ink 1.8s cubic-bezier(0, 0.5, 0.3, 1) infinite;
        }
        .splash-ink-1 { animation-delay: 0.95s; }
        .splash-ink-2 { animation-delay: 1.15s; }
        .splash-ink-3 { animation-delay: 1.35s; }
        @keyframes splash-ink {
          0% { transform: scale(0.3); opacity: 0; }
          15% { opacity: 0.9; }
          100% { transform: scale(2.5); opacity: 0; }
        }

        /* Mürekkep izi (damga vuruşu) */
        .splash-imprint {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 64px;
          height: 64px;
          margin-left: -32px;
          margin-top: -32px;
          border-radius: 50%;
          background: radial-gradient(
            circle at center,
            #FF6B35 0%,
            #FF6B35 60%,
            rgba(255, 107, 53, 0.85) 75%,
            rgba(255, 107, 53, 0) 100%
          );
          opacity: 0;
          transform: scale(0.6);
          animation: splash-imprint 1.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
          animation-delay: 0.9s;
          filter: blur(0.4px);
        }
        .splash-imprint-inner {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFF4E8;
          font-weight: 800;
          font-size: 32px;
          letter-spacing: -0.04em;
        }
        @keyframes splash-imprint {
          0%, 50% { opacity: 0; transform: scale(0.6); }
          55% { opacity: 1; transform: scale(1.05); }
          70% { transform: scale(1); }
          100% { opacity: 0.95; transform: scale(1); }
        }

        /* Damga (mühür) */
        .splash-stamp {
          position: absolute;
          bottom: 80px;
          left: 50%;
          margin-left: -30px;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: splash-stamp 1.8s cubic-bezier(0.6, 0, 0.4, 1) infinite;
        }
        .splash-stamp-handle {
          width: 24px;
          height: 28px;
          background: linear-gradient(180deg, #6b2a0d 0%, #4a1d09 100%);
          border-radius: 4px 4px 0 0;
        }
        .splash-stamp-neck {
          width: 40px;
          height: 16px;
          background: linear-gradient(180deg, #8a3a14 0%, #6b2a0d 100%);
          border-radius: 4px;
          margin-top: -2px;
        }
        .splash-stamp-head {
          width: 60px;
          height: 36px;
          background: linear-gradient(180deg, #FF6B35 0%, #c55228 100%);
          border-radius: 6px;
          margin-top: -2px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          box-shadow: 0 4px 0 rgba(0, 0, 0, 0.15);
        }
        .splash-stamp-face {
          font-weight: 800;
          color: #FFF4E8;
          font-size: 22px;
          letter-spacing: -0.03em;
          transform: rotateX(180deg);
        }
        @keyframes splash-stamp {
          0% { transform: translateY(-120px) rotate(-12deg); }
          40% { transform: translateY(-120px) rotate(-12deg); }
          50% { transform: translateY(0) rotate(0deg); }
          54% { transform: translateY(2px) rotate(0deg); }
          60% { transform: translateY(0) rotate(0deg); }
          80% { transform: translateY(0) rotate(0deg); }
          100% { transform: translateY(-120px) rotate(-12deg); }
        }

        /* Marka */
        .splash-brand {
          text-align: center;
          z-index: 1;
        }
        .splash-title {
          font-size: 42px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #1a0e08;
          line-height: 1;
          margin: 0;
          display: inline-flex;
        }
        .splash-letter {
          opacity: 0;
          transform: translateY(8px);
          animation: splash-letter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes splash-letter {
          to { opacity: 1; transform: translateY(0); }
        }
        .splash-msg {
          margin-top: 8px;
          font-size: 13px;
          color: rgba(26, 14, 8, 0.55);
          letter-spacing: 0.02em;
          font-family: 'DM Mono', 'JetBrains Mono', monospace;
          height: 18px;
        }

        /* İlerleme barı */
        .splash-progress {
          position: absolute;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          width: 140px;
          height: 3px;
          background: rgba(255, 107, 53, 0.15);
          border-radius: 2px;
          overflow: hidden;
        }
        .splash-progress-bar {
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg, transparent, #FF6B35, transparent);
          animation: splash-progress 1.5s linear infinite;
        }
        @keyframes splash-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-stamp, .splash-imprint, .splash-ink, .splash-progress-bar {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
