import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, FileImage, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { answerAsText, type ProgramField } from "@/lib/formTypes";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

type Payment = Tables<"program_payments">;
type Submission = { id: string; submitted_at: string };
type AnswerRow = { submission_id: string; field_id: string; answer: Json };

export function ProgramPaymentPanel({
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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("program_payments")
      .select("*")
      .eq("form_id", formId)
      .order("updated_at", { ascending: false });
    setLoading(false);

    if (error) {
      toast({
        title: "Payments could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const loaded = data ?? [];
    setPayments(loaded);

    const proofEntries = await Promise.all(
      loaded
        .filter((payment) => Boolean(payment.proof_path))
        .map(async (payment) => {
          const { data: signed } = await supabase.storage
            .from("payment-proofs")
            .createSignedUrl(payment.proof_path!, 60 * 60);
          return [payment.submission_id, signed?.signedUrl ?? ""] as const;
        }),
    );

    setProofUrls(
      Object.fromEntries(proofEntries.filter(([, url]) => Boolean(url))),
    );
  };

  useEffect(() => {
    void load();
  }, [formId]);

  const paymentBySubmission = useMemo(
    () => new Map(payments.map((payment) => [payment.submission_id, payment] as const)),
    [payments],
  );

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
      ) ??
      fields.find(
        (field) =>
          field.field_type === "text" &&
          /first\s*name/i.test(field.label),
      ) ??
      null,
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

  const setStatus = async (
    submissionId: string,
    status: "paid" | "rejected" | "pending",
  ) => {
    const rejectionReason = rejectionReasons[submissionId]?.trim() ?? "";
    if (status === "rejected" && rejectionReason.length < 3) {
      toast({
        title: "Add a rejection reason",
        description: "Tell the participant what needs to be corrected before they upload another proof.",
        variant: "destructive",
      });
      return;
    }

    setSavingId(submissionId);
    const { data, error } = await supabase.rpc("admin_set_program_payment_status", {
      p_submission_id: submissionId,
      p_status: status,
      p_rejection_reason: status === "rejected" ? rejectionReason : undefined,
    });
    setSavingId(null);

    if (error || !data) {
      toast({
        title: "Payment status could not be updated",
        description: error?.message ?? "No payment record returned.",
        variant: "destructive",
      });
      return;
    }

    setPayments((current) => [
      data,
      ...current.filter((item) => item.submission_id !== submissionId),
    ]);
    if (status !== "rejected") {
      setRejectionReasons((current) => ({ ...current, [submissionId]: "" }));
    }

    toast({
      title:
        status === "paid"
          ? "Payment approved"
          : status === "rejected"
            ? "Payment rejected"
            : "Payment returned to pending",
      description:
        status === "paid"
          ? "The participant can now access the configured WhatsApp group link."
          : undefined,
    });
  };

  const paid = payments.filter((payment) => payment.status === "paid").length;
  const pending = payments.filter((payment) => payment.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Payment records</p>
            <p className="mt-1 text-2xl font-bold">{payments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="mt-1 text-2xl font-bold text-primary">{paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Awaiting verification</p>
            <p className="mt-1 text-2xl font-bold">{pending}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Registration payments
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Manual transfers require approval. Paystack payments become paid after server verification.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {submissions.map((submission) => {
            const payment = paymentBySubmission.get(submission.id);
            if (!payment) return null;

            const name = answerFor(submission.id, nameField?.id);
            const email = answerFor(submission.id, emailField?.id);
            const saving = savingId === submission.id;

            return (
              <div
                key={submission.id}
                className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {name || email || `Submission ${submission.id.slice(0, 8)}`}
                    </p>
                    <Badge
                      variant={
                        payment.status === "paid"
                          ? "secondary"
                          : payment.status === "rejected"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {payment.status}
                    </Badge>
                    <Badge variant="outline">{payment.method}</Badge>
                  </div>
                  {name && email && (
                    <p className="mt-1 text-sm text-muted-foreground">{email}</p>
                  )}
                  <p className="mt-2 text-sm">
                    {(payment.amount_minor / 100).toLocaleString("en-NG", {
                      style: "currency",
                      currency: payment.currency,
                    })}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {payment.provider_reference || payment.manual_reference || "No reference"}
                  </p>

                  {payment.method === "manual" && payment.proof_path && (
                    <div className="mt-3">
                      {proofUrls[submission.id] ? (
                        <a
                          href={proofUrls[submission.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-muted/20 p-2 text-sm font-medium hover:border-primary/40"
                        >
                          <img
                            src={proofUrls[submission.id]}
                            alt="Uploaded payment proof"
                            className="h-20 w-20 shrink-0 rounded-md border object-cover"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1">
                              <FileImage className="h-4 w-4 text-primary" />
                              View payment proof
                            </span>
                            <span className="mt-1 block text-xs font-normal text-muted-foreground">
                              Uploaded {payment.proof_uploaded_at ? new Date(payment.proof_uploaded_at).toLocaleString() : ""}
                            </span>
                          </span>
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground">Loading proof preview…</p>
                      )}
                    </div>
                  )}

                  {payment.status === "rejected" && payment.rejection_reason && (
                    <p className="mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                      Rejection reason: {payment.rejection_reason}
                    </p>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-2 lg:items-end">
                  {payment.method === "manual" && payment.status !== "paid" && (
                    <Input
                      className="w-full lg:w-[280px]"
                      value={rejectionReasons[submission.id] ?? ""}
                      onChange={(event) =>
                        setRejectionReasons((current) => ({
                          ...current,
                          [submission.id]: event.target.value,
                        }))
                      }
                      placeholder="Reason if rejecting"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                  {payment.status !== "paid" && (
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => void setStatus(submission.id, "paid")}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  )}
                  {payment.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void setStatus(submission.id, "rejected")}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  )}
                  {payment.status !== "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => void setStatus(submission.id, "pending")}
                    >
                      Reset pending
                    </Button>
                  )}
                  </div>
                </div>
              </div>
            );
          })}

          {payments.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No payment attempts yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
