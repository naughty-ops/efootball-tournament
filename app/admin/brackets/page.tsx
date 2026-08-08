import { GitBranch } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function AdminBracketsPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
          Bracket Generation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Knockout trees, group stage arrangements, and seeding assignments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bracket Engine Module</CardTitle>
          <CardDescription>Placeholder section for automated bracket generation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center rounded-xl bg-secondary/30 border border-border space-y-2">
            <GitBranch className="h-10 w-10 text-primary mx-auto" />
            <h3 className="font-bold text-[#0B3323]">Bracket Generator Reserved</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Automated single/double elimination bracket trees and group progression logic will be integrated in subsequent steps.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
