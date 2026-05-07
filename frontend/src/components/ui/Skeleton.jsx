export function Skeleton({ className = '' }) {
  return (
    <div className={`bg-[#1a1a1a] animate-pulse rounded ${className}`} />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-[#131313] rounded-xl p-6 space-y-4 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}
