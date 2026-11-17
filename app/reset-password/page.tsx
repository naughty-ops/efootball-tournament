import { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset Password | eFootball Tournament Platform',
  description: 'Create a new secure password for your eFootball tournament competitor account.',
  alternates: {
    canonical: '/reset-password',
  },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
