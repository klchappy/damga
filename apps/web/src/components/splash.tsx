/**
 * Damga Splash — yükleme ekranı.
 * Tema: cream + orange + Bricolage Grotesque
 * Animasyon: damga vuran logo (rotate + scale) + dalga halkaları
 */
export function DamgaSplash({ message = 'Hazırlanıyor…' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream relative overflow-hidden">
      {/* Arka plan dalga halkaları */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="splash-ring splash-ring-1" />
        <div className="splash-ring splash-ring-2" />
        <div className="splash-ring splash-ring-3" />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Damga logo — pulse + tilt */}
        <div className="relative">
          <div className="splash-logo">
            <svg
              width="80"
              height="80"
              viewBox="0 0 80 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Damga halkası */}
              <circle cx="40" cy="40" r="36" stroke="#FF6B35" strokeWidth="3" />
              <circle cx="40" cy="40" r="28" fill="#FF6B35" />
              {/* D harfi */}
              <text
                x="40"
                y="52"
                textAnchor="middle"
                fontFamily="Bricolage Grotesque, serif"
                fontWeight="800"
                fontSize="32"
                fill="#FFF4E8"
              >
                D
              </text>
            </svg>
          </div>
          {/* Damga gölgesi (vurma efekti) */}
          <div className="splash-stamp-shadow" />
        </div>

        {/* Marka adı */}
        <div className="text-center space-y-1">
          <div className="font-display font-bold text-2xl text-ink tracking-tight">
            damga
          </div>
          <div className="text-xs text-muted font-mono">{message}</div>
        </div>

        {/* Yükleme barı (kayan damga noktaları) */}
        <div className="flex gap-1.5 mt-2">
          <span className="splash-dot" style={{ animationDelay: '0ms' }} />
          <span className="splash-dot" style={{ animationDelay: '150ms' }} />
          <span className="splash-dot" style={{ animationDelay: '300ms' }} />
        </div>
      </div>

      <style>{`
        .splash-logo {
          animation: splash-stamp 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
          transform-origin: center;
        }
        @keyframes splash-stamp {
          0% { transform: translateY(-20px) rotate(-8deg) scale(1); }
          40% { transform: translateY(0) rotate(0deg) scale(1.05); }
          50% { transform: translateY(2px) rotate(2deg) scale(0.98); }
          60% { transform: translateY(0) rotate(0deg) scale(1); }
          100% { transform: translateY(-20px) rotate(-8deg) scale(1); }
        }
        .splash-stamp-shadow {
          position: absolute;
          left: 50%;
          bottom: -10px;
          transform: translateX(-50%);
          width: 60px;
          height: 8px;
          background: rgba(255, 107, 53, 0.2);
          border-radius: 50%;
          filter: blur(4px);
          animation: splash-shadow 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
        }
        @keyframes splash-shadow {
          0%, 100% { transform: translateX(-50%) scaleX(0.6); opacity: 0.15; }
          50% { transform: translateX(-50%) scaleX(1); opacity: 0.4; }
        }
        .splash-ring {
          position: absolute;
          border: 2px solid #FF6B35;
          border-radius: 50%;
          opacity: 0;
          animation: splash-wave 2.4s ease-out infinite;
        }
        .splash-ring-1 {
          width: 200px; height: 200px; animation-delay: 0s;
        }
        .splash-ring-2 {
          width: 200px; height: 200px; animation-delay: 0.8s;
        }
        .splash-ring-3 {
          width: 200px; height: 200px; animation-delay: 1.6s;
        }
        @keyframes splash-wave {
          0% { transform: scale(0.4); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .splash-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #FF6B35;
          animation: splash-dot 1.2s ease-in-out infinite;
        }
        @keyframes splash-dot {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
