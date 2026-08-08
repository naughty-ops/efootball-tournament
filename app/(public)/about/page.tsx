import { Shield, Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-8">
      <div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-[#0B3323] tracking-tight">
          About eFootball Platform
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
          The eFootball Tournament Platform is designed as an esports hub for competitive gaming, transparent bracket generation, real-time match tracking, and global player rankings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <Card className="hover:border-primary/50 transition-all">
          <CardHeader className="space-y-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Trophy className="h-5 w-5" />
            </div>
            <CardTitle className="text-base sm:text-lg">Public Read-Only Portal</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Enables football gaming fans and players to view active fixtures, match scores, and official standings without authentication friction.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:border-primary/50 transition-all">
          <CardHeader className="space-y-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <CardTitle className="text-base sm:text-lg">Admin Management Panel</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Protected administration dashboard for managing brackets, verifying player scores, and scheduling tournaments securely.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
