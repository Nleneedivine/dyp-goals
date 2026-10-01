import { useEffect, useMemo, useState } from "react";
import { Medal, RefreshCw, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { answerAsText, type ProgramField } from "@/lib/formTypes";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type Submission = {
  id: string;
  submitted_at: string;
};
type AnswerRow = {
  submission_id: string;
  field_id: string;
  answer: Json;
};
type LeaderboardRow = {
  referrer_submission_id: string;
  referral_code: string;
  total_referrals: number;
  completed_referrals: number;
};

export function ProgramReferralPanel({
  formId,
  submissions,
  fields,
  answers,
}: {
  formId: string;
  submissions: Submission[];
  fields: ProgramField[];
  answers: AnswerRow[];
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "get_program_referral_leaderboard",
      { p_form_id: formId },
    );
    setLoading(false);

    if (error) {
      toast({
        title: "Referral leaderboard could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setRows((data ?? []).map((row) => ({
      ...row,
      total_referrals: Number(row.total_referrals),
      completed_referrals: Number(row.completed_referrals),
    })));
  };

  useEffect(() => {
    void load();
  }, [formId]);

  const emailField = useMemo(
    () => fields.find((field) => field.field_type === "email") ?? null,
    [fields],
  );

  const nameField = useMemo(
    () =>
      fields.find(
        (field) =>
          field.field_type === "text" &&
          /(^|\s)(full\s*)?name(\s|$)/i.test(field.label),
      ) ?? null,
    [fields],
  );

  const answerFor = (submissionId: string, fieldId?: string | null) => {
    if (!fieldId) return "";
    return answerAsText(
      answers.find(
        (answer) =>
          answer.submission_id === submissionId &&
          answer.field_id === fieldId,
      )?.answer ?? "",
    );
  };

  const qualified = rows.filter((row) => row.completed_referrals >= 10);
  const prizeLeaders = qualified.slice(0, 3);
  const totalAttributed = rows.reduce(
    (sum, row) => sum + row.total_referrals,
    0,
  );
  const totalCompleted = rows.reduce(
    (sum, row) => sum + row.completed_referrals,
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Attributed referrals</p>
            <p className="mt-1 text-2xl font-bold">{totalAttributed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Completed referrals</p>
            <p className="mt-1 text-2xl font-bold">{totalCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Prize-qualified referrers</p>
            <p className="mt-1 text-2xl font-bold">{qualified.length}</p>
            <p className="text-xs text-muted-foreground">10+ completed referrals</p>
          </CardContent>
        </Card>
      </div>

      {prizeLeaders.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Current prize leaders
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Top three by completed referrals among referrers who have reached the 10-completion threshold.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {prizeLeaders.map((row, index) => {
              const name = answerFor(row.referrer_submission_id, nameField?.id);
              const email = answerFor(row.referrer_submission_id, emailField?.id);
              return (
                <div key={row.referral_code} className="rounded-xl border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className="gap-1">
                      <Medal className="h-3 w-3" />
                      #{index + 1}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{row.referral_code}</span>
                  </div>
                  <p className="mt-3 font-semibold">
                    {name || email || `Submission ${row.referrer_submission_id.slice(0, 8)}`}
                  </p>
                  {name && email && <p className="mt-1 text-xs text-muted-foreground">{email}</p>}
                  <p className="mt-3 text-2xl font-bold text-primary">{row.completed_referrals}</p>
                  <p className="text-xs text-muted-foreground">
                    completed of {row.total_referrals} attributed referrals
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Referral leaderboard
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Registration alone does not count as a completed referral. Completion is recognized when the referred participant has a certificate issued.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No attributed referrals yet.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row, index) => {
                const name = answerFor(row.referrer_submission_id, nameField?.id);
                const email = answerFor(row.referrer_submission_id, emailField?.id);
                return (
                  <div
                    key={row.referral_code}
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">#{index + 1}</span>
                        <span className="font-medium">
                          {name || email || `Submission ${row.referrer_submission_id.slice(0, 8)}`}
                        </span>
                        {row.completed_referrals >= 10 && (
                          <Badge variant="secondary">Prize threshold reached</Badge>
                        )}
                      </div>
                      {name && email && <p className="mt-1 text-xs text-muted-foreground">{email}</p>}
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{row.referral_code}</p>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Attributed</p>
                        <p className="text-lg font-bold">{row.total_referrals}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Completed</p>
                        <p className="text-lg font-bold text-primary">{row.completed_referrals}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
