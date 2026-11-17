'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CreditCard,
  QrCode,
  Download,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Clock,
  ShieldCheck,
  Loader2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Wallet,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitWalletDepositAction } from '@/app/actions/walletActions';
import { compressImage } from '@/lib/utils/compressImage';
import { WalletPaymentSettings } from '@/types/wallet';
import { QRCodeSVG } from 'qrcode.react';

interface AddMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvailableInr: number;
  paymentSettings: WalletPaymentSettings;
  onDepositSuccess?: () => void;
  initialAmount?: number;
}

const PREDEFINED_AMOUNTS = [30, 50, 100, 200, 500, 1000] as const;

export default function AddMoneyModal({
  isOpen,
  onClose,
  currentAvailableInr = 0,
  paymentSettings,
  onDepositSuccess,
  initialAmount,
}: AddMoneyModalProps) {
  // Step 1: amount | Step 2: payment | Step 3: success
  const [step, setStep] = useState<'amount' | 'payment' | 'success'>('amount');
  const [selectedAmount, setSelectedAmount] = useState<number>(initialAmount && initialAmount > 0 ? initialAmount : 100);
  const [customAmount, setCustomAmount] = useState<string>(initialAmount && initialAmount > 0 ? String(initialAmount) : '100');
  const [amountError, setAmountError] = useState<string | null>(null);

  // Step 2 Form
  const [utr, setUtr] = useState('');
  const [playerNotes, setPlayerNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedDepositRef, setSubmittedDepositRef] = useState<string | null>(null);

  // Copy state
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrSvgRef = useRef<SVGSVGElement>(null);

  const minAmt = paymentSettings?.minDepositInr ?? 10;
  const maxAmt = paymentSettings?.maxDepositInr ?? 2000;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset state on open
      const startAmt = initialAmount && initialAmount > 0 ? initialAmount : 100;
      setStep('amount');
      setSelectedAmount(startAmt);
      setCustomAmount(String(startAmt));
      setAmountError(null);
      setUtr('');
      setPlayerNotes('');
      setFile(null);
      setFilePreview(null);
      setSubmitError(null);
      setSubmittedDepositRef(null);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialAmount]);

  if (!isOpen || !mounted) return null;

  // Handlers for Amount Selection
  const handleSelectChip = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmount(amt.toString());
    setAmountError(null);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(raw);

    if (!raw) {
      setSelectedAmount(0);
      setAmountError(`Please enter an amount between ₹${minAmt} and ₹${maxAmt}.`);
      return;
    }

    const val = parseInt(raw, 10);
    setSelectedAmount(val);

    if (val < minAmt) {
      setAmountError(`Minimum deposit amount is ₹${minAmt}.`);
    } else if (val > maxAmt) {
      setAmountError(`Maximum deposit amount is ₹${maxAmt}.`);
    } else {
      setAmountError(null);
    }
  };

  const handleProceedToPayment = () => {
    if (!selectedAmount || selectedAmount < minAmt || selectedAmount > maxAmt) {
      setAmountError(`Please select or enter an amount between ₹${minAmt} and ₹${maxAmt}.`);
      return;
    }
    setAmountError(null);
    setStep('payment');
  };

  // Copy helpers
  const handleCopyUpi = () => {
    if (!paymentSettings?.upiId) return;
    navigator.clipboard.writeText(paymentSettings.upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleCopyPhone = () => {
    if (!paymentSettings?.upiPhoneNumber) return;
    navigator.clipboard.writeText(paymentSettings.upiPhoneNumber);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleCopyRef = (refStr: string) => {
    navigator.clipboard.writeText(refStr);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  // QR Download helper
  const handleDownloadQr = () => {
    if (paymentSettings?.upiQrImageUrl && paymentSettings.upiQrImageUrl.startsWith('http')) {
      const a = document.createElement('a');
      a.href = paymentSettings.upiQrImageUrl;
      a.download = `efootball_upi_qr_${selectedAmount}.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const svg = qrSvgRef.current;
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width + 40;
        canvas.height = img.height + 40;
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 20, 20);
          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `efootball_upi_qr_${selectedAmount}.png`;
          downloadLink.href = pngFile;
          downloadLink.click();
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  // File Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setSubmitError('Invalid format. Please upload JPG, PNG, or WEBP.');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setSubmitError('File is too large. Maximum size is 5MB.');
      return;
    }

    setFile(selected);
    setSubmitError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(selected);
  };

  // Submission Handler
  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const cleanUtr = utr.trim().toUpperCase();
    if (!cleanUtr || cleanUtr.length < 6 || cleanUtr.length > 30) {
      setSubmitError('Please enter a valid 6 to 30 character UTR / Transaction Reference ID.');
      return;
    }

    if (!file) {
      setSubmitError('Payment screenshot proof is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Auto-compress screenshot proof client-side to ensure lightweight payload (< 300 KB) and prevent HTTP 413
      const readyFile = await compressImage(file, { maxWidth: 1600, quality: 0.82 });

      const formData = new FormData();
      formData.append('amountInr', selectedAmount.toString());
      formData.append('utrReference', cleanUtr);
      formData.append('playerNotes', playerNotes);
      formData.append('screenshot', readyFile);

      const res = await submitWalletDepositAction(formData);

      if (!res.success) {
        setSubmitError(res.error || 'Failed to submit deposit request.');
        setIsSubmitting(false);
        return;
      }

      setSubmittedDepositRef(res.data?.depositRef || 'DEP-PENDING');
      setStep('success');
      if (onDepositSuccess) {
        onDepositSuccess();
      }
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred while submitting deposit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const upiIntentString = `upi://pay?pa=${paymentSettings?.upiId || 'efootball.arena@upi'}&pn=${encodeURIComponent(
    paymentSettings?.accountHolderName || 'eFootball Arena Financial Desk'
  )}&am=${selectedAmount}&cu=INR`;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div
        className="fixed inset-0"
        onClick={isSubmitting ? undefined : onClose}
      />

      {/* Responsive Sheet (Mobile) / Centered Modal (Tablet & Desktop) */}
      <div className="relative w-full sm:max-w-xl lg:max-w-2xl max-h-[92vh] sm:max-h-[88vh] bg-[#0A0A7A] border-t sm:border border-white/20 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200 text-white my-auto">
        
        {/* Mobile Pull Bar */}
        <div className="sm:hidden w-12 h-1.5 bg-white/20 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* ========================================================================= */}
        {/* FIXED HEADER (Never scrolls away)                                         */}
        {/* ========================================================================= */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/15 bg-[#080860]/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-xl bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676] shrink-0">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase font-display truncate">
                {step === 'amount' && 'Add Money to Wallet'}
                {step === 'payment' && 'Scan QR & Confirm Deposit'}
                {step === 'success' && 'Deposit Under Review'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-white/60 truncate">
                  {step === 'amount' && 'Select deposit amount via UPI'}
                  {step === 'payment' && `Step 2: Pay ₹${selectedAmount} & Upload UTR`}
                  {step === 'success' && 'Request registered in verification queue'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-[#FFFF00] shrink-0 border border-white/10">
                  <Wallet className="h-3 w-3" />
                  ₹{currentAvailableInr.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SCROLLABLE BODY                                                           */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5 scrollbar-thin scrollbar-thumb-white/20">

          {/* ======================================================================= */}
          {/* STEP 1: AMOUNT SELECTION                                               */}
          {/* ======================================================================= */}
          {step === 'amount' && (
            <div className="space-y-5">
              {/* SECTION A: Current Wallet Balance Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0E0EA5] via-[#1212B0] to-[#0A0A7A] border border-white/20 shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 block">
                      Current Available Balance
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-white font-display">
                      ₹{currentAvailableInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#00E676] block">
                      Estimated After Deposit
                    </span>
                    <span className="text-lg sm:text-xl font-black text-[#00E676] font-display">
                      ₹{(currentAvailableInr + (selectedAmount || 0)).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION B: Select Predefined Amount Chips */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#FFFF00]" />
                    <span>Select Quick Amount</span>
                  </label>
                  <span className="text-[11px] text-white/50">Instant selection</span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5">
                  {PREDEFINED_AMOUNTS.map((amt) => {
                    const isSelected = selectedAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleSelectChip(amt)}
                        className={`relative py-3 px-2 rounded-xl font-black text-sm transition-all border cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[#00E676] text-[#050515] border-[#00E676] shadow-lg shadow-[#00E676]/25 scale-[1.02]'
                            : 'bg-white/5 hover:bg-white/10 text-white border-white/15 hover:border-white/30'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute -top-1.5 -right-1.5 bg-[#050515] text-[#00E676] border border-[#00E676] rounded-full p-0.5">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount Entry */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-white uppercase tracking-wider">
                    Or Enter Custom Amount
                  </label>
                  <span className="text-[11px] text-white/50 font-mono">
                    ₹{minAmt} – ₹{maxAmt}
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-white/40">
                    ₹
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={customAmount}
                    onChange={handleCustomAmountChange}
                    placeholder={`Min ₹${minAmt}, Max ₹${maxAmt}`}
                    className="pl-9 pr-4 py-6 text-xl sm:text-2xl font-black bg-white/5 border-white/20 text-white rounded-2xl focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] tracking-tight"
                  />
                </div>

                {amountError ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold animate-in fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{amountError}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-white/50">
                    Enter any amount between ₹{minAmt} and ₹{maxAmt}. No convenience or gateway fees.
                  </p>
                )}
              </div>

              {/* Security & Verification Guarantee */}
              <div className="p-3.5 rounded-2xl bg-[#080860]/60 border border-white/10 flex items-start gap-3 text-xs text-white/70">
                <ShieldCheck className="h-5 w-5 text-[#00E676] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-white block">100% Secure Manual Verification</span>
                  <p className="text-[11px] leading-relaxed text-white/60">
                    All deposits are manually verified by platform administrators using bank statement reconciliation within 5–15 minutes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================================= */}
          {/* STEP 2: QR CODE PAYMENT & UTR SUBMISSION                               */}
          {/* ======================================================================= */}
          {step === 'payment' && (
            <form id="deposit-submit-form" onSubmit={handleSubmitDeposit} className="space-y-5">
              {/* Target Amount Banner */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-[#00E676]/20 via-[#00C853]/15 to-[#FFFF00]/10 border border-[#00E676]/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-white/60 tracking-wider">
                    Deposit Amount
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-[#00E676] font-display">
                    ₹{selectedAmount}.00
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('amount')}
                  className="text-xs text-white/90 hover:text-white underline font-bold flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Change</span>
                </button>
              </div>

              {/* Responsive Grid: Two columns on tablet/desktop, single column on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                
                {/* SECTION C: Payment Details (Left Column) */}
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/30">
                      Step 1
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Scan QR or Copy UPI
                    </h3>
                  </div>

                  {/* QR Box */}
                  <div className="bg-[#050515]/70 border border-white/15 rounded-2xl p-4 flex flex-col items-center text-center space-y-3">
                    <div className="bg-white p-3 rounded-2xl shadow-xl border border-black/10 inline-block">
                      {paymentSettings?.upiQrImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={paymentSettings.upiQrImageUrl}
                          alt="Official UPI QR Code"
                          className="w-36 h-36 sm:w-40 sm:h-40 aspect-square object-contain"
                        />
                      ) : (
                        <QRCodeSVG
                          ref={qrSvgRef}
                          value={upiIntentString}
                          size={152}
                          level="H"
                          includeMargin={false}
                        />
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-[11px] font-bold text-white uppercase tracking-wider">
                        Scan with any UPI App
                      </div>
                      <div className="text-[10px] text-white/60">
                        Google Pay • PhonePe • Paytm • BHIM
                      </div>
                    </div>

                    {/* Download QR Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadQr}
                      className="text-xs border-white/20 hover:bg-white/10 text-white gap-1.5 h-8 rounded-xl cursor-pointer w-full"
                    >
                      <Download className="h-3.5 w-3.5 text-[#00E676]" />
                      <span>Download QR Code</span>
                    </Button>
                  </div>

                  {/* Credentials Cards */}
                  <div className="space-y-2">
                    {/* UPI ID */}
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="text-[10px] text-white/50 uppercase font-bold tracking-wider">
                          Official UPI ID
                        </div>
                        <div className="text-xs font-mono font-bold text-white truncate">
                          {paymentSettings?.upiId || 'efootball.arena@upi'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0 transition-colors cursor-pointer"
                        title="Copy UPI ID"
                      >
                        {copiedUpi ? (
                          <Check className="h-4 w-4 text-[#00E676]" />
                        ) : (
                          <Copy className="h-4 w-4 text-white/70" />
                        )}
                      </button>
                    </div>

                    {/* UPI Phone Number */}
                    {paymentSettings?.upiPhoneNumber && (
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <div className="text-[10px] text-white/50 uppercase font-bold tracking-wider">
                            Receiver Phone (GPay / PhonePe)
                          </div>
                          <div className="text-xs font-mono font-bold text-white truncate">
                            {paymentSettings.upiPhoneNumber}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyPhone}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0 transition-colors cursor-pointer"
                          title="Copy Phone Number"
                        >
                          {copiedPhone ? (
                            <Check className="h-4 w-4 text-[#00E676]" />
                          ) : (
                            <Copy className="h-4 w-4 text-white/70" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION D: Payment Verification (Right Column) */}
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30">
                      Step 2
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Enter UTR & Upload Proof
                    </h3>
                  </div>

                  {/* 12-Digit UTR Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white uppercase tracking-wider">
                        12-Digit UTR Number <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[10px] font-mono text-white/50">
                        {utr.length}/12
                      </span>
                    </div>
                    <Input
                      type="text"
                      required
                      value={utr}
                      onChange={(e) => setUtr(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="e.g. 431289123456"
                      maxLength={30}
                      className="font-mono text-sm tracking-wider uppercase bg-white/5 border-white/20 text-white rounded-xl focus:border-[#00E676] h-11"
                    />
                    <span className="text-[10px] text-white/50 block">
                      Find the 12-digit UPI Transaction ID / UTR in your payment app receipt.
                    </span>
                  </div>

                  {/* Screenshot Uploader with Preview & Replace */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white uppercase tracking-wider block">
                      Payment Screenshot Proof <span className="text-red-400">*</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {filePreview ? (
                      <div className="relative rounded-2xl border border-white/20 overflow-hidden bg-black/40 p-3 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={filePreview}
                          alt="Uploaded payment screenshot preview"
                          className="w-16 h-16 object-cover rounded-xl border border-white/20 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{file?.name}</div>
                          <div className="text-[10px] text-white/60 mt-0.5">
                            {((file?.size || 0) / (1024 * 1024)).toFixed(2)} MB • Ready
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-[10px] text-[#FFFF00] hover:underline font-bold mt-1 inline-block"
                          >
                            Replace Screenshot
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFile(null);
                            setFilePreview(null);
                          }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-8 w-8 p-0 rounded-lg shrink-0"
                          title="Remove Screenshot"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-white/20 hover:border-[#00E676]/60 rounded-2xl p-4 text-center cursor-pointer transition-all bg-white/5 hover:bg-white/10"
                      >
                        <Upload className="h-6 w-6 text-white/50 mx-auto mb-1.5" />
                        <div className="text-xs font-bold text-white">Click to Upload Screenshot</div>
                        <div className="text-[10px] text-white/50 mt-0.5">JPG, PNG or WEBP (Max 5MB)</div>
                      </div>
                    )}
                  </div>

                  {/* Instructions Summary */}
                  {paymentSettings?.instructions && (
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/70 space-y-1">
                      <div className="font-bold text-white flex items-center gap-1.5 text-[11px]">
                        <Info className="h-3.5 w-3.5 text-[#FFFF00]" />
                        <span>Reconciliation Note</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-white/60 line-clamp-3">
                        {paymentSettings.instructions}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Error Banner */}
              {submitError && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{submitError}</span>
                </div>
              )}
            </form>
          )}

          {/* ======================================================================= */}
          {/* STEP 3: SUCCESS & UNDER REVIEW CONFIRMATION                            */}
          {/* ======================================================================= */}
          {step === 'success' && (
            <div className="py-4 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400/50 flex items-center justify-center mx-auto text-amber-300">
                <Clock className="h-8 w-8 animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <div className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-1">
                  Status: UNDER REVIEW
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white font-display uppercase tracking-wide">
                  Deposit Request Submitted
                </h3>
                <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
                  Your deposit request has been submitted and is currently under review. Platform administrators verify incoming UPI credits against merchant banking statements. Your wallet will be credited after successful verification.
                </p>
              </div>

              {/* Reference & Details Card */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 max-w-sm mx-auto text-left text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-[11px]">Deposit Ref:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-white text-xs">
                      {submittedDepositRef}
                    </span>
                    {submittedDepositRef && (
                      <button
                        type="button"
                        onClick={() => handleCopyRef(submittedDepositRef)}
                        className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white"
                        title="Copy Reference"
                      >
                        {copiedRef ? (
                          <Check className="h-3 w-3 text-[#00E676]" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-[11px]">Amount Claimed:</span>
                  <span className="font-bold text-[#00E676]">₹{selectedAmount}.00</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-[11px]">UTR Reference:</span>
                  <span className="font-mono font-bold text-white/80">{utr}</span>
                </div>

                <div className="pt-2 border-t border-white/10 text-[10px] text-white/50 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-amber-300 shrink-0" />
                  <span>Verification typically completes within 5–15 minutes.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* FIXED STICKY FOOTER (Always visible & reachable)                          */}
        {/* ========================================================================= */}
        <div className="shrink-0 px-5 sm:px-6 py-3.5 sm:py-4 border-t border-white/15 bg-[#080860]/95 backdrop-blur-md flex items-center justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step === 'amount' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-white/20 text-white hover:bg-white/10 rounded-xl h-11 px-5 text-xs font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!selectedAmount || !!amountError}
                onClick={handleProceedToPayment}
                className="flex-1 bg-[#00E676] hover:bg-[#00C853] text-[#050515] font-black uppercase tracking-wider rounded-xl h-11 px-6 text-xs gap-2 shadow-lg shadow-[#00E676]/20 transition-all cursor-pointer"
              >
                <span>Proceed to Payment (₹{selectedAmount || 0})</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 'payment' && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setStep('amount')}
                className="border-white/20 text-white hover:bg-white/10 rounded-xl h-11 px-5 text-xs font-bold cursor-pointer"
              >
                Back
              </Button>
              <Button
                type="submit"
                form="deposit-submit-form"
                disabled={isSubmitting || !utr.trim() || !file}
                className="flex-1 bg-[#00E676] hover:bg-[#00C853] text-[#050515] font-black uppercase tracking-wider rounded-xl h-11 px-6 text-xs gap-2 shadow-lg shadow-[#00E676]/25 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting Claim...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Submit Deposit Request</span>
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button
              type="button"
              onClick={onClose}
              className="w-full bg-[#00E676] hover:bg-[#00C853] text-[#050515] font-black uppercase tracking-wider rounded-xl h-11 text-xs cursor-pointer shadow-lg shadow-[#00E676]/25"
            >
              Done / View Deposit in History
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
