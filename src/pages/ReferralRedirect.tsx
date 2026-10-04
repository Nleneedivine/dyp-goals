import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";

type ClickResult = {
  valid?: boolean;
  formSlug?: string;
  referralCode?: string;
  shortCode?: string;
  displayName?: string;
  visitorToken?: string;
};

export default function ReferralRedirect() {
  const { code = "" } = useParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const storageKey = `dyp-referral-visitor:${code.toUpperCase()}`;
      const savedVisitor = window.localStorage.getItem(storageKey);

      const { data, error: rpcError } = await supabase.rpc("record_program_referral_click", {
        p_code: code,
        p_visitor_token: savedVisitor || undefined,
      });

      if (!active) return;

      if (rpcError) {
        setError("This referral link could not be opened right now. Please try again.");
        return;
      }

      const result = (data ?? {}) as ClickResult;
      if (!result.valid || !result.formSlug || !result.referralCode || !result.visitorToken) {
        setError("This referral link is invalid or the registration is no longer open.");
        return;
      }

      window.localStorage.setItem(storageKey, result.visitorToken);
      window.localStorage.setItem(
        `dyp-referral-attribution:${result.formSlug}`,
        JSON.stringify({
          referralCode: result.referralCode,
          visitorToken: result.visitorToken,
          displayName: result.displayName ?? "",
          savedAt: new Date().toISOString(),
        }),
      );

      const destination = new URL(
        `/apply/${result.formSlug}`,
        window.location.origin,
      );
      destination.searchParams.set("ref", result.referralCode);
      destination.searchParams.set("rv", result.visitorToken);
      window.location.replace(destination.toString());
    };

    void run();

    return () => {
      active = false;
    };
  }, [code]);

  return (
    <main className="min-h-screen brand-wash grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
        <BrandLogo className="mx-auto mb-5" />
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Referral link unavailable</h1>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Opening registration</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We’re attaching this referral to the registration journey.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
