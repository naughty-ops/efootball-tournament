import { Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function AdminSettingsPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
          Admin Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          System preferences, API tokens, and platform configurations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform Configurations</CardTitle>
          <CardDescription>Placeholder section for platform preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center rounded-xl bg-secondary/30 border border-border space-y-2">
            <Settings className="h-10 w-10 text-primary mx-auto" />
            <h3 className="font-bold text-[#0B3323]">Settings Module Reserved</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              System configuration controls and admin role settings will be expanded in later steps.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
