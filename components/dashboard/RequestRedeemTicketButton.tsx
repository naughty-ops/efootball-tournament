'use client';

import React, { useState } from 'react';
import { Coins, Plus, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RedeemAmountModal from '@/components/wallet/RedeemAmountModal';
import { PlayerPaymentMethod } from '@/types/wallet';
import { useRouter } from 'next/navigation';

interface RequestRedeemTicketButtonProps {
  availableBalanceInr: number;
  paymentMethods: PlayerPaymentMethod[];
}

export default function RequestRedeemTicketButton({
  availableBalanceInr,
  paymentMethods,
}: RequestRedeemTicketButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className="rounded-full bg-[#00E676]/15 hover:bg-[#00E676]/25 border-[#00E676]/40 text-[#00E676] font-black text-xs uppercase tracking-wider gap-2 h-11 px-5 shadow-md self-start sm:self-auto cursor-pointer transition-all active:scale-95"
      >
        <Coins className="h-4 w-4 text-[#00E676]" />
        <span>Request Redeem Ticket</span>
      </Button>

      <RedeemAmountModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        availableBalanceInr={availableBalanceInr}
        paymentMethods={paymentMethods}
        onRedeemSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}
