// Auth placeholder - admin authentication will be implemented in later phase
export interface AuthState {
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export const initialAuthState: AuthState = {
  isAuthenticated: false,
  isAdmin: false,
};
