import { useState } from "react";
import { Button } from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";
import { signInWithGoogle } from "../../lib/auth";
import { logger } from "../../lib/logger";

/**
 * Full-screen sign-in overlay. Rendered by App.tsx when Supabase is
 * configured but no session is present. Keeps copy product-benefit-focused
 * — the audience is non-technical, so no mention of OAuth / tokens / APIs.
 */
export function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Browser opens. We stay in "loading" until the deep-link callback
      // flips the session in onAuthStateChange. If the user cancels in the
      // browser there's no signal back — they can click again.
    } catch (e) {
      logger.error(`[auth] signInWithGoogle failed: ${e}`);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <HoustonLogo size={48} />
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Welcome to Houston</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to save your agents and keep everything in sync.
          </p>
        </div>

        <Button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full rounded-full h-11 flex items-center justify-center gap-2"
        >
          <GoogleIcon />
          {loading ? "Opening browser..." : "Continue with Google"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          More sign-in options coming soon.
        </p>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
