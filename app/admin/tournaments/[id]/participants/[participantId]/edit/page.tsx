'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { participantSchema, ParticipantInput } from '@/lib/validations';
import { getParticipantById, updateParticipant } from '@/services/participantService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function EditParticipantPage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id: tournamentId, participantId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ParticipantInput>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      username: '',
      real_name: '',
      contact_info: '',
      seed_number: null,
    },
  });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const p = await getParticipantById(participantId, tournamentId);
        if (!p) {
          setErrorMessage('Participant not found in this tournament.');
        } else {
          reset({
            username: p.username,
            real_name: p.real_name || '',
            contact_info: p.contact_info || '',
            seed_number: p.seed_number,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load participant data.';
        setErrorMessage(msg);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [tournamentId, participantId, reset]);

  const onSubmit = async (data: ParticipantInput) => {
    setErrorMessage(null);
    try {
      await updateParticipant(participantId, tournamentId, data);
      router.push(`/admin/tournaments/${tournamentId}/participants`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update participant';
      setErrorMessage(msg);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFFF00]" />
          <span className="text-xs font-semibold">Loading Participant Details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-16 text-white">
      {/* Back Button & Title */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
          <Link href={`/admin/tournaments/${tournamentId}/participants`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Roster</span>
          </Link>
        </Button>

        <h1 className="text-2xl sm:text-3xl font-black font-display uppercase tracking-wider text-white">
          Edit Participant
        </h1>
        <p className="text-xs text-white/70">
          Update player name, eFootball ID, contact info, or seed assignment.
        </p>
      </div>

      {/* Form Card */}
      <Card className="border border-white/20 shadow-2xl bg-[#1818D4] rounded-3xl overflow-hidden text-white">
        <CardHeader className="border-b border-white/10 pb-4">
          <CardTitle className="text-lg font-black font-display uppercase tracking-wider text-white">
            Participant Information
          </CardTitle>
          <CardDescription className="text-xs text-white/70">
            Save changes to update tournament participant record.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-destructive/20 border border-destructive/40 text-red-200 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                Player Name (Full / Display Name) *
              </label>
              <Input
                placeholder="e.g. Alex Mercer"
                disabled={isSubmitting}
                className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11"
                {...register('real_name')}
              />
              {errors.real_name && (
                <p className="text-xs text-red-300 mt-1 font-medium">{errors.real_name.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                eFootball ID / Gamertag *
              </label>
              <Input
                placeholder="e.g. ABCD-123-456-789 or Alex_FC"
                disabled={isSubmitting}
                className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11 font-mono"
                {...register('username')}
              />
              {errors.username && (
                <p className="text-xs text-red-300 mt-1 font-medium">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                Contact Information (WhatsApp / Private)
              </label>
              <Input
                placeholder="e.g. +919876543210"
                disabled={isSubmitting}
                className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11 font-mono"
                {...register('contact_info')}
              />
              {errors.contact_info && (
                <p className="text-xs text-red-300 mt-1 font-medium">{errors.contact_info.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-white block mb-1.5 uppercase tracking-wider">
                Seed Number
              </label>
              <Input
                type="number"
                min={1}
                disabled={isSubmitting}
                className="bg-[#0A0A7A] border-white/20 text-white rounded-xl h-11 font-mono"
                {...register('seed_number', { valueAsNumber: true })}
              />
              {errors.seed_number && (
                <p className="text-xs text-red-300 mt-1 font-medium">{errors.seed_number.message}</p>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/10">
              <Button asChild variant="outline" type="button" className="rounded-full border-white/20 text-white hover:bg-white/10">
                <Link href={`/admin/tournaments/${tournamentId}/participants`}>Cancel</Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="font-black rounded-full px-7 h-11 gap-2 bg-[#FFFF00] text-[#08088F] hover:bg-[#E6E600] uppercase tracking-wider cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-[#08088F]" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 text-[#08088F]" />
                    <span>Update Participant</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
