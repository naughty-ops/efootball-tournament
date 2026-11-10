'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlayerPaymentMethod } from '@/types/wallet';
import { requestPayoutAction } from '@/app/actions/walletActions';

interface RequestPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  unpaidRewardsInr: number;
  paymentMethods: PlayerPaymentMethod[];
  onSuccess?: (payoutRef: string) => void;
}

export default function RequestPayoutModal({
  isOpen,
  onClose,
  unpaidRewardsInr,
  paymentMethods,
  onSuccess,
}: RequestPayoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const preferredMethod = paymentMethods.find((m) => m.isPreferred) || paymentMethods[0];

  const handleConfirm = async () => {
    setError(null);
    if (!preferredMethod) {
      setError('Please add a payment method before requesting a payout.');
      return;
    }

    setLoading(true);
    try {
      const res = await requestPayoutAction();
      if (!res.success) {
        setError(res.error || 'Failed to submit payout request.');
      } else {
        if (onSuccess && res.data) {
          onSuccess(res.data.payoutReference);
        }
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-[#080854] border border-white/20 shadow-2xl p-5 text-white relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/10">
          <div className="h-10 w-10 rounded-xl bg-[#FFFF00]/15 border border-[#FFFF00]/30 flex items-center justify-center text-[#FFFF00]">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">Claim Tournament Prize Payout</h3>
            <span className="text-xs text-white/60">Direct prize disbursement</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Amount Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-black/40 border border-emerald-500/30">
            <span className="text-[11px] font-black uppercase text-emerald-400 tracking-wider">
              Claimable Prize Balance
            </span>
            <div className="text-3xl font-black text-white font-display mt-1 text-emerald-300">
              ₹{unpaidRewardsInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-white/50 mt-1">
              Full available balance will be submitted for settlement.
            </p>
          </div>

          {/* Destination Method Card */}
          <div>
            <label className="text-xs font-black uppercase text-white/70 block mb-1.5">
              Destination Payment Method
            </label>
            {preferredMethod ? (
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/15 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    {preferredMethod.paymentMethodType === 'upi' ? (
                      <Smartphone className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Landmark className="h-4 w-4 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {preferredMethod.paymentMethodType === 'upi'
                        ? 'Google Pay / UPI'
                        : preferredMethod.bankName || 'Bank Account'}
                    </div>
                    <div className="text-[11px] font-mono text-[#FFFF00]">
                      {preferredMethod.paymentMethodType === 'upi'
                        ? preferredMethod.upiId
                        : preferredMethod.maskedAccountNumber}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Preferred
                </span>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs">
                No payment method saved yet. Please configure your bank account or UPI ID below first.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-white/60 p-2.5 rounded-xl bg-white/5 border border-white/10">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              All payouts are verified and disbursed directly to your registered destination within 24 hours.
            </span>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="h-9 px-4 text-xs text-white/70 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !preferredMethod || unpaidRewardsInr <= 0}
            className="h-9 px-5 rounded-xl bg-[#FFFF00] hover:bg-yellow-400 text-[#08088F] text-xs font-black uppercase tracking-wider shadow-lg disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            <span>Confirm Payout Claim</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
