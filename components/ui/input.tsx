import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-2xl border border-white/20 bg-[#0A0A7A] px-4 py-2.5 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#D9DCFF]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFF00] focus-visible:ring-offset-1 focus-visible:border-[#FFFF00] disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
