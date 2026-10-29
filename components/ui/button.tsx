import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-black transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFF00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08088F] disabled:pointer-events-none disabled:opacity-50 active:scale-95',
  {
    variants: {
      variant: {
        default:
          'bg-[#FFFF00] text-[#08088F] uppercase tracking-wider shadow-md hover:bg-yellow-300 hover:shadow-lg',
        outline:
          'border-2 border-white/60 bg-transparent text-white hover:bg-white/15 hover:border-white',
        secondary:
          'bg-[#1010C5] text-white hover:bg-[#3434FF] border border-white/20',
        ghost:
          'hover:bg-white/15 hover:text-white',
        link: 'text-[#FFFF00] underline-offset-4 hover:underline hover:text-yellow-300',
        glow:
          'bg-[#FFFF00] text-[#08088F] uppercase tracking-wider shadow-[0_0_24px_rgba(255,255,0,0.6)] hover:bg-yellow-300 hover:shadow-[0_0_32px_rgba(255,255,0,0.8)]',
        destructive:
          'bg-[#FF2E56] text-white hover:bg-red-600 shadow-md',
      },
      size: {
        default: 'h-11 px-6 py-2.5',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-13 px-8 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
