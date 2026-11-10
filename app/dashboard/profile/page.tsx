import { redirect } from 'next/navigation';

export default function PlayerProfileRedirect() {
  redirect('/dashboard/settings');
}
