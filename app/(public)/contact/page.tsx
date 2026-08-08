import { Mail, MessageSquare, Send } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ContactPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-8">
      <div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-[#0B3323] tracking-tight">
          Contact Community Support
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Have questions regarding upcoming eFootball tournaments or rules? Reach out below.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        <Card className="border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg">Send a Message</CardTitle>
            <CardDescription className="text-xs">We typically respond within 24 hours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#0B3323] block mb-1.5">Your Name</label>
              <Input placeholder="Player Name" className="h-10 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3323] block mb-1.5">Email Address</label>
              <Input type="email" placeholder="player@domain.com" className="h-10 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3323] block mb-1.5">Message</label>
              <textarea
                className="w-full min-h-[110px] rounded-xl border border-input bg-card p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                placeholder="How can we help?"
              />
            </div>
            <Button className="w-full font-bold h-10 gap-2 text-xs">
              <Send className="h-4 w-4" />
              <span>Submit Query</span>
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="hover:border-primary/40 transition-all">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0B3323]">Email Inquiries</h3>
                <p className="text-xs text-muted-foreground mt-0.5">support@efootball-tournaments.com</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/40 transition-all">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0B3323]">Discord Community</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Join #efootball-tournaments on Discord</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
