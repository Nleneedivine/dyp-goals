import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";

type SponsorshipLink = {
  valid?: boolean;
  formSlug?: string;
  code?: string;
  campaignName?: string;
  sponsorName?: string;
};

export default function SponsorshipRedirect() {
  const { code = "" } = useParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      const { data, error: rpcError } = await supabase.rpc("resolve_sponsorship_link", {
        p_code: code,
      });

      if (rpcError) {
        setError("This sponsorship link could not be opened right now.");
        return;
      }

      const result = (data ?? {}) as SponsorshipLink;
      if (!result.valid || !result.formSlug || !result.code) {
        setError("This sponsorship link is invalid, inactive or no longer available.");
        return;
      }

      const destination = new URL(`/apply/${result.formSlug}`, window.location.origin);
      destination.searchParams.set("sponsor", result.code);
      window.location.replace(destination.toString());
    };

    void run();
  }, [code]);

  return (
    <main className="min-h-screen brand-wash grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
        <BrandLogo className="mx-auto mb-5" />
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Sponsorship link unavailable</h1>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Opening sponsored registration</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We’re connecting your registration to the DIT sponsorship campaign.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
