import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useRef, useState } from 'react';

import { createClerkSupabaseClient } from '@/lib/supabase';
import { ensureProfile, Profile } from '@/lib/queries/profiles';

export function useEnsureProfile() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !user) {
      hasAttempted.current = false;
      setProfile(null);
      return;
    }

    if (hasAttempted.current) {
      return;
    }

    const syncProfile = async () => {
      hasAttempted.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const supabase = createClerkSupabaseClient({ getToken });

        const profileData = await ensureProfile(supabase, {
          user_id: user.id,
          username: user.username ?? null,
          first_name: user.firstName ?? null,
          last_name: user.lastName ?? null,
          avatar_url: user.imageUrl ?? null,
        });

        setProfile(profileData);
      } catch (err) {
        console.error('Failed to sync profile:', err);
        setError(err instanceof Error ? err : new Error('Failed to sync profile'));
      } finally {
        setIsLoading(false);
      }
    };

    syncProfile();
  }, [isSignedIn, user, getToken]);

  return { profile, isLoading, error };
}
