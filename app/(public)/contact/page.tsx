'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { Mail, MessageSquare, Send, CheckCircle2, ShieldAlert, UploadCloud, FileImage, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createSupportTicketAction } from '@/app/actions/ticketActions';

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketResult, setTicketResult] = useState<{ ticketNumber: string; ticketId: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: 'technical_support',
    subject: '',
    message: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2 MB limit. Please select a smaller screenshot.');
      setSelectedFile(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Only image files (JPEG, PNG, WEBP) are accepted as proof.');
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setError('Please fill in all required fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let evidenceFormData: FormData | undefined;
      if (selectedFile) {
        evidenceFormData = new FormData();
        evidenceFormData.append('file', selectedFile);
      }

      const res = await createSupportTicketAction({
        name: formData.name,
        email: formData.email,
        category: formData.category,
        subject: formData.subject || `${formData.category.replace(/_/g, ' ')} Inquiry`,
        description: formData.message,
        evidenceFile: evidenceFormData,
      });

      if (res.success && res.data) {
        setTicketResult(res.data);
      } else {
        setError(res.error || 'Failed to submit inquiry. Please try again.');
      }
    } catch (err: any) {
      console.error('Contact submission error:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-16 text-white px-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFF00] text-[#08088F] text-[11px] font-black uppercase tracking-widest">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Operations & Support Desk</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black font-display tracking-wider uppercase text-white">
          Contact Community Support
        </h1>
        <p className="text-sm sm:text-base text-[#D9DCFF]/90 max-w-2xl font-medium leading-relaxed">
          Need assistance with tournament registration, match dispute resolution, or fair play regulations? Submit an official ticket to our tournament operations team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
        {/* Contact Form Card */}
        <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] shadow-2xl p-2">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-xl font-black font-display uppercase tracking-wide text-white">
              Submit Official Ticket
            </CardTitle>
            <CardDescription className="text-xs text-[#D9DCFF]/80 font-medium">
              Every inquiry generates a tracked ticket number with monitored administrator resolution.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            {ticketResult ? (
              <div className="p-6 rounded-2xl bg-[#0A0A7A] border border-[#00C853]/50 text-center space-y-4 text-white animate-in fade-in">
                <div className="mx-auto h-14 w-14 rounded-full bg-[#00C853]/20 border border-[#00C853]/40 flex items-center justify-center text-[#00C853]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black font-display uppercase text-white">Ticket Registered!</h3>
                  <div className="mt-2 inline-block px-3 py-1 rounded-xl bg-[#1818D4] border border-[#FFFF00]/40 text-[#FFFF00] font-mono font-bold text-sm">
                    Ref: {ticketResult.ticketNumber}
                  </div>
                </div>
                <p className="text-xs text-[#D9DCFF]/90 font-medium leading-relaxed">
                  Thank you for contacting tournament operations. Your inquiry has been routed to our staff queue. You can track this reference anytime.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                  <Button
                    asChild
                    size="sm"
                    className="rounded-full bg-[#FFFF00] text-[#08088F] font-black text-xs uppercase tracking-wider hover:bg-[#FFFF00]/90"
                  >
                    <Link href="/dashboard/tickets">
                      View In My Tickets
                    </Link>
                  </Button>
                  <Button
                    onClick={() => {
                      setTicketResult(null);
                      setFormData({
                        name: '',
                        email: '',
                        category: 'technical_support',
                        subject: '',
                        message: '',
                      });
                      setSelectedFile(null);
                    }}
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs font-bold border-white/20 text-white hover:bg-white/10"
                  >
                    Submit Another Query
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-xs text-[#FF3B30] font-bold">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="contact-name" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Your Full Name *
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
                    Email Address *
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
                  <label htmlFor="contact-category" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Inquiry Category *
                  </label>
                  <select
                    id="contact-category"
                    value={formData.category}
                    onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full h-11 px-3 text-xs bg-[#0A0A7A] border border-white/20 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#FFFF00]"
                  >
                    <option value="technical_support">Technical Support</option>
                    <option value="match_dispute">Match Dispute / Score Conflict</option>
                    <option value="tournament_issue">Tournament Registration Issue</option>
                    <option value="player_complaint">Player Conduct Complaint</option>
                    <option value="score_disagreement">Score Disagreement</option>
                    <option value="other">General Feedback / Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="contact-subject" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Subject Line
                  </label>
                  <Input
                    id="contact-subject"
                    placeholder="Brief summary of your query"
                    value={formData.subject}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                    className="h-11 text-xs bg-[#0A0A7A] border-white/20 text-white placeholder:text-[#D9DCFF]/40 rounded-2xl"
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Message Details *
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                    className="w-full rounded-2xl border border-white/20 bg-[#0A0A7A] p-3 text-xs text-white placeholder:text-[#D9DCFF]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFF00] transition-colors resize-none"
                    placeholder="Describe your inquiry, match details, or feedback with relevant details..."
                  />
                </div>

                {/* Optional Screenshot Attachment */}
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block mb-1.5">
                    Screenshot Evidence (Optional, Max 2 MB)
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0A0A7A] border border-[#00C853]/40 text-xs">
                      <div className="flex items-center gap-2 text-[#00C853] truncate">
                        <FileImage className="h-4 w-4 shrink-0" />
                        <span className="truncate font-bold">{selectedFile.name}</span>
                        <span className="text-[10px] text-white/50">
                          ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-white/60 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3 px-4 rounded-2xl border border-dashed border-white/20 bg-[#0A0A7A]/50 hover:bg-[#0A0A7A] text-white/70 hover:text-white flex items-center justify-center gap-2 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <UploadCloud className="h-4 w-4 text-[#FFFF00]" />
                      <span>Attach Screenshot Proof</span>
                    </button>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full font-black uppercase tracking-wider h-12 gap-2 text-xs bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] rounded-full shadow-[0_0_20px_rgba(255,255,0,0.3)] cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  <span>{isSubmitting ? 'Registering Ticket...' : 'Submit Support Ticket'}</span>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Direct Channels & Operational Notice */}
        <div className="space-y-4">
          <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 shadow-xl">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-[#FFFF00] text-xs font-black uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4" />
                <span>Monitored Support SLA</span>
              </div>
              <h3 className="text-base font-black font-display uppercase tracking-wide text-white">
                Fast Operational Triage
              </h3>
              <p className="text-xs text-[#D9DCFF]/80 leading-relaxed">
                Tickets are reviewed by verified tournament organizers. Urgent match disputes submitted during active knockout stages receive priority handling within minutes.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
                <Mail className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black font-display uppercase tracking-wide text-white">Direct Admin Contact</h3>
                <p className="text-xs text-[#FFFF00] font-mono font-bold">ye.agrajj@gmail.com</p>
                <p className="text-[11px] text-[#D9DCFF]/70">For sponsorship, official tournament partnerships, or legal inquiries.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1818D4] border-white/20 text-white rounded-[28px] p-2 hover:border-[#FFFF00] transition-all shadow-xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A0A7A] text-[#FFFF00] shadow-md">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black font-display uppercase tracking-wide text-white">Community WhatsApp & Discord</h3>
                <p className="text-xs text-[#D9DCFF] font-medium">Official Tournament Group</p>
                <p className="text-[11px] text-[#D9DCFF]/70">Live match scheduling, room code exchange, and bracket coordination.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
