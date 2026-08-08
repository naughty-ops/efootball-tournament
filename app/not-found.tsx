import Link from 'next/link';
import { Gamepad2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F8F5] p-4 text-center">
      <div className="max-w-md space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary text-primary border border-primary/20 shadow-inner">
          <Gamepad2 className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Error 404
          </span>
          <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
            Page Offside!
          </h1>
          <p className="text-sm text-muted-foreground">
            The page or tournament fixture you are searching for does not exist or has been relocated.
          </p>
        </div>

        <Button asChild className="font-bold gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Home</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
