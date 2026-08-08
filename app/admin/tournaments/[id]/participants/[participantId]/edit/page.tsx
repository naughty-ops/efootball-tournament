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
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#0B3323]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs font-semibold font-sans">Loading Participant Details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-12">
      {/* Back Button & Title */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary -ml-2">
          <Link href={`/admin/tournaments/${tournamentId}/participants`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Roster</span>
          </Link>
        </Button>

        <h1 className="text-3xl font-extrabold text-[#0B3323] tracking-tight">
          Edit Participant
        </h1>
        <p className="text-sm text-muted-foreground">
          Update player gamertag, contact info, or seed assignment.
        </p>
      </div>

      {/* Form Card */}
      <Card className="border-border shadow-md bg-white">
        <CardHeader>
          <CardTitle className="text-xl">Participant Settings</CardTitle>
          <CardDescription className="text-xs">
            Save changes to update tournament participant record.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                Gamertag / Username *
              </label>
              <Input disabled={isSubmitting} {...register('username')} />
              {errors.username && (
                <p className="text-xs text-destructive mt-1 font-medium">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                Real Name
              </label>
              <Input disabled={isSubmitting} {...register('real_name')} />
              {errors.real_name && (
                <p className="text-xs text-destructive mt-1 font-medium">{errors.real_name.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                Contact Information (Private)
              </label>
              <Input disabled={isSubmitting} {...register('contact_info')} />
              {errors.contact_info && (
                <p className="text-xs text-destructive mt-1 font-medium">{errors.contact_info.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B3323] block mb-1.5">
                Seed Number
              </label>
              <Input
                type="number"
                min={1}
                disabled={isSubmitting}
                {...register('seed_number', { valueAsNumber: true })}
              />
              {errors.seed_number && (
                <p className="text-xs text-destructive mt-1 font-medium">{errors.seed_number.message}</p>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
              <Button asChild variant="outline" type="button" className="rounded-xl">
                <Link href={`/admin/tournaments/${tournamentId}/participants`}>Cancel</Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="font-bold rounded-xl px-6 gap-2 shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
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
