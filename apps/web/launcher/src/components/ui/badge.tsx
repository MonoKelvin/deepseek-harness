import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex min-h-7 items-center gap-2 rounded-full border px-2.5 text-[11px] font-semibold tracking-[0.01em]', {
  variants: {
    variant: {
      default: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
      secondary: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
      outline: 'border-slate-500/40 bg-transparent text-slate-300',
      warning: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
      info: 'border-blue-300/30 bg-blue-400/10 text-blue-200',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

/** Shadcn badge primitive used for lifecycle state only. */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
