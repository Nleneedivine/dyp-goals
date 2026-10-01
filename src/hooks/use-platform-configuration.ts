import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlatformConfiguration = {
  accountability_lab_start_date: string;
  ui2_default: boolean;
};

const DEFAULT_CONFIGURATION: PlatformConfiguration = {
  accountability_lab_start_date: "2027-01-08",
  ui2_default: false,
};

export function usePlatformConfiguration() {
  const [configuration, setConfiguration] = useState<PlatformConfiguration>(DEFAULT_CONFIGURATION);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("platform_configuration")
      .select("accountability_lab_start_date,ui2_default")
      .eq("id", "global")
      .maybeSingle();

    if (!error && data) {
      setConfiguration({
        accountability_lab_start_date:
          data.accountability_lab_start_date ?? DEFAULT_CONFIGURATION.accountability_lab_start_date,
        ui2_default: data.ui2_default === true,
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { configuration, loading, refresh };
}

export function formatProgramDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
