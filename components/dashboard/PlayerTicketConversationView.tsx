'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ShieldAlert,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  FileImage,
  X,
  UploadCloud,
  ZoomIn,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { UnifiedTicket, TicketMessage } from '@/types/tickets';
import { sendTicketMessageAction } from '@/app/actions/ticketActions';

interface PlayerTicketConversationViewProps {
  ticket: UnifiedTicket;
  messages: TicketMessage[];
}

export default function PlayerTicketConversationView({
  ticket,
  messages,
}: PlayerTicketConversationViewProps) {
  const router = useRouter();
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'File size exceeds the 2 MB limit.' });
      setSelectedFile(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Only image files (JPEG, PNG, WEBP) are accepted.' });
      setSelectedFile(null);
      return;
    }

    setFeedback(null);
    setSelectedFile(file);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      setIsSubmitting(true);
      setFeedback(null);

      const res = await sendTicketMessageAction({
        ticketId: ticket.id,
        source: ticket.source,
        message: replyText.trim(),
        isInternal: false,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: 'Your response was submitted to the operations team.' });
        setReplyText('');
        setSelectedFile(null);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to send response.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isClosed = ticket.status === 'resolved' || ticket.status === 'rejected' || ticket.status === 'closed';

  let statusBadge = 'bg-white/10 text-white';
  if (ticket.status === 'open') statusBadge = 'bg-[#3434FF] text-white';
  else if (ticket.status === 'pending_review') statusBadge = 'bg-[#FF9500]/20 text-[#FF9500] border border-[#FF9500]/40';
  else if (ticket.status === 'under_investigation') statusBadge = 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40';
  else if (ticket.status === 'waiting_for_player') statusBadge = 'bg-[#FFFF00] text-[#08088F] font-black';
  else if (ticket.status === 'resolved') statusBadge = 'bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40';
  else if (ticket.status === 'rejected') statusBadge = 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40';

  return (
    <div className="min-h-screen bg-[#05053B] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-white/70 hover:text-white rounded-full -ml-2.5"
            >
              <Link href="/dashboard/tickets">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to My Tickets
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-black text-[#FFFF00]">{ticket.ticket_number}</span>
              <Badge className={`${statusBadge} text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5`}>
                {ticket.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wide text-white">
              {ticket.subject}
            </h1>
          </div>

          <div className="text-right text-xs text-white/60">
            <p>Submitted: <span className="text-white font-medium">{formatDate(ticket.created_at)}</span></p>
            <p>Category: <span className="text-[#FFFF00] font-bold uppercase">{ticket.category.replace(/_/g, ' ')}</span></p>
          </div>
        </div>

        {/* Global Feedback */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between text-xs font-bold animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-[#00C853]/20 border border-[#00C853]/40 text-[#00C853]'
                : 'bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-[#FF3B30]'
            }`}
          >
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="text-white/60 hover:text-white">✕</button>
          </div>
        )}

        {/* Waiting on Player Notice */}
        {ticket.status === 'waiting_for_player' && (
          <div className="p-4 rounded-2xl bg-[#FFFF00]/15 border border-[#FFFF00]/40 text-[#FFFF00] flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0" />
            <div className="text-xs">
              <strong className="block font-black uppercase tracking-wider text-white">
                Action Required: Operations Team is waiting for your response
              </strong>
              <span className="text-[#FFFF00]/90">
                Please review the latest administrator request below and provide the requested details or screenshot proof.
              </span>
            </div>
          </div>
        )}

        {/* Official Resolution / Rejection Banner */}
        {ticket.resolution_notes && (
          <div className="p-5 rounded-2xl bg-[#00C853]/15 border border-[#00C853]/40 text-[#00C853] space-y-1 text-xs">
            <div className="flex items-center gap-2 font-black uppercase tracking-wider">
              <CheckCircle2 className="h-4 w-4" />
              <span>Official Ticket Resolution</span>
            </div>
            <p className="text-white/90 leading-relaxed">{ticket.resolution_notes}</p>
          </div>
        )}

        {ticket.rejection_reason && (
          <div className="p-5 rounded-2xl bg-[#FF3B30]/15 border border-[#FF3B30]/40 text-[#FF3B30] space-y-1 text-xs">
            <div className="flex items-center gap-2 font-black uppercase tracking-wider">
              <XCircle className="h-4 w-4" />
              <span>Ticket Rejection Explanation</span>
            </div>
            <p className="text-white/90 leading-relaxed">{ticket.rejection_reason}</p>
          </div>
        )}

        {/* Conversation Thread Card */}
        <Card className="bg-[#1818D4] border border-white/20 rounded-[28px] p-6 shadow-2xl text-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
              <MessageSquare className="h-4 w-4 text-[#FFFF00]" />
              <span>Conversation Thread</span>
            </div>
            <span className="text-xs text-white/50">{messages.length} messages</span>
          </div>

          {/* Messages Feed */}
          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {messages.map((m) => {
              const isAdmin = m.sender_role === 'admin';
              const isSystem = m.sender_role === 'system';

              if (isSystem) {
                return (
                  <div key={m.id} className="py-2 px-4 rounded-full bg-white/10 text-center text-[11px] text-white/70 font-medium mx-auto max-w-md">
                    🔔 {m.message} • <span className="text-white/40">{formatDate(m.created_at)}</span>
                  </div>
                );
              }

              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-2xl space-y-1.5 ${
                    isAdmin
                      ? 'bg-[#0A0A7A] border-2 border-[#FFFF00]/50 ml-4 sm:ml-8'
                      : 'bg-[#08088F] border border-white/15 mr-4 sm:mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-bold ${isAdmin ? 'text-[#FFFF00]' : 'text-white'}`}>
                      {isAdmin ? '🛡️ Tournament Operations' : '👤 You'}
                    </span>
                    <span className="text-white/40 font-mono text-[10px]">{formatDate(m.created_at)}</span>
                  </div>
                  <p className="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                  {m.evidence_url && (
                    <div
                      onClick={() => setImagePreviewUrl(m.evidence_url!)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#FFFF00] text-xs font-bold cursor-pointer"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                      <span>View Screenshot Proof</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Player Reply Form */}
          {!isClosed ? (
            <form onSubmit={handleSendReply} className="space-y-3 pt-4 border-t border-white/10">
              <label className="text-xs font-black uppercase tracking-wider text-[#D9DCFF] block">
                Send Response to Operations:
              </label>

              <textarea
                rows={3}
                required
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your response, answer inquiries, or provide match context..."
                className="w-full rounded-2xl border border-white/20 bg-[#0A0A7A] p-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FFFF00] resize-none"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/50">
                  Submitting a reply notifies our administrators to review your ticket.
                </span>

                <Button
                  type="submit"
                  disabled={isSubmitting || !replyText.trim()}
                  className="rounded-full bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-[#08088F] font-black text-xs uppercase tracking-wider gap-1.5 h-10 px-6 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? 'Sending...' : 'Send Reply'}</span>
                </Button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-2xl bg-white/5 text-center text-xs text-white/60">
              This ticket is marked as <strong className="text-white uppercase">{ticket.status}</strong>. If you require further assistance, please open a new inquiry.
            </div>
          )}
        </Card>
      </div>

      {/* Lightbox Preview Modal */}
      {imagePreviewUrl && (
        <div
          onClick={() => setImagePreviewUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-[80vh]">
            <Image src={imagePreviewUrl} alt="Screenshot Preview" fill className="object-contain" />
            <button
              onClick={() => setImagePreviewUrl(null)}
              className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20"
            >
              Close ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
