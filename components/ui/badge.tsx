import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[#FFFF00] text-[#08088F] shadow-xs uppercase tracking-wide',
        secondary:
          'border-transparent bg-[#1010C5] text-white',
        destructive:
          'border-transparent bg-[#FF2E56] text-white',
        outline:
          'text-white border-white/40 bg-white/10',
        efootball:
          'border-transparent bg-[#3434FF] text-white shadow-xs',
        pink:
          'border-transparent bg-[#FF168B] text-white shadow-sm',
        lime:
          'border-transparent bg-[#FFFF00] text-[#08088F]',
        live:
          'border-transparent bg-[#FF168B] text-white animate-pulse shadow-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
