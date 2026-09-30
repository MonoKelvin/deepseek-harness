import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'primary-button rounded-full text-sm text-primary-foreground enabled:hover:-translate-y-px enabled:hover:shadow-md enabled:hover:shadow-primary/15 enabled:active:translate-y-0 enabled:active:shadow-none',
        utility: 'action-expand rounded-full text-foreground',
        ghost: 'text-muted-foreground enabled:hover:bg-foreground/5 enabled:hover:text-foreground enabled:active:bg-foreground/10',
        tab: 'text-xs text-muted-foreground hover:text-foreground active:bg-foreground/5 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm',
        'tab-sm': 'text-xs text-muted-foreground hover:text-foreground active:bg-foreground/5 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm h-6 px-2',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-2',
        icon: 'h-8 w-8 text-xs',
        tool: 'h-9 min-w-9 px-2.5 gap-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={type} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
