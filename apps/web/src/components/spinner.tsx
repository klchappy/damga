/**
 * Damga küçük loading spinner — sayfa içi loading state'leri için.
 * Splash'in mini versiyonu (sadece dot pulse).
 */
export function MiniSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-muted">
      <span className="flex gap-1">
        <span className="mini-dot" style={{ animationDelay: '0ms' }} />
        <span className="mini-dot" style={{ animationDelay: '150ms' }} />
        <span className="mini-dot" style={{ animationDelay: '300ms' }} />
      </span>
      {label && <span className="text-sm">{label}</span>}
      <style>{`
        .mini-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #FF6B35;
          display: inline-block;
          animation: mini-dot 1.2s ease-in-out infinite;
        }
        @keyframes mini-dot {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
