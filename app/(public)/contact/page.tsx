'use client';

import React, { useState } from 'react';
import { Mail, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    setSubmitted(true);
  };

  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12 text-white">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest">
          💬 Support & Inquiries
        </div>
        <h1 className="text-3xl sm:text-5xl font-black font-display tracking-wider uppercase text-white">
          Contact Community Support
        </h1>
        <p className="text-sm sm:text-base text-[#D9DCFF]/90 max-w-2xl font-medium leading-relaxed">
          Have questions regarding tournament registration, match dispute resolution, or fair play regulations? Reach out to our community organizers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {/* Contact Form */}
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] shadow-2xl p-2">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Send an Official Query
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/80 font-medium">
              We typically review and respond within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            {submitted ? (
              <div className="p-6 rounded-2xl bg-[#0A0A7A] border border-[#FFFF00]/40 text-center space-y-3 text-white animate-in fade-in">
                <div className="mx-auto h-12 w-12 rounded-full bg-[#3434FF] flex items-center justify-center text-[#FFFF00]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-black font-display uppercase">Query Received!</h3>
                <p className="text-xs text-[#D9DCFF]/90 font-medium">
                  Thank you for reaching out. A tournament administrator will review your message shortly.
                </p>
                <Button
                  onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', message: '' }); }}
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs font-bold border-white/20 text-white hover:bg-white/10"
                >
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="contact-name" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Your Full Name
                  </label>
                  <Input
                    id="contact-name"
                    required
                    placeholder="e.g. Alex Hunter"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-11 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                  />
                </div>

                <div>
                  <label htmlFor="contact-email" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Email Address
                  </label>
                  <Input
                    id="contact-email"
                    type="email"
                    required
                    placeholder="alex@domain.com"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    className="h-11 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Message Details
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                    className="w-full rounded-2xl border border-white/20 bg-[#0A0A7A] p-3 text-xs text-white placeholder:text-[#D9DCFF]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFF00] transition-colors resize-none"
                    placeholder="Describe your inquiry, tournament issue, or feedback..."
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full font-black uppercase tracking-wider h-12 gap-2 text-xs bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] rounded-full shadow-[0_0_20px_rgba(255,255,0,0.3)]"
                >
                  <Send className="h-4 w-4" />
                  <span>Submit Query</span>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Direct Channels */}
        <div className="space-y-4">
          <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
                <Mail className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black font-display uppercase tracking-wide text-white">Direct Email</h3>
                <p className="text-xs text-[#FFFF00] font-mono font-bold">ye.agrajj@gmail.com</p>
                <p className="text-[11px] text-[#D9DCFF]/70">For tournament partnership, sponsorship, or technical reports.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black font-display uppercase tracking-wide text-white">Discord & WhatsApp Hub</h3>
                <p className="text-xs text-[#D9DCFF] font-medium">Official Tournament Group</p>
                <p className="text-[11px] text-[#D9DCFF]/70">Live match scheduling, dispute resolution, and bracket coordination.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
