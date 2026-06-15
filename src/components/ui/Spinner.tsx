export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-neon-purple/30 border-t-neon-purple"
      style={{ width: size, height: size }}
    />
  );
}

export function FullSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 py-20">
      <Spinner size={36} />
      {label && <p className="text-ink-muted text-sm">{label}</p>}
    </div>
  );
}
