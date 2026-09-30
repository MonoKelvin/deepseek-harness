import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-success/25 bg-success/12 text-success',
        secondary: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border bg-transparent text-foreground',
        warning: 'border-warning/25 bg-warning/12 text-warning',
        info: 'border-info/25 bg-info/12 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/** Shadcn badge primitive used for lifecycle state only. */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
