"use client";

type StickyActionBarProps = {
  children: React.ReactNode;
  className?: string;
};

// För mobilnära CTA längre fram i preview/run eller andra sidor.
export default function StickyActionBar({
  children,
  className = "",
}: StickyActionBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div
          className={`rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/85 ${className}`.trim()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}