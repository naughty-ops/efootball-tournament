'use client';

import React, { useState } from 'react';
import {
  Landmark,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Edit2,
  AlertCircle,
  Loader2,
  Star,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PlayerPaymentMethod, PaymentMethodType } from '@/types/wallet';
import {
  saveBankAccountAction,
  saveUpiDetailsAction,
  setPreferredPaymentMethodAction,
} from '@/app/actions/walletActions';

interface PaymentDetailsManagerProps {
  paymentMethods: PlayerPaymentMethod[];
  onRefresh?: () => void;
}

export default function PaymentDetailsManager({ paymentMethods }: PaymentDetailsManagerProps) {
  const bankMethod = paymentMethods.find((m) => m.paymentMethodType === 'bank_account');
  const upiMethod = paymentMethods.find((m) => m.paymentMethodType === 'upi');

  // Bank Form State
  const [isEditingBank, setIsEditingBank] = useState(!bankMethod);
  const [bankHolder, setBankHolder] = useState(bankMethod?.accountHolderName || '');
  const [bankName, setBankName] = useState(bankMethod?.bankName || '');
  const [bankAccount, setBankAccount] = useState('');
  const [confirmBankAccount, setConfirmBankAccount] = useState('');
  const [ifscCode, setIfscCode] = useState(bankMethod?.ifscCode || '');
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSuccess, setBankSuccess] = useState<string | null>(null);

  // UPI Form State
  const [isEditingUpi, setIsEditingUpi] = useState(!upiMethod);
  const [upiId, setUpiId] = useState(upiMethod?.upiId || '');
  const [confirmUpiId, setConfirmUpiId] = useState('');
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiError, setUpiError] = useState<string | null>(null);
  const [upiSuccess, setUpiSuccess] = useState<string | null>(null);

  // Preferred Method State
  const [preferredLoading, setPreferredLoading] = useState(false);

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(null);
    setBankSuccess(null);

    if (!bankHolder.trim() || bankHolder.length < 2) {
      setBankError('Please enter a valid Account Holder Name.');
      return;
    }
    if (!bankName.trim() || bankName.length < 2) {
      setBankError('Please enter a valid Bank Name.');
      return;
    }
    const cleanAcc = bankAccount.replace(/[\s-]/g, '');
    const cleanConfirm = confirmBankAccount.replace(/[\s-]/g, '');

    if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18) {
      setBankError('Account number must be between 9 and 18 numeric digits.');
      return;
    }
    if (cleanAcc !== cleanConfirm) {
      setBankError('Bank account numbers do not match.');
      return;
    }
    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setBankError('Invalid Indian IFSC format. Expected 11 characters (e.g. SBIN0001234).');
      return;
    }

    setBankLoading(true);
    try {
      const res = await saveBankAccountAction({
        accountHolderName: bankHolder.trim(),
        bankName: bankName.trim(),
        accountNumber: cleanAcc,
        confirmAccountNumber: cleanConfirm,
        ifscCode: cleanIfsc,
        isPreferred: !bankMethod && !upiMethod ? true : undefined,
      });

      if (!res.success) {
        setBankError(res.error || 'Failed to save bank account details.');
      } else {
        setBankSuccess('Bank account securely saved with end-to-end encryption!');
        setIsEditingBank(false);
        setBankAccount('');
        setConfirmBankAccount('');
      }
    } catch (err: any) {
      setBankError(err.message || 'An unexpected error occurred.');
    } finally {
      setBankLoading(false);
    }
  };

  const handleSaveUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpiError(null);
    setUpiSuccess(null);

    const cleanUpi = upiId.trim().toLowerCase();
    const cleanConfirm = confirmUpiId.trim().toLowerCase();

    if (!cleanUpi || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(cleanUpi)) {
      setUpiError('Invalid UPI ID format. Expected format: username@bank (e.g. player@okaxis).');
      return;
    }
    if (cleanUpi !== cleanConfirm) {
      setUpiError('UPI IDs do not match.');
      return;
    }

    setUpiLoading(true);
    try {
      const res = await saveUpiDetailsAction({
        upiId: cleanUpi,
        confirmUpiId: cleanConfirm,
        isPreferred: !bankMethod && !upiMethod ? true : undefined,
      });

      if (!res.success) {
        setUpiError(res.error || 'Failed to save UPI details.');
      } else {
        setUpiSuccess('Google Pay / UPI ID saved successfully!');
        setIsEditingUpi(false);
        setConfirmUpiId('');
      }
    } catch (err: any) {
      setUpiError(err.message || 'An unexpected error occurred.');
    } finally {
      setUpiLoading(false);
    }
  };

  const handleSetPreferred = async (methodType: PaymentMethodType) => {
    setPreferredLoading(true);
    try {
      await setPreferredPaymentMethodAction({ paymentMethodType: methodType });
    } catch (err) {
      console.error('Error updating preferred method:', err);
    } finally {
      setPreferredLoading(false);
    }
  };

  return (
    <Card id="payment-details" className="bg-[#1818D4] border border-white/20 shadow-2xl rounded-[32px] overflow-hidden text-white">
      <CardHeader className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2 uppercase tracking-wider font-display">
            <Lock className="h-4 w-4 text-[#FFFF00]" />
            <span>Payment & Payout Details</span>
          </CardTitle>
          <p className="text-xs text-white/70 mt-1">
            Configure both payout methods. Administrators manually disburse tournament prize payouts directly to your preferred destination.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00C853]/15 border border-[#00C853]/30 text-[#00E676] text-[11px] font-black uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5 text-[#00E676]" />
          <span>AES-256 Encrypted</span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Warning if no payout method configured */}
        {!bankMethod && !upiMethod && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-400/40 text-amber-200 text-xs flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-white text-sm uppercase tracking-wider">No Payout Method Configured</h5>
              <p className="mt-0.5 text-white/80">
                Please add your Bank Account or Google Pay / UPI ID below. When you win prize rewards in tournaments, administrators transfer funds directly to your preferred method within 24 hours.
              </p>
            </div>
          </div>
        )}

        {/* Two-Column Grid for Both Channels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ============================================================ */}
          {/* 1. BANK ACCOUNT CHANNEL */}
          {/* ============================================================ */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col justify-between ${
              bankMethod?.isPreferred
                ? 'bg-gradient-to-b from-[#0F0F94] to-[#0B0B7C] border-[#FFFF00]/60 ring-1 ring-[#FFFF00]/30 shadow-lg'
                : 'bg-black/25 border-white/15'
            }`}
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white">Direct Bank Transfer</h4>
                    <span className="text-[10px] text-white/50">NEFT / RTGS / IMPS</span>
                  </div>
                </div>

                {bankMethod && (
                  <div className="flex items-center gap-2">
                    {bankMethod.isPreferred ? (
                      <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        <span>Preferred</span>
                      </Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetPreferred('bank_account')}
                        disabled={preferredLoading}
                        className="text-[10px] text-white/70 hover:text-[#FFFF00] font-bold underline transition-colors"
                      >
                        Set Preferred
                      </button>
                    )}

                    {!isEditingBank && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingBank(true)}
                        className="h-7 w-7 p-0 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Status messages */}
              {bankError && (
                <div className="mt-3 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{bankError}</span>
                </div>
              )}
              {bankSuccess && (
                <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{bankSuccess}</span>
                </div>
              )}

              {/* View Mode */}
              {!isEditingBank && bankMethod ? (
                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">Account Holder</span>
                    <span className="font-bold text-white">{bankMethod.accountHolderName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">Bank Name</span>
                    <span className="font-bold text-white">{bankMethod.bankName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">Account Number</span>
                    <span className="font-mono font-bold text-emerald-400 tracking-wider">
                      {bankMethod.maskedAccountNumber}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">IFSC Code</span>
                    <span className="font-mono font-bold text-white uppercase">{bankMethod.ifscCode}</span>
                  </div>
                </div>
              ) : (
                /* Edit Mode */
                <form onSubmit={handleSaveBank} className="mt-4 space-y-3">
                  {/* Sample Details Banner */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[11px]">
                    <span className="font-bold text-[#FFFF00] uppercase text-[10px] tracking-wider block mb-1">
                      Example Reference (Enter Your Own Details):
                    </span>
                    <div className="text-[11px] text-white/60 space-y-0.5 leading-relaxed">
                      <div>Name: <span className="text-white/90 font-medium">Player Name</span> &bull; Bank: <span className="text-white/90 font-medium">Sample Bank</span></div>
                      <div>A/C: <span className="text-white/90 font-mono">987654321</span> &bull; IFSC: <span className="text-white/90 font-mono">SBIN0001234</span></div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">
                      Account Holder Name
                    </label>
                    <Input
                      placeholder="Player Name"
                      value={bankHolder}
                      onChange={(e) => setBankHolder(e.target.value)}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl placeholder:text-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">Bank Name</label>
                    <Input
                      placeholder="Sample Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl placeholder:text-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">
                      Account Number
                    </label>
                    <Input
                      type="password"
                      placeholder="987654321"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl font-mono placeholder:text-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">
                      Confirm Account Number
                    </label>
                    <Input
                      type="text"
                      placeholder="987654321"
                      value={confirmBankAccount}
                      onChange={(e) => setConfirmBankAccount(e.target.value)}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl font-mono placeholder:text-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">
                      IFSC Code (11 alphanumeric characters)
                    </label>
                    <Input
                      placeholder="SBIN0001234"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      maxLength={11}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl font-mono uppercase placeholder:text-white/40"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    {bankMethod && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingBank(false)}
                        className="h-8 px-3 text-xs text-white/70 hover:text-white"
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={bankLoading}
                      className="h-8 px-4 rounded-xl bg-[#FFFF00] hover:bg-yellow-400 text-[#08088F] text-xs font-black"
                    >
                      {bankLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      <span>Save Bank Account</span>
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* 2. GOOGLE PAY / UPI CHANNEL */}
          {/* ============================================================ */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col justify-between ${
              upiMethod?.isPreferred
                ? 'bg-gradient-to-b from-[#0F0F94] to-[#0B0B7C] border-[#FFFF00]/60 ring-1 ring-[#FFFF00]/30 shadow-lg'
                : 'bg-black/25 border-white/15'
            }`}
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white">Google Pay / UPI</h4>
                    <span className="text-[10px] text-white/50">Instant VPA handle</span>
                  </div>
                </div>

                {upiMethod && (
                  <div className="flex items-center gap-2">
                    {upiMethod.isPreferred ? (
                      <Badge className="bg-[#FFFF00] text-[#08088F] text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        <span>Preferred</span>
                      </Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetPreferred('upi')}
                        disabled={preferredLoading}
                        className="text-[10px] text-white/70 hover:text-[#FFFF00] font-bold underline transition-colors"
                      >
                        Set Preferred
                      </button>
                    )}

                    {!isEditingUpi && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingUpi(true)}
                        className="h-7 w-7 p-0 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Status messages */}
              {upiError && (
                <div className="mt-3 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{upiError}</span>
                </div>
              )}
              {upiSuccess && (
                <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{upiSuccess}</span>
                </div>
              )}

              {/* View Mode */}
              {!isEditingUpi && upiMethod ? (
                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">UPI ID / VPA</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {upiMethod.upiId}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">Supported Apps</span>
                    <span className="text-white/80">Google Pay, PhonePe, Paytm, BHIM</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/60">Updated</span>
                    <span className="text-white/60 font-mono">
                      {new Date(upiMethod.updatedAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                </div>
              ) : (
                /* Edit Mode */
                <form onSubmit={handleSaveUpi} className="mt-4 space-y-3">
                  {/* Sample Details Banner */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[11px]">
                    <span className="font-bold text-[#FFFF00] uppercase text-[10px] tracking-wider block mb-1">
                      Example Reference (Enter Your Own Details):
                    </span>
                    <div className="text-[11px] text-white/60">
                      UPI ID: <span className="text-white/90 font-mono">player@upi</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">
                      UPI ID / Google Pay Handle
                    </label>
                    <Input
                      placeholder="player@upi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl font-mono placeholder:text-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-white/80 block mb-1">
                      Confirm UPI ID
                    </label>
                    <Input
                      placeholder="player@upi"
                      value={confirmUpiId}
                      onChange={(e) => setConfirmUpiId(e.target.value)}
                      required
                      className="h-8 text-xs bg-black/40 border-white/20 text-white rounded-xl font-mono placeholder:text-white/40"
                    />
                  </div>

                  <p className="text-[11px] text-white/50 pt-1">
                    Supports any valid Indian UPI VPA (Google Pay, PhonePe, Paytm, BHIM, Axis, ICICI, etc.). We will never request your UPI PIN or banking passwords.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    {upiMethod && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingUpi(false)}
                        className="h-8 px-3 text-xs text-white/70 hover:text-white"
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={upiLoading}
                      className="h-8 px-4 rounded-xl bg-[#FFFF00] hover:bg-yellow-400 text-[#08088F] text-xs font-black"
                    >
                      {upiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      <span>Save UPI Details</span>
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
