import { FeaturedTestimonials } from "@/components/testimonials/FeaturedTestimonials";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, CreditCard, ExternalLink, Landmark, Loader2, RefreshCw, Search, Share2, Star, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseOptions, type ProgramField, type ProgramForm } from "@/lib/formTypes";

type Answer = string | number | boolean | string[] | null;
type Timing = { firstInputDelayMs: number | null; activeTimeMs: number | null };
type WizardStep = {
  id: string;
  title: string;
  description: string;
  fields: ProgramField[];
  includesReferral?: boolean;
  review?: boolean;
};
type SponsorshipQuestion = {
  id: string;
  label: string;
  helperText: string;
  fieldType: "text" | "textarea" | "dropdown" | "radio" | "multi_select" | "checkbox" | "number";
  options: unknown;
  required: boolean;
  displayOrder: number;
};

type SponsorshipCampaign = {
  valid?: boolean;
  reason?: string;
  message?: string;
  campaignId?: string;
  name?: string;
  sponsorName?: string;
  code?: string;
  seatValueMinor?: number;
  participantAmountMinor?: number;
  currency?: string;
  approvalRequired?: boolean;
  questionsEnabled?: boolean;
  questions?: SponsorshipQuestion[];
  seatsRemaining?: number | null;
};

type PaymentState = {
  available?: boolean;
  submissionId?: string;
  amountMinor?: number;
  currency?: string;
  manualEnabled?: boolean;
  paystackEnabled?: boolean;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  manualInstructions?: string;
  paymentStatus?: "unpaid" | "pending" | "paid" | "rejected";
  fundingType?: "self_paid" | "sponsored";
  sponsorshipStatus?: "pending" | "approved" | "rejected" | "revoked" | null;
  sponsorName?: string | null;
  sponsorshipCampaignName?: string | null;
  sponsoredSeatValueMinor?: number;
  sponsorshipRejectionReason?: string | null;
  financiallySatisfied?: boolean;
  paymentMethod?: "manual" | "paystack" | null;
  paymentReference?: string | null;
  proofUploaded?: boolean;
  rejectionReason?: string | null;
  whatsappGroupUrl?: string;
};

type ProofQualityResult = {
  ok: boolean;
  message: string;
  width?: number;
  height?: number;
};

const checkPaymentProofImage = async (file: File): Promise<ProofQualityResult> => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { ok: false, message: "Upload a JPG, PNG or WebP image." };
  }

  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, message: "The payment proof must be smaller than 8 MB." };
  }

  if (file.size < 20 * 1024) {
    return { ok: false, message: "This image is unusually small. Please upload a clearer screenshot or photo." };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The image could not be opened."));
      element.src = objectUrl;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (Math.max(width, height) < 600 || Math.min(width, height) < 300) {
      return {
        ok: false,
        message: "This image is too small to review comfortably. Please upload a higher-resolution proof.",
        width,
        height,
      };
    }

    const sampleWidth = Math.min(180, width);
    const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = Math.min(220, sampleHeight);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { ok: true, message: "Image ready for review.", width, height };

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance: number[] = [];

    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      luminance.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }

    const mean = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
    const variance =
      luminance.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      Math.max(1, luminance.length);
    const standardDeviation = Math.sqrt(variance);

    if (mean < 18) {
      return { ok: false, message: "This image is too dark to review. Please retake or upload a brighter proof.", width, height };
    }
    if (mean > 248 && standardDeviation < 8) {
      return { ok: false, message: "This image appears blank or overexposed. Please upload another proof.", width, height };
    }
    if (standardDeviation < 10) {
      return { ok: false, message: "There is not enough visible detail in this image. Please upload a clearer proof.", width, height };
    }

    return { ok: true, message: "Image is clear enough for human review.", width, height };
  } catch {
    return { ok: false, message: "We could not read this image. Please choose another file." };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};


export default function PublicForm() {
  const { slug } = useParams();
  const [form, setForm] = useState<ProgramForm | null>(null);
  const [fields, setFields] = useState<ProgramField[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ownReferralCode, setOwnReferralCode] = useState("");
  const [referrerQuery, setReferrerQuery] = useState("");
  const [referrerResults, setReferrerResults] = useState<Array<{ referral_code: string; display_name: string }>>([]);
  const [selectedReferralCode, setSelectedReferralCode] = useState("");
  const [selectedReferrerName, setSelectedReferrerName] = useState("");
  const [stickyReferralCode, setStickyReferralCode] = useState("");
  const [referralVisitorToken, setReferralVisitorToken] = useState("");
  const [searchingReferrers, setSearchingReferrers] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [manualReference, setManualReference] = useState("");
  const [manualProof, setManualProof] = useState<File | null>(null);
  const [proofQuality, setProofQuality] = useState<ProofQualityResult | null>(null);
  const [proofChecking, setProofChecking] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [sponsorship, setSponsorship] = useState<SponsorshipCampaign | null>(null);
  const [sponsorshipAnswers, setSponsorshipAnswers] = useState<Record<string, Answer>>({});
  const [sponsorshipError, setSponsorshipError] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const startedAt = useRef(Date.now());
  const focusedAt = useRef<Record<string, number>>({});

  const deviceType = useMemo(() => window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop", []);
  const incomingReferralCode = useMemo(() => new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() ?? "", []);
  const incomingReferralVisitorToken = useMemo(() => new URLSearchParams(window.location.search).get("rv")?.trim() ?? "", []);
  const paymentReference = useMemo(() => new URLSearchParams(window.location.search).get("payment_reference")?.trim() ?? "", []);
  const incomingSponsorshipCode = useMemo(() => new URLSearchParams(window.location.search).get("sponsor")?.trim().toUpperCase() ?? "", []);
  const effectiveReferralCode = selectedReferralCode || incomingReferralCode || stickyReferralCode;


  const sectionGroups = useMemo(() => {
    const groups: Array<{ id: string; title: string; description: string; fields: ProgramField[] }> = [];
    let current: { id: string; title: string; description: string; fields: ProgramField[] } | null = null;

    fields.forEach((field) => {
      if (field.field_type === "section") {
        current = {
          id: field.id,
          title: field.label,
          description: field.helper_text || "",
          fields: [],
        };
        groups.push(current);
        return;
      }

      if (!current) {
        current = {
          id: "general",
          title: "Registration details",
          description: "",
          fields: [],
        };
        groups.push(current);
      }

      current.fields.push(field);
    });

    return groups;
  }, [fields]);

  const wizardSteps = useMemo<WizardStep[]>(() => {
    const hearField = fields.find((field) =>
      field.label.toLowerCase().includes("how did you hear about"),
    );

    const steps: WizardStep[] = [];

    sectionGroups.forEach((group) => {
      const normalizedTitle = group.title.toLowerCase();
      const isGoalsSection = normalizedTitle.includes("your goals");
      const stepFields = isGoalsSection && hearField
        ? group.fields.filter((field) => field.id !== hearField.id)
        : group.fields;

      if (stepFields.length > 0) {
        steps.push({
          id: group.id,
          title: group.title,
          description: group.description,
          fields: stepFields,
        });
      }

      if (isGoalsSection) {
        steps.push({
          id: "registration-details",
          title: "Registration Details",
          description: "Tell us how you found DYP GOALS and who referred you, if anyone.",
          fields: hearField ? [hearField] : [],
          includesReferral: true,
        });
      }
    });

    if (sponsorship?.valid && sponsorship.questionsEnabled && (sponsorship.questions?.length ?? 0) > 0) {
      steps.push({
        id: "sponsorship-details",
        title: `${sponsorship.sponsorName ?? "Sponsor"} Sponsored Participant Information`,
        description: "These questions apply only to participants registering through this sponsorship campaign.",
        fields: [],
      });
    }

    if (!steps.some((step) => step.includesReferral)) {
      steps.push({
        id: "registration-details",
        title: "Registration Details",
        description: "Tell us who referred you, if anyone.",
        fields: [],
        includesReferral: true,
      });
    }

    steps.push({
      id: "review",
      title: "Review & Submit",
      description: "Check your responses before submitting your registration.",
      fields: [],
      review: true,
    });

    return steps;
  }, [fields, sectionGroups, sponsorship]);

  const activeStep = wizardSteps[Math.min(currentStep, Math.max(0, wizardSteps.length - 1))];
  const lastStepIndex = Math.max(0, wizardSteps.length - 1);

  const hasAnswer = (field: ProgramField) => {
    if (!field.required) return true;
    const value = answers[field.id];

    if (field.field_type === "checkbox") return value === true;
    if (field.field_type === "multi_select") return Array.isArray(value) && value.length > 0;
    if (field.field_type === "file") return Boolean(files[field.id] || value);
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null && value !== undefined;
  };

  const validateActiveStep = () => {
    if (!activeStep || activeStep.review) return true;

    if (activeStep.id === "sponsorship-details" && sponsorship?.questions) {
      const missingSponsorQuestion = sponsorship.questions.find((question) => {
        if (!question.required) return false;
        const value = sponsorshipAnswers[question.id];
        if (question.fieldType === "checkbox") return value !== true;
        if (question.fieldType === "multi_select") return !Array.isArray(value) || value.length === 0;
        if (typeof value === "string") return value.trim().length === 0;
        if (typeof value === "number") return !Number.isFinite(value);
        return value === null || value === undefined;
      });
      if (missingSponsorQuestion) {
        setError(`Please complete “${missingSponsorQuestion.label}” before continuing.`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return false;
      }
      return true;
    }

    const missing = activeStep.fields.find((field) => !hasAnswer(field));
    if (!missing) return true;

    setError(`Please complete “${missing.label}” before continuing.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return false;
  };

  const goToStep = (index: number) => {
    setError("");
    setCurrentStep(Math.max(0, Math.min(index, lastStepIndex)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const nextStep = () => {
    if (!validateActiveStep()) return;
    goToStep(currentStep + 1);
  };

  const answerLabel = (field: ProgramField) => {
    const value = answers[field.id];
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === null || value === undefined || value === "") return "Not provided";
    return String(value);
  };


  const findReferrers = async (query = referrerQuery) => {
    if (!form || query.trim().length < 2) {
      setReferrerResults([]);
      return;
    }

    setSearchingReferrers(true);
    const { data, error } = await supabase.rpc("search_program_referrers", {
      p_form_id: form.id,
      p_query: query.trim(),
    });
    setSearchingReferrers(false);

    if (error) {
      setError("Referrer search is temporarily unavailable. You can still submit without selecting a referrer.");
      return;
    }

    const results = data ?? [];
    setError("");
    setReferrerResults(results);
    const referralCode = incomingReferralCode || stickyReferralCode;
    if (referralCode && !selectedReferralCode) {
      const exact = results.find((item) => item.referral_code.toUpperCase() === referralCode);
      if (exact) {
        setSelectedReferralCode(exact.referral_code);
        setSelectedReferrerName(exact.display_name);
      }
    }
  };

  useEffect(() => {
    const referralCode = incomingReferralCode || stickyReferralCode;
    if (!form || !referralCode) return;
    setReferrerQuery(referralCode);
    void findReferrers(referralCode);
  }, [form, incomingReferralCode, stickyReferralCode]);

  useEffect(() => {
    const load = async () => {
      const { data: formData } = await supabase
        .from("program_forms")
        .select("*")
        .eq("slug", slug ?? "")
        .eq("status", "published")
        .maybeSingle();
      if (!formData) {
        setLoading(false);
        return;
      }

      const { data: fieldData } = await supabase
        .from("program_form_fields")
        .select("*")
        .eq("form_id", formData.id)
        .order("display_order");

      setForm(formData as ProgramForm);
      setFields((fieldData ?? []) as ProgramField[]);

      if (incomingSponsorshipCode) {
        const { data: sponsorData, error: sponsorError } = await supabase.rpc(
          "get_public_sponsorship_campaign",
          { p_form_id: formData.id, p_code: incomingSponsorshipCode },
        );
        if (sponsorError) {
          setSponsorshipError("The sponsorship could not be verified right now.");
        } else {
          const resolved = (sponsorData ?? null) as SponsorshipCampaign | null;
          setSponsorship(resolved);
          if (!resolved?.valid) {
            setSponsorshipError(
              resolved?.message ?? "This sponsorship code is invalid, inactive or no longer has available seats.",
            );
          }
        }
      }

      const storageKey = `dyp-program-session:${formData.slug}`;
      const storedToken = window.localStorage.getItem(storageKey);
      const attributionKey = `dyp-referral-attribution:${formData.slug}`;

      let referralCodeForSession = incomingReferralCode;
      let visitorTokenForSession = incomingReferralVisitorToken;

      if (incomingReferralCode) {
        setStickyReferralCode(incomingReferralCode);
        if (incomingReferralVisitorToken) {
          setReferralVisitorToken(incomingReferralVisitorToken);
        }
        window.localStorage.setItem(
          attributionKey,
          JSON.stringify({
            referralCode: incomingReferralCode,
            visitorToken: incomingReferralVisitorToken,
            savedAt: new Date().toISOString(),
          }),
        );
      } else {
        try {
          const savedAttribution = JSON.parse(
            window.localStorage.getItem(attributionKey) ?? "null",
          ) as { referralCode?: string; visitorToken?: string } | null;

          if (savedAttribution?.referralCode) {
            referralCodeForSession = savedAttribution.referralCode.toUpperCase();
            visitorTokenForSession = savedAttribution.visitorToken ?? "";
            setStickyReferralCode(referralCodeForSession);
            setReferralVisitorToken(visitorTokenForSession);
          }
        } catch {
          window.localStorage.removeItem(attributionKey);
        }
      }

      const referralJourney = Boolean(referralCodeForSession);
      const sponsorshipJourney = Boolean(incomingSponsorshipCode);

      if (paymentReference && storedToken) {
        setPaymentLoading(true);
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          "program-payment",
          { body: { action: "verify", reference: paymentReference } },
        );
        setPaymentLoading(false);
        if (verifyError || verifyData?.error) {
          setPaymentError(verifyData?.error ?? verifyError?.message ?? "Payment verification failed.");
        }
      }

      if (storedToken && sponsorshipJourney) {
        const sponsoredState = await loadPaymentState(storedToken);
        if (
          sponsoredState?.available &&
          sponsoredState.fundingType === "sponsored"
        ) {
          setSessionToken(storedToken);
          setSuccess(formData.confirmation_message);
          const { data: referralCode } = await supabase.rpc("get_program_referral_code", {
            p_session_token: storedToken,
          });
          if (referralCode) setOwnReferralCode(referralCode);
          setLoading(false);
          return;
        }
      }

      if (storedToken && ((!referralJourney && !sponsorshipJourney) || Boolean(paymentReference))) {
        const state = await loadPaymentState(storedToken);
        if (state?.available) {
          setSessionToken(storedToken);
          setSuccess(formData.confirmation_message);
          const { data: referralCode } = await supabase.rpc("get_program_referral_code", {
            p_session_token: storedToken,
          });
          if (referralCode) setOwnReferralCode(referralCode);
          setLoading(false);
          return;
        }
      }

      const { data } = await supabase.functions.invoke("program-form-public", {
        body: {
          action: "start",
          formId: formData.id,
          deviceType,
          browserFamily: navigator.userAgent.slice(0, 80),
        },
      });

      if (data?.sessionToken) {
        setSessionToken(data.sessionToken);

        if (referralCodeForSession && visitorTokenForSession) {
          const { error: attachError } = await supabase.rpc("attach_program_referral_visit", {
            p_session_token: data.sessionToken,
            p_referral_code: referralCodeForSession,
            p_visitor_token: visitorTokenForSession,
          });
          if (attachError) {
            console.error("Referral visit could not be attached to the registration session:", attachError);
          }
        }
      }
      setLoading(false);
    };

    void load();
  }, [slug, deviceType, paymentReference, incomingReferralCode, incomingReferralVisitorToken, incomingSponsorshipCode]);


  const loadPaymentState = async (token: string) => {
    const { data, error } = await supabase.rpc("get_program_payment_state", {
      p_session_token: token,
    });
    if (!error && data && typeof data === "object") {
      setPaymentState(data as PaymentState);
      return data as PaymentState;
    }
    return null;
  };

  const chooseManualProof = async (file: File | null) => {
    setManualProof(null);
    setProofQuality(null);
    setPaymentError("");
    if (!file) return;

    setProofChecking(true);
    const quality = await checkPaymentProofImage(file);
    setProofChecking(false);
    setProofQuality(quality);

    if (!quality.ok) {
      setPaymentError(quality.message);
      return;
    }

    setManualProof(file);
  };

  const submitManualPayment = async () => {
    if (!sessionToken || manualReference.trim().length < 3) {
      setPaymentError("Enter your bank transfer reference or payment note.");
      return;
    }
    if (!manualProof || !proofQuality?.ok) {
      setPaymentError("Upload a clear payment proof image before submitting your transfer.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    const { data: upload, error: uploadRequestError } = await supabase.functions.invoke(
      "program-payment",
      {
        body: {
          action: "prepare-proof-upload",
          sessionToken,
          fileName: manualProof.name,
          contentType: manualProof.type,
        },
      },
    );

    if (uploadRequestError || upload?.error || !upload?.path || !upload?.token) {
      setPaymentLoading(false);
      setPaymentError(upload?.error ?? uploadRequestError?.message ?? "Could not prepare the payment proof upload.");
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .uploadToSignedUrl(upload.path, upload.token, manualProof, {
        contentType: manualProof.type,
      });

    if (uploadError) {
      setPaymentLoading(false);
      setPaymentError("The payment proof could not be uploaded. Please try again.");
      return;
    }

    const { data, error } = await supabase.rpc("submit_manual_program_payment_with_proof", {
      p_session_token: sessionToken,
      p_manual_reference: manualReference.trim(),
      p_proof_path: upload.path,
      p_proof_content_type: manualProof.type,
    });

    setPaymentLoading(false);
    if (error) {
      setPaymentError(error.message);
      return;
    }

    setPaymentState((data ?? null) as PaymentState | null);
    setManualProof(null);
    setProofQuality(null);
  };

  const startPaystackPayment = async () => {
    if (!sessionToken || !form) return;
    setPaymentLoading(true);
    setPaymentError("");
    const { data, error } = await supabase.functions.invoke("program-payment", {
      body: {
        action: "initialize",
        sessionToken,
        returnUrl: `${window.location.origin}/apply/${form.slug}`,
      },
    });
    setPaymentLoading(false);
    if (error || data?.error || !data?.authorizationUrl) {
      setPaymentError(data?.error ?? error?.message ?? "Paystack could not start.");
      return;
    }
    window.localStorage.setItem(`dyp-program-session:${form.slug}`, sessionToken);
    window.location.assign(data.authorizationUrl);
  };

  const track = (fieldId: string | null, eventType: "view" | "focus" | "first_input" | "change" | "blur" | "submit") => {
    if (!form || !sessionToken) return;
    void supabase.functions.invoke("program-form-public", { body: { action: "track", formId: form.id, sessionToken, fieldId, eventType, elapsedMs: Date.now() - startedAt.current } });
  };
  const focus = (id: string) => { focusedAt.current[id] = Date.now(); track(id, "focus"); };
  const change = (id: string, value: Answer) => {
    if (answers[id] === undefined) setTimings((current) => ({ ...current, [id]: { firstInputDelayMs: Date.now() - (focusedAt.current[id] ?? Date.now()), activeTimeMs: current[id]?.activeTimeMs ?? null } }));
    setAnswers((current) => ({ ...current, [id]: value })); track(id, answers[id] === undefined ? "first_input" : "change");
  };
  const blur = (id: string) => { const active = Math.max(0, Date.now() - (focusedAt.current[id] ?? Date.now())); setTimings((current) => ({ ...current, [id]: { firstInputDelayMs: current[id]?.firstInputDelayMs ?? null, activeTimeMs: (current[id]?.activeTimeMs ?? 0) + active } })); track(id, "blur"); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (!form || !sessionToken) return setError("The form session could not start. Please refresh the page.");
    setSubmitting(true);
    const submittedAnswers = { ...answers };
    for (const [fieldId, file] of Object.entries(files)) {
      if (file.size > 10 * 1024 * 1024) { setSubmitting(false); return setError(`${file.name} is larger than 10 MB.`); }
      const { data: upload, error: uploadRequestError } = await supabase.functions.invoke("program-form-public", { body: { action: "upload", formId: form.id, sessionToken, fieldId, fileName: file.name, contentType: file.type } });
      if (uploadRequestError || !upload?.path || !upload?.token) { setSubmitting(false); return setError("A file could not be prepared for upload."); }
      const { error: uploadError } = await supabase.storage.from("program-form-uploads").uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
      if (uploadError) { setSubmitting(false); return setError(`${file.name} could not be uploaded.`); }
      submittedAnswers[fieldId] = upload.path;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("program-form-public", { body: { action: "submit", formId: form.id, sessionToken, answers: submittedAnswers, timings } });
    if (invokeError || data?.error) {
      setSubmitting(false);
      return setError(data?.error ?? invokeError?.message ?? "Your response could not be submitted.");
    }

    if (incomingSponsorshipCode && sponsorship?.valid) {
      const { error: claimError } = await supabase.rpc(
        "submit_program_sponsorship_claim",
        {
          p_session_token: sessionToken,
          p_code: incomingSponsorshipCode,
          p_answers: sponsorshipAnswers,
        },
      );
      if (claimError) {
        setSubmitting(false);
        return setError(claimError.message);
      }
    }

    const referralCodeToRecord = effectiveReferralCode;
    if (referralCodeToRecord) {
      const { error: referralError } = await supabase.rpc("record_program_referral_v2", {
        p_session_token: sessionToken,
        p_referral_code: referralCodeToRecord,
        p_visitor_token: referralVisitorToken || undefined,
      });
      if (referralError) {
        console.error("Referral attribution could not be recorded:", referralError);
      } else if (form) {
        window.localStorage.removeItem(`dyp-referral-attribution:${form.slug}`);
      }
    }

    const { data: referralCode, error: referralCodeError } = await supabase.rpc(
      "get_program_referral_code",
      { p_session_token: sessionToken },
    );
    if (!referralCodeError && referralCode) setOwnReferralCode(referralCode);

    window.localStorage.setItem(`dyp-program-session:${form.slug}`, sessionToken);
    await loadPaymentState(sessionToken);
    setSubmitting(false);
    setSuccess(data.confirmationMessage ?? form.confirmation_message);
  };

  const renderField = (field: ProgramField) => {
    const common = { id: field.id, required: field.required, placeholder: field.placeholder, onFocus: () => focus(field.id), onBlur: () => blur(field.id) };
    const value = answers[field.id]; const options = parseOptions(field.options);
    if (field.field_type === "textarea") return <Textarea {...common} value={String(value ?? "")} onChange={(event) => change(field.id, event.target.value)} />;
    if (field.field_type === "dropdown") return <Select value={String(value ?? "")} onValueChange={(next) => change(field.id, next)}><SelectTrigger onFocus={common.onFocus} onBlur={common.onBlur}><SelectValue placeholder={field.placeholder || "Select an option"} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
    if (field.field_type === "radio") return <RadioGroup value={String(value ?? "")} onValueChange={(next) => change(field.id, next)} className="space-y-2">{options.map((option) => <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><RadioGroupItem value={option} />{option}</label>)}</RadioGroup>;
    if (field.field_type === "multi_select") return <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => { const selected = Array.isArray(value) ? value : []; return <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><Checkbox checked={selected.includes(option)} onCheckedChange={(checked) => change(field.id, checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}</label>; })}</div>;
    if (field.field_type === "checkbox") return <label className="flex min-h-11 items-center gap-3 rounded-md border p-3"><Checkbox checked={Boolean(value)} onCheckedChange={(checked) => change(field.id, Boolean(checked))} />{field.placeholder || "Yes"}</label>;
    if (field.field_type === "rating") return <div className="flex gap-2">{[1,2,3,4,5].map((rating) => <Button key={rating} type="button" size="icon" variant={Number(value) >= rating ? "default" : "outline"} onClick={() => change(field.id, rating)} aria-label={`${rating} stars`}><Star className="h-4 w-4" /></Button>)}</div>;
    if (field.field_type === "file") return <Input {...common} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" aria-describedby={`${field.id}-help`} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setFiles((current) => ({ ...current, [field.id]: file })); change(field.id, file.name); } }} />;
    return <Input {...common} type={field.field_type === "phone" ? "tel" : field.field_type} value={String(value ?? "")} onChange={(event) => change(field.id, field.field_type === "number" ? Number(event.target.value) : event.target.value)} />;
  };

  const renderSponsorshipQuestion = (question: SponsorshipQuestion) => {
    const value = sponsorshipAnswers[question.id];
    const rawOptions = Array.isArray(question.options) ? question.options : [];
    const options = rawOptions.map((option) => String(option));
    const setValue = (next: Answer) =>
      setSponsorshipAnswers((current) => ({ ...current, [question.id]: next }));

    if (question.fieldType === "textarea") {
      return <Textarea value={String(value ?? "")} onChange={(event) => setValue(event.target.value)} />;
    }
    if (question.fieldType === "dropdown") {
      return <Select value={String(value ?? "")} onValueChange={(next) => setValue(next)}><SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
    }
    if (question.fieldType === "radio") {
      return <RadioGroup value={String(value ?? "")} onValueChange={(next) => setValue(next)} className="space-y-2">{options.map((option) => <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><RadioGroupItem value={option} />{option}</label>)}</RadioGroup>;
    }
    if (question.fieldType === "multi_select") {
      const selected = Array.isArray(value) ? value : [];
      return <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><Checkbox checked={selected.includes(option)} onCheckedChange={(checked) => setValue(checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}</label>)}</div>;
    }
    if (question.fieldType === "checkbox") {
      return <label className="flex min-h-11 items-center gap-3 rounded-md border p-3"><Checkbox checked={Boolean(value)} onCheckedChange={(checked) => setValue(Boolean(checked))} />Yes</label>;
    }
    return <Input type={question.fieldType === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(event) => setValue(question.fieldType === "number" ? Number(event.target.value) : event.target.value)} />;
  };

  const renderReferralLookup = () => (
    <div className="rounded-xl border bg-muted/15 p-4">
      <div className="flex items-start gap-3">
        <UserRound className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <Label htmlFor="referrer-search" className="text-base">
            Who referred you? <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Search by the person's name or DYP referral code.
          </p>
          {selectedReferralCode ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
              <div>
                <p className="font-medium">{selectedReferrerName || "Referral code applied"}</p>
                <p className="font-mono text-xs text-muted-foreground">{selectedReferralCode}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedReferralCode("");
                  setSelectedReferrerName("");
                  setStickyReferralCode("");
                  setReferralVisitorToken("");
                  if (form) {
                    window.localStorage.removeItem(`dyp-referral-attribution:${form.slug}`);
                  }
                  setReferrerQuery("");
                  setReferrerResults([]);
                }}
              >
                <X className="mr-1 h-4 w-4" />
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <Input
                  id="referrer-search"
                  value={referrerQuery}
                  onChange={(event) => setReferrerQuery(event.target.value)}
                  placeholder="Name or DYPGL code"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void findReferrers()}
                  disabled={searchingReferrers || referrerQuery.trim().length < 2}
                >
                  {searchingReferrers ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="sr-only">Find referrer</span>
                </Button>
              </div>
              {referrerResults.length > 0 && (
                <div className="mt-2 space-y-2">
                  {referrerResults.map((result) => (
                    <button
                      key={result.referral_code}
                      type="button"
                      onClick={() => {
                        setSelectedReferralCode(result.referral_code);
                        setSelectedReferrerName(result.display_name);
                        setReferralVisitorToken("");
                        setStickyReferralCode(result.referral_code);
                        if (form) {
                          window.localStorage.setItem(
                            `dyp-referral-attribution:${form.slug}`,
                            JSON.stringify({
                              referralCode: result.referral_code,
                              visitorToken: "",
                              displayName: result.display_name,
                              savedAt: new Date().toISOString(),
                            }),
                          );
                        }
                        setReferrerResults([]);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left hover:border-primary/40"
                    >
                      <span className="font-medium">{result.display_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{result.referral_code}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderWizardField = (field: ProgramField) => (
    <div key={field.id} className="space-y-2">
      <Label htmlFor={field.id} className="text-base">
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {field.helper_text && (
        <p id={`${field.id}-help`} className="text-sm text-muted-foreground">
          {field.helper_text}
        </p>
      )}
      {renderField(field)}
    </div>
  );

  const reviewFields = fields.filter((field) => field.field_type !== "section");

  if (loading) {
    return (
      <main className="min-h-screen brand-wash grid place-items-center">
        <Loader2 className="h-9 w-9 animate-spin text-primary-foreground" />
      </main>
    );
  }

  if (!form) {
    return (
      <main className="min-h-screen brand-wash grid place-items-center p-4">
        <Card className="max-w-lg">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold">This form is not available</h1>
            <p className="mt-3 text-muted-foreground">
              It may not be open yet, or submissions may have closed.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-secondary/45 px-4 pb-10 pt-28 sm:pb-16 sm:pt-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex min-h-20 items-center overflow-visible">
          <BrandLogo
            brand={form.brand}
            className="h-16 w-auto max-w-[240px] object-contain sm:h-20 sm:max-w-[300px]"
          />
        </div>

        {incomingSponsorshipCode && (
          <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            {sponsorship?.valid ? (
              <>
                <p className="font-semibold">{sponsorship.sponsorName} sponsored registration</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Campaign: {sponsorship.name}. Participant contribution after approval:{" "}
                  <strong>
                    {((sponsorship.participantAmountMinor ?? 0) / 100).toLocaleString("en-NG", {
                      style: "currency",
                      currency: sponsorship.currency ?? "NGN",
                    })}
                  </strong>.
                </p>
              </>
            ) : (
              <p className="text-sm text-destructive">
                {sponsorshipError || "Checking sponsorship eligibility…"}
              </p>
            )}
          </div>
        )}

        {success ? (
          <Card>
            <CardContent className="p-8 sm:p-10">
              <div className="text-center">
                <CheckCircle2 className="mx-auto mb-5 h-14 w-14 text-primary" />
                <h1 className="text-3xl font-bold">Registration received</h1>
                <p className="mt-4 text-muted-foreground">{success}</p>
              </div>

              {paymentState?.available && (
                <div className="mx-auto mt-7 max-w-xl rounded-2xl border p-5">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <p className="font-semibold">
                      {paymentState.fundingType === "sponsored" ? "Sponsorship status" : "Complete your payment"}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Amount:{" "}
                    <strong>
                      {((paymentState.amountMinor ?? 0) / 100).toLocaleString("en-NG", {
                        style: "currency",
                        currency: paymentState.currency ?? "NGN",
                      })}
                    </strong>
                  </p>

                  {paymentState.fundingType === "sponsored" && paymentState.sponsorshipStatus === "pending" ? (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-amber-950">
                      <p className="font-semibold">DIT sponsorship pending verification</p>
                      <p className="mt-2 text-sm">
                        You do not need to pay now. An Admin will verify your DIT sponsorship request. Once approved, WhatsApp and dashboard access will open automatically.
                      </p>
                    </div>
                  ) : paymentState.fundingType === "sponsored" && paymentState.sponsorshipStatus === "approved" ? (
                    <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                      <div className="text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                        <p className="mt-2 text-lg font-semibold">DIT-sponsored seat approved — you’re in</p>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                          Participant contribution: ₦0. Your seat is sponsored by {paymentState.sponsorName ?? "DIT"}.
                        </p>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {paymentState.whatsappGroupUrl ? (
                          <Button asChild size="lg" className="min-h-14 w-full whitespace-normal text-center leading-snug">
                            <a href={paymentState.whatsappGroupUrl} target="_blank" rel="noreferrer">
                              Join WhatsApp Group
                              <ExternalLink className="ml-2 h-4 w-4 shrink-0" />
                            </a>
                          </Button>
                        ) : (
                          <div className="flex min-h-14 items-center justify-center rounded-xl border bg-background px-4 py-3 text-center text-sm text-muted-foreground">
                            WhatsApp link will appear once configured.
                          </div>
                        )}
                        <Button asChild size="lg" variant="outline" className="min-h-14 w-full whitespace-normal text-center leading-snug">
                          <a href="/auth?mode=activate&next=%2Fprofile">
                            <UserRound className="mr-2 h-4 w-4 shrink-0" />
                            Open My GOALS Profile
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : paymentState.fundingType === "sponsored" && paymentState.sponsorshipStatus === "rejected" ? (
                    <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                      <p className="font-semibold text-destructive">DIT sponsorship was not approved</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {paymentState.sponsorshipRejectionReason || "You can continue with the regular registration payment below."}
                      </p>
                    </div>
                  ) : paymentState.paymentStatus === "paid" ? (
                    <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                      <div className="text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                        <p className="mt-2 text-lg font-semibold">Payment confirmed — you’re in</p>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                          Choose what you want to do now. Both options remain available later from your GOALS dashboard.
                        </p>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {paymentState.whatsappGroupUrl ? (
                          <Button asChild size="lg" className="min-h-14 w-full whitespace-normal text-center leading-snug">
                            <a href={paymentState.whatsappGroupUrl} target="_blank" rel="noreferrer">
                              Join WhatsApp Group
                              <ExternalLink className="ml-2 h-4 w-4 shrink-0" />
                            </a>
                          </Button>
                        ) : (
                          <div className="flex min-h-14 items-center justify-center rounded-xl border bg-background px-4 py-3 text-center text-sm text-muted-foreground">
                            WhatsApp link will appear here once Admin configures it.
                          </div>
                        )}

                        <Button
                          asChild
                          size="lg"
                          variant="outline"
                          className="min-h-14 w-full whitespace-normal text-center leading-snug"
                        >
                          <a href="/auth?mode=activate&next=%2Fjourney">
                            <UserRound className="mr-2 h-4 w-4 shrink-0" />
                            Open My GOALS Dashboard
                          </a>
                        </Button>
                      </div>

                      {ownReferralCode && (
                        <div className="mt-5 border-t pt-4 text-center">
                          <p className="text-sm font-medium">Start referring immediately</p>
                          <p className="mt-1 break-all font-mono text-sm text-primary">
                            {ownReferralCode}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() =>
                              void navigator.clipboard.writeText(
                                `${window.location.origin}/r/${encodeURIComponent(
                                  ownReferralCode.replace(/^DYPGL-/i, ""),
                                )}`,
                              )
                            }
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy referral link
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {paymentState.paystackEnabled && (
                          <Button
                            type="button"
                            className="min-h-12"
                            onClick={() => void startPaystackPayment()}
                            disabled={paymentLoading}
                          >
                            {paymentLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CreditCard className="mr-2 h-4 w-4" />
                            )}
                            Pay with Paystack
                          </Button>
                        )}
                        {paymentState.manualEnabled && (
                          <div className="rounded-xl border p-4 text-left sm:col-span-2">
                            <div className="flex items-center gap-2">
                              <Landmark className="h-4 w-4 text-primary" />
                              <p className="font-medium">Manual bank transfer</p>
                            </div>
                            <div className="mt-3 space-y-1 text-sm">
                              <p><span className="text-muted-foreground">Bank:</span> {paymentState.bankName || "Not configured"}</p>
                              <p><span className="text-muted-foreground">Account name:</span> {paymentState.accountName || "Not configured"}</p>
                              <p><span className="text-muted-foreground">Account number:</span> <strong>{paymentState.accountNumber || "Not configured"}</strong></p>
                            </div>
                            {paymentState.manualInstructions && (
                              <p className="mt-3 text-sm text-muted-foreground">{paymentState.manualInstructions}</p>
                            )}
                            <div className="mt-4 space-y-3">
                              <Input
                                value={manualReference}
                                onChange={(event) => setManualReference(event.target.value)}
                                placeholder="Transfer reference / payment note"
                              />

                              <div className="rounded-xl border bg-muted/15 p-3">
                                <Label htmlFor="manual-payment-proof" className="font-medium">
                                  Upload payment proof
                                </Label>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Choose a screenshot from your gallery or take a clear photo. JPG, PNG or WebP, up to 8 MB.
                                </p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <Label htmlFor="manual-payment-proof-gallery" className="text-xs text-muted-foreground">
                                      Choose from gallery
                                    </Label>
                                    <Input
                                      id="manual-payment-proof-gallery"
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      className="mt-1 h-auto py-2"
                                      onChange={(event) => void chooseManualProof(event.target.files?.[0] ?? null)}
                                      disabled={paymentLoading || proofChecking}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="manual-payment-proof-camera" className="text-xs text-muted-foreground">
                                      Take a photo
                                    </Label>
                                    <Input
                                      id="manual-payment-proof-camera"
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      className="mt-1 h-auto py-2"
                                      onChange={(event) => void chooseManualProof(event.target.files?.[0] ?? null)}
                                      disabled={paymentLoading || proofChecking}
                                    />
                                  </div>
                                </div>
                                {proofChecking && (
                                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Checking whether the image is readable…
                                  </p>
                                )}
                                {proofQuality && (
                                  <p className={`mt-2 text-xs ${proofQuality.ok ? "text-primary" : "text-destructive"}`}>
                                    {proofQuality.message}
                                  </p>
                                )}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => void submitManualPayment()}
                                disabled={paymentLoading || proofChecking || !manualProof}
                              >
                                {paymentLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit payment proof
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {paymentState.paymentStatus === "pending" && (
                        <div className="mt-4 rounded-xl bg-muted/30 p-4 text-sm">
                          <p className="font-medium">Payment awaiting confirmation</p>
                          <p className="mt-1 text-muted-foreground">
                            {paymentState.paymentMethod === "manual"
                              ? "An admin must verify your transfer before WhatsApp access is released."
                              : "Your Paystack payment is still processing."}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => sessionToken && void loadPaymentState(sessionToken)}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh status
                          </Button>
                        </div>
                      )}

                      {paymentState.paymentStatus === "rejected" && (
                        <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                          <p className="font-medium">Payment proof needs attention</p>
                          <p className="mt-1">
                            {paymentState.rejectionReason || "The submitted payment could not be verified. Please upload another clear proof or choose another payment method."}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {paymentError && (
                    <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {paymentError}
                    </p>
                  )}
                </div>
              )}

              {ownReferralCode && paymentState?.paymentStatus !== "paid" && (
                <div className="mx-auto mt-7 max-w-xl rounded-2xl border bg-muted/20 p-5 text-center">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Share2 className="h-5 w-5" />
                    <p className="font-semibold">Your referral code</p>
                  </div>
                  <p className="mt-3 font-mono text-2xl font-bold tracking-wider">{ownReferralCode}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Share this code or your referral link. A referral counts toward the campaign leaderboard only after that participant completes the program and receives a certificate.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 gap-2"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `${window.location.origin}/r/${encodeURIComponent(ownReferralCode.replace(/^DYPGL-/i, ""))}`,
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                    Copy referral link
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <form
            onSubmit={(event) => {
              if (currentStep < lastStepIndex) {
                event.preventDefault();
                nextStep();
                return;
              }
              void submit(event);
            }}
          >
            <header className="brand-wash rounded-t-lg px-5 py-8 text-primary-foreground sm:px-9">
              <h1 className="text-3xl font-bold sm:text-4xl">{form.title}</h1>
              <p className="mt-3 max-w-2xl text-primary-foreground/85">{form.description}</p>
            </header>

            <Card className="rounded-t-none border-t-0">
              <CardContent className="p-5 sm:p-9">
                <div className="mb-8">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-primary">
                      Step {Math.min(currentStep + 1, wizardSteps.length)} of {wizardSteps.length}
                    </span>
                    <span className="text-muted-foreground">{activeStep?.title}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: `${wizardSteps.length ? ((currentStep + 1) / wizardSteps.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-4 hidden gap-2 sm:grid" style={{ gridTemplateColumns: `repeat(${wizardSteps.length}, minmax(0, 1fr))` }}>
                    {wizardSteps.map((step, index) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => {
                          if (index <= currentStep) goToStep(index);
                        }}
                        className={
                          "rounded-lg px-2 py-2 text-left text-xs transition-colors " +
                          (index === currentStep
                            ? "bg-primary/10 font-semibold text-primary"
                            : index < currentStep
                              ? "text-foreground hover:bg-muted"
                              : "cursor-default text-muted-foreground/60")
                        }
                      >
                        {index + 1}. {step.title}
                      </button>
                    ))}
                  </div>
                </div>

                <section className="min-h-[360px]">
                  <div className="mb-7">
                    <h2 className="text-2xl font-semibold text-foreground">{activeStep?.title}</h2>
                    {activeStep?.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{activeStep.description}</p>
                    )}
                  </div>

                  {activeStep?.includesReferral && (
                    <div className="mb-7">{renderReferralLookup()}</div>
                  )}

                  {activeStep?.review ? (
                    <div className="space-y-5">
                      <div className="rounded-xl border bg-muted/15 p-4">
                        <h3 className="font-semibold">Your responses</h3>
                        <div className="mt-4 divide-y">
                          {reviewFields.map((field) => (
                            <div key={field.id} className="py-3 first:pt-0 last:pb-0">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {field.label}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm font-medium">
                                {answerLabel(field)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border bg-muted/15 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Referrer
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {selectedReferralCode
                            ? `${selectedReferrerName || "Referral code"} · ${selectedReferralCode}`
                            : "No referrer selected"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {activeStep?.id === "sponsorship-details" && sponsorship?.questions ? (
                        <>
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <p className="font-semibold">{sponsorship.sponsorName} sponsored registration</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Your seat is being requested under {sponsorship.name}. Admin will verify the sponsorship after registration.
                            </p>
                          </div>
                          {sponsorship.questions.map((question) => (
                            <div key={question.id} className="space-y-2">
                              <Label className="text-base">
                                {question.label}
                                {question.required && <span className="ml-1 text-destructive">*</span>}
                              </Label>
                              {question.helperText && <p className="text-sm text-muted-foreground">{question.helperText}</p>}
                              {renderSponsorshipQuestion(question)}
                            </div>
                          ))}
                        </>
                      ) : (
                        activeStep?.fields.map(renderWizardField)
                      )}
                    </div>
                  )}
                </section>

                {error && (
                  <p role="alert" className="mt-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 sm:min-w-28"
                    disabled={currentStep === 0 || submitting}
                    onClick={() => goToStep(currentStep - 1)}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>

                  {currentStep < lastStepIndex ? (
                    <Button
                      type="button"
                      className="min-h-11 sm:min-w-32"
                      onClick={nextStep}
                    >
                      Next
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="lg"
                      className="min-h-12 sm:min-w-44"
                      disabled={submitting}
                    >
                      {submitting ? "Submitting…" : "Submit registration"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </form>
        )}
        {form.slug === "goals-masterclass-2026" && <div className="mt-10"><FeaturedTestimonials placement="registration" limit={2} /></div>}
      </div>
    </main>
  );
}
