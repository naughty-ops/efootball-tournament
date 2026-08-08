export * from './database';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'public';
}
