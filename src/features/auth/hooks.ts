import { useMutation } from '@tanstack/react-query';
import type { Role } from '@/theme/roles';
import { useAuth } from './AuthProvider';

export function useRequestOtp() {
  const { requestOtp } = useAuth();
  return useMutation({ mutationFn: (identifier: string) => requestOtp(identifier) });
}

export function useActivateWithOtp() {
  const { activateWithOtp } = useAuth();
  return useMutation({
    mutationFn: ({ identifier, code, roleKey, password }: { identifier: string; code: string; roleKey: Role; password: string }) =>
      activateWithOtp(identifier, code, roleKey, password),
  });
}

export function useLogin() {
  const { signInWithPassword } = useAuth();
  return useMutation({
    mutationFn: ({ identifier, password, roleKey }: { identifier: string; password: string; roleKey: Role }) =>
      signInWithPassword(identifier, password, roleKey),
  });
}

export function useLogout() {
  const { signOut } = useAuth();
  return useMutation({ mutationFn: () => signOut() });
}
