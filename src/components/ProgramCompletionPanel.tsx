import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Download, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { answerAsText, type ProgramField } from "@/lib/formTypes";
import { supabase } from "@/integrations/supabase/client";
import { ProgramCertificateDocument } from "@/components/ProgramCertificateDocument";
import { pdf } from "@react-pdf/renderer";
import type { Json, Tables } from "@/integrations/supabase/types";

type ParticipantStatus = Tables<"program_participant_status">;
type Submission = {
  id: string;
  submitted_at: string;
};
type AnswerRow = {
  submission_id: string;
  field_id: string;
  answer: Json;
};

export function ProgramCompletionPanel({
  formId,
  formTitle,
  submissions,
  fields,
  answers,
}: {
  formId: string;
  formTitle: string;
  submissions: Submission[];
  fields: ProgramField[];
  answers: AnswerRow[];
}) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<ParticipantStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadStatuses = async () => {
    const { data, error } = await supabase
      .from("program_participant_status")
      .select("*")
      .eq("form_id", formId);

    if (error) {
      toast({
        title: "Completion status could not load",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setStatuses(data ?? []);
  };

  useEffect(() => {
    void loadStatuses();
  }, [formId]);

  const statusBySubmission = useMemo(
    () => new Map(statuses.map((status) => [status.submission_id, status] as const)),
    [statuses],
  );

  const nonSectionFields = useMemo(
    () => fields.filter((field) => field.field_type !== "section"),
    [fields],
  );

  const emailField = useMemo(
    () => nonSectionFields.find((field) => field.field_type === "email") ?? null,
    [nonSectionFields],
  );

  const nameField = useMemo(
    () =>
      nonSectionFields.find(
        (field) =>
          field.field_type === "text" &&
          /(^|\s)(full\s*)?name(\s|$)/i.test(field.label),
      ) ?? null,
    [nonSectionFields],
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
  const downloadCertificate = async (
    submission: Submission,
    status: ParticipantStatus,
  ) => {
    if (!status.certificate_code || !status.certificate_issued_at) return;

    const name =
      answerFor(submission.id, nameField?.id) ||
      answerFor(submission.id, emailField?.id) ||
      `Participant ${submission.id.slice(0, 8)}`;

    setDownloadingId(submission.id);
    try {
      const certificate = (
        <ProgramCertificateDocument
          participantName={name}
          programTitle={formTitle}
          certificateCode={status.certificate_code}
          issuedAt={status.certificate_issued_at}
        />
      );
      const blob = await pdf(certificate).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${formTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-certificate.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Certificate could not be generated",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };


  const updateStatus = async (
    submissionId: string,
    completionStatus: "registered" | "completed" | "ineligible",
    issueCertificate = false,
  ) => {
    setSavingId(submissionId);
    const { data, error } = await supabase.rpc(
      "admin_set_program_participant_status",
      {
        p_submission_id: submissionId,
        p_completion_status: completionStatus,
        p_issue_certificate: issueCertificate,
      },
    );
    setSavingId(null);

    if (error || !data) {
      toast({
        title: "Participant status could not be updated",
        description: error?.message ?? "No participant status was returned.",
        variant: "destructive",
      });
      return;
    }

    setStatuses((current) => [
      ...current.filter((item) => item.submission_id !== submissionId),
      data,
    ]);

    toast({
      title: issueCertificate
        ? "Certificate issued"
        : completionStatus === "completed"
          ? "Participant marked completed"
          : completionStatus === "ineligible"
            ? "Participant marked ineligible"
            : "Participant restored to registered",
      description:
        issueCertificate && data.certificate_code
          ? `Certificate code: ${data.certificate_code}`
          : undefined,
    });
  };

  const completed = statuses.filter(
    (status) => status.completion_status === "completed",
  ).length;
  const issued = statuses.filter((status) => status.certificate_issued_at).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completion & certificates</CardTitle>
        <p className="text-sm text-muted-foreground">
          Completion is an admin-confirmed program state. Issue a certificate only after the participant has satisfied the current program requirements.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Registered</p>
            <p className="mt-1 text-2xl font-bold">{submissions.length}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="mt-1 text-2xl font-bold">{completed}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Certificates issued</p>
            <p className="mt-1 text-2xl font-bold">{issued}</p>
          </div>
        </div>

        <div className="space-y-3">
          {submissions.map((submission) => {
            const status = statusBySubmission.get(submission.id);
            const completionStatus = status?.completion_status ?? "registered";
            const name = answerFor(submission.id, nameField?.id);
            const email = answerFor(submission.id, emailField?.id);
            const saving = savingId === submission.id;
            const downloading = downloadingId === submission.id;

            return (
              <div
                key={submission.id}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {name || email || `Submission ${submission.id.slice(0, 8)}`}
                      </p>
                      <Badge
                        variant={
                          completionStatus === "completed"
                            ? "secondary"
                            : completionStatus === "ineligible"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {completionStatus}
                      </Badge>
                      {status?.certificate_issued_at && (
                        <Badge className="gap-1">
                          <Award className="h-3 w-3" />
                          Certificate issued
                        </Badge>
                      )}
                    </div>
                    {name && email && (
                      <p className="mt-1 text-sm text-muted-foreground">{email}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted {new Date(submission.submitted_at).toLocaleString()}
                    </p>
                    {status?.certificate_code && (
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {status.certificate_code}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {saving ? (
                      <Button variant="outline" disabled>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating
                      </Button>
                    ) : (
                      <>
                        {completionStatus !== "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateStatus(submission.id, "completed")}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Mark completed
                          </Button>
                        )}
                        {completionStatus === "completed" &&
                          !status?.certificate_issued_at && (
                            <Button
                              size="sm"
                              onClick={() =>
                                void updateStatus(submission.id, "completed", true)
                              }
                            >
                              <Award className="mr-2 h-4 w-4" />
                              Issue certificate
                            </Button>
                          )}
                        {status?.certificate_issued_at &&
                          status.certificate_code && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={downloading}
                              onClick={() => void downloadCertificate(submission, status)}
                            >
                              {downloading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              Download PDF
                            </Button>
                          )}
                        {completionStatus !== "ineligible" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateStatus(submission.id, "ineligible")}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Ineligible
                          </Button>
                        )}
                        {completionStatus !== "registered" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void updateStatus(submission.id, "registered")}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reset
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {submissions.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No submitted participants yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
