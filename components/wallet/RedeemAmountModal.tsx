'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Coins,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Landmark,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  Ticket,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerPaymentMethod } from '@/types/wallet';
import { requestRedeemAmountAction } from '@/app/actions/walletActions';

interface RedeemAmountModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalanceInr: number;
  paymentMethods: PlayerPaymentMethod[];
  onRedeemSuccess?: (ticketNumber: string, payoutRef: string) => void;
}

export default function RedeemAmountModal({
  isOpen,
  onClose,
  availableBalanceInr,
  paymentMethods = [],
  onRedeemSuccess,
}: RedeemAmountModalProps) {
  const [amountStr, setAmountStr] = useState<string>('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>(
    paymentMethods.find((m) => m.isPreferred)?.id || paymentMethods[0]?.id || ''
  );
  const [customUpiId, setCustomUpiId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Success view state
  const [successData, setSuccessData] = useState<{
    ticketId: string;
    ticketNumber: string;
    payoutReference: string;
    amountInr: number;
    destination: string;
  } | null>(null);

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amountStr) || 0;
  const preferredMethod = paymentMethods.find((m) => m.id === selectedMethodId) || paymentMethods[0];
  const hasSavedMethod = paymentMethods.length > 0;

  const handleQuickAmount = (val: number) => {
    const capped = Math.min(val, availableBalanceInr);
    setAmountStr(String(capped));
    setError(null);
  };

  const handleMaxAmount = () => {
    setAmountStr(String(Math.floor(availableBalanceInr)));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedAmount < 10) {
      setError('Minimum redemption amount is ₹10.');
      return;
    }

    if (parsedAmount > availableBalanceInr) {
      setError(`Requested amount exceeds your available balance of ₹${availableBalanceInr.toFixed(2)}.`);
      return;
    }

    if (!hasSavedMethod && !customUpiId.trim()) {
      setError('Please provide your UPI ID to receive the payout transfer.');
      return;
    }

    setLoading(true);

    try {
      const res = await requestRedeemAmountAction({
        amountInr: parsedAmount,
        paymentMethodId: hasSavedMethod ? selectedMethodId : undefined,
        upiId: !hasSavedMethod ? customUpiId.trim() : undefined,
        notes: notes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to submit redemption request.');
      } else {
        setSuccessData(res.data);
        if (onRedeemSuccess) {
          onRedeemSuccess(res.data.ticketNumber, res.data.payoutReference);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setSuccessData(null);
    setAmountStr('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl bg-gradient-to-b from-[#0A0A70] to-[#070748] border border-blue-400/25 shadow-2xl p-5 sm:p-7 text-white relative max-h-[92vh] overflow-y-auto no-scrollbar">
        <button
          onClick={handleClose}
          disabled={loading}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* State A: Success Confirmation Card */}
        {successData ? (
          <div className="py-4 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="h-16 w-16 rounded-full bg-[#00E676]/20 border-2 border-[#00E676] flex items-center justify-center text-[#00E676] mx-auto shadow-[0_0_25px_rgba(0,230,118,0.5)]">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40 inline-block mb-1.5">
                Redemption Ticket Registered
              </span>
              <h3 className="text-2xl font-black font-display uppercase tracking-wider text-white">
                Request Submitted
              </h3>
              <p className="text-xs text-white/70 max-w-sm mx-auto mt-1 leading-relaxed">
                Your wallet balance has been locked for payout. An official support ticket has been logged for tracking.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="p-4 rounded-2xl bg-[#07073B] border border-blue-400/25 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-white/60 uppercase text-[10px] font-bold">Ticket Number</span>
                <span className="font-mono font-black text-[#FFFF00] text-sm">
                  #{successData.ticketNumber}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-white/60 uppercase text-[10px] font-bold">Payout Reference</span>
                <span className="font-mono text-white/90 text-xs">
                  {successData.payoutReference}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-white/60 uppercase text-[10px] font-bold">Redemption Amount</span>
                <span className="font-black text-[#00E676] text-base font-display">
                  ₹{successData.amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-white/60 uppercase text-[10px] font-bold">Destination</span>
                <span className="font-mono text-white/90 truncate max-w-[200px]">
                  {successData.destination}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-400/20 text-xs text-blue-200 text-left flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#00E676] mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Our financial desk processes settlements directly to your destination within 24 hours. You can post questions or follow up on your ticket anytime.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                asChild
                className="w-full sm:w-auto rounded-full bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] font-black text-xs uppercase tracking-wider h-11 px-6 shadow-lg shadow-yellow-500/25 cursor-pointer"
              >
                <Link href="/dashboard/tickets">
                  <Ticket className="h-4 w-4 mr-1.5" />
                  <span>View in My Tickets</span>
                </Link>
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full sm:w-auto rounded-full border-white/20 text-white hover:bg-white/10 text-xs font-black uppercase tracking-wider h-11 px-6 cursor-pointer"
              >
                Return to Wallet
              </Button>
            </div>
          </div>
        ) : (
          /* State B: Amount Entry Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-white/15">
              <div className="h-11 w-11 rounded-2xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)] shrink-0">
                <Coins className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/40">
                    24h Payout Desk
                  </span>
                </div>
                <h3 className="text-lg font-black font-display uppercase tracking-wider text-white">
                  Redeem Wallet Balance
                </h3>
                <p className="text-xs text-white/60">
                  Request payout • Generates official redemption ticket
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-400 font-bold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Available Balance Box */}
            <div className="p-4 rounded-2xl bg-[#07073B] border border-blue-400/20 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-white/50 block">Available to Redeem</span>
                <span className="text-2xl sm:text-3xl font-black font-display text-[#00E676]">
                  ₹{availableBalanceInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <Button
                type="button"
                onClick={handleMaxAmount}
                disabled={availableBalanceInr < 10 || loading}
                variant="outline"
                className="rounded-full text-xs font-black uppercase tracking-wider border-[#FFFF00]/50 text-[#FFFF00] hover:bg-[#FFFF00]/15 h-9 px-4 cursor-pointer"
              >
                Redeem Max
              </Button>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase text-white/80 block">
                  Amount to Redeem (INR)
                </label>
                <span className="text-[11px] text-white/50">Minimum ₹10</span>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black font-display text-white/60">
                  ₹
                </span>
                <Input
                  type="number"
                  min="10"
                  max={availableBalanceInr}
                  step="1"
                  required
                  value={amountStr}
                  onChange={(e) => {
                    setAmountStr(e.target.value);
                    setError(null);
                  }}
                  placeholder="0"
                  disabled={loading || availableBalanceInr < 10}
                  className="pl-9 bg-white/5 border-white/20 text-2xl font-black font-display text-[#FFFF00] rounded-xl h-13 focus:border-[#FFFF00] focus:ring-1 focus:ring-[#FFFF00]"
                />
              </div>

              {/* Quick Preset Amount Buttons */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {[50, 100, 250, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAmount(val)}
                    disabled={availableBalanceInr < val || loading}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 hover:text-white transition-all disabled:opacity-40 cursor-pointer"
                  >
                    +₹{val}
                  </button>
                ))}
              </div>
            </div>

            {/* Destination Payment Method */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-white/80 block">
                Payout Destination
              </label>

              {hasSavedMethod ? (
                <div className="space-y-2">
                  {paymentMethods.map((method) => {
                    const isSelected = method.id === selectedMethodId;
                    return (
                      <div
                        key={method.id}
                        onClick={() => setSelectedMethodId(method.id)}
                        className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-900/40 border-[#00E676] shadow-sm shadow-[#00E676]/20'
                            : 'bg-white/5 border-white/15 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
                            {method.paymentMethodType === 'upi' ? (
                              <Smartphone className="h-4 w-4 text-[#00E676]" />
                            ) : (
                              <Landmark className="h-4 w-4 text-cyan-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">
                              {method.paymentMethodType === 'upi'
                                ? 'UPI / Google Pay / PhonePe'
                                : method.bankName || 'Bank Account'}
                            </p>
                            <p className="text-[11px] font-mono text-[#FFFF00]">
                              {method.paymentMethodType === 'upi'
                                ? method.upiId
                                : method.maskedAccountNumber}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="text-[10px] font-bold text-[#00E676] bg-[#00E676]/15 border border-[#00E676]/30 px-2.5 py-0.5 rounded-full">
                            Selected ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    type="text"
                    required
                    value={customUpiId}
                    onChange={(e) => setCustomUpiId(e.target.value)}
                    placeholder="Enter your UPI ID (e.g. mobile@okhdfcbank or user@paytm)"
                    disabled={loading}
                    className="bg-white/5 border-white/20 text-white rounded-xl h-11 focus:border-[#FFFF00]"
                  />
                  <p className="text-[11px] text-white/50">
                    We disburse payouts directly to your UPI ID within 24 hours.
                  </p>
                </div>
              )}
            </div>

            {/* Optional Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-white/80 block">
                Notes for Financial Desk (Optional)
              </label>
              <Input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Prize withdrawal / 1v1 winnings"
                disabled={loading}
                className="bg-white/5 border-white/20 text-white rounded-xl h-10 text-xs focus:border-[#FFFF00]"
              />
            </div>

            {/* SLA Notice */}
            <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-400/25 text-blue-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#FFFF00]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#FFFF00]" />
                <span>Ticket Generation & SLA Guarantee:</span>
              </div>
              <p className="text-[11px] text-blue-200/90 leading-relaxed">
                Submitting creates a formal support ticket (<strong className="text-white">#TKT-RDM-...</strong>). Financial operators verify tournament logs and disburse funds within 24 hours.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={loading}
                className="rounded-full text-xs font-black uppercase tracking-wider text-white/70 hover:text-white hover:bg-white/10 h-11 px-5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || parsedAmount < 10 || parsedAmount > availableBalanceInr}
                className="rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFF00] hover:bg-[#E6E600] text-[#08088F] h-11 px-7 shadow-lg shadow-yellow-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                    <span>Submitting Ticket...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Ticket className="h-4 w-4" />
                    <span>Submit Redeem Request</span>
                  </span>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
