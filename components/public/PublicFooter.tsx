import Link from 'next/link';
import { Trophy } from 'lucide-react';

export default function PublicFooter() {
  return (
    <footer className="w-full border-t border-border bg-white mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Trophy className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0B3323]">eFootball Tournament Platform</p>
              <p className="text-xs text-muted-foreground">Competitive Esports Fixtures & Results</p>
            </div>
          </div>

          <div className="flex items-center space-x-6 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <Link href="/tournaments" className="hover:text-primary transition-colors">Tournaments</Link>
            <Link href="/about" className="hover:text-primary transition-colors">About</Link>
            <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
          </div>

          <div className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} eFootball Community. Read-Only Public Portal.
          </div>
        </div>
      </div>
    </footer>
  );
}
