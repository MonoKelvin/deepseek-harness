import * as React from 'react'
import { cn } from '@/lib/utils'

/** Shadcn skeleton primitive for status loading placeholders. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export { Skeleton }
