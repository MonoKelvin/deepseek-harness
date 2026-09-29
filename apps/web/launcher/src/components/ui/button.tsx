import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d11] disabled:pointer-events-none disabled:opacity-35 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'border border-blue-300/60 bg-blue-500 text-white shadow-[0_8px_20px_rgba(65,113,198,0.22),inset_0_1px_0_rgba(255,255,255,0.2)] hover:-translate-y-px hover:border-blue-200/75 hover:bg-blue-400',
        secondary: 'border border-slate-600/70 bg-slate-800/70 text-slate-200 hover:-translate-y-px hover:border-slate-500 hover:bg-slate-700/80 hover:text-white',
        destructive: 'border border-rose-300/35 bg-rose-400/10 text-rose-200 hover:-translate-y-px hover:border-rose-300/60 hover:bg-rose-400/15 hover:text-rose-100',
        ghost: 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100',
      },
      size: {
        default: 'min-h-10 px-3.5',
        sm: 'min-h-8 px-2.5',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

/** Shadcn button primitive with the launcher's restrained desktop styling. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
