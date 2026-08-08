export const APP_NAME = 'eFootball Tournament Platform';
export const APP_DESCRIPTION = 'Official eFootball Esports & Tournament Management Portal';

export const PUBLIC_NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Tournaments', href: '/tournaments' },
  { label: 'Live', href: '/live' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const;

export const ADMIN_NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'LayoutDashboard' },
  { label: 'Tournaments', href: '/admin/tournaments', icon: 'Trophy' },
  { label: 'Participants', href: '/admin/participants', icon: 'Users' },
  { label: 'Matches', href: '/admin/matches', icon: 'Swords' },
  { label: 'Settings', href: '/admin/settings', icon: 'Settings' },
] as const;
