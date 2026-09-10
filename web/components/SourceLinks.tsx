import type { SourceLink } from '@/lib/types';

export function SourceLinks({ sources }: { sources: SourceLink[] }) {
  if (!sources.length) return null;
  return (
    <div className="refs">
      {sources.map((s) =>
        s.url ? (
          <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.label}
          </a>
        ) : (
          <span key={s.label}>{s.label}</span>
        ),
      )}
    </div>
  );
}
