import { cn } from './cn'

/** Grey bar in the shape of the content it stands in for. No shimmer (cheap CPUs). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-3.5 rounded-md bg-line', className)} />
}

export function ResultCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-paper px-4 py-3.5">
      <div className="flex justify-between">
        <Skeleton className="h-[18px] w-[55%]" />
        <Skeleton className="w-[15%]" />
      </div>
      <Skeleton className="w-[70%]" />
      <Skeleton className="h-4 w-[60%]" />
      <Skeleton className="w-[35%]" />
    </div>
  )
}
