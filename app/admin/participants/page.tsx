import { Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function AdminParticipantsPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
          Participant Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Player registrations, seeding numbers, and participant statuses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Player Management Module</CardTitle>
          <CardDescription>Placeholder section for player registration and seeding.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center rounded-xl bg-secondary/30 border border-border space-y-2">
            <Users className="h-10 w-10 text-primary mx-auto" />
            <h3 className="font-bold text-[#0B3323]">Participant Roster Module Reserved</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Player registration forms, CSV uploads, and seeding controls will be implemented in future steps.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
