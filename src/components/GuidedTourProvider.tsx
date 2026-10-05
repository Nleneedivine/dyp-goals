import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Compass,
  HelpCircle,
  Loader2,
  Map,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  MAIN_TOUR,
  MICRO_TOURS,
  TOUR_TARGETS,
  chooseMicroTour,
  fallbackGuideAnswer,
  type GuideContext,
  type TourDefinition,
  type TourStep,
  type TourTargetId,
} from "@/lib/tourRegistry";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type GuideReply = {
  answer: string;
  target?: TourTargetId;
  route?: string;
  ctaLabel?: string;
};

type TourContextValue = {
  startMainTour: () => void;
  startTour: (tour: TourDefinition) => void;
  showTarget: (target: TourTargetId, message?: string) => void;
  openGuide: () => void;
  context: GuideContext | null;
};

const TourContext = createContext<TourContextValue | null>(null);

const PARTICIPANT_ROUTES = [
  "/journey",
  "/vision",
  "/my-goals",
  "/ai-goals",
  "/plan",
  "/todo",
  "/progress",
  "/mentorship",
  "/profile",
  "/goal-history",
  "/accountability/chat",
];

const EMPTY_CONTEXT: GuideContext = {
  hasCurrentEnrollment: false,
  hasVision: false,
  goalCount: 0,
  planCount: 0,
  todayTaskCount: 0,
  reviewCount: 0,
  hasAccountabilityGroup: false,
  paymentStatus: "unknown",
  whatsappAvailable: false,
  referralAvailable: false,
};

function isParticipantRoute(pathname: string) {
  return PARTICIPANT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

export function useGuidedTour() {
  const value = useContext(TourContext);
  if (!value) throw new Error("useGuidedTour must be used inside GuidedTourProvider");
  return value;
}

export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [userId, setUserId] = useState<string | null>(null);
  const [guideContext, setGuideContext] = useState<GuideContext | null>(null);
  const [tour, setTour] = useState<TourDefinition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [targetReady, setTargetReady] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideQuestion, setGuideQuestion] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideReply, setGuideReply] = useState<GuideReply | null>(null);
  const [oneOffStep, setOneOffStep] = useState<TourStep | null>(null);
  const [microSuggestionDismissed, setMicroSuggestionDismissed] = useState(false);
  const highlightedElement = useRef<HTMLElement | null>(null);
  const previousInlineStyle = useRef<{
    transform: string;
    position: string;
    zIndex: string;
    transition: string;
    transformOrigin: string;
  } | null>(null);

  const activeStep = oneOffStep ?? tour?.steps[stepIndex] ?? null;
  const context = guideContext ?? EMPTY_CONTEXT;
  const participantRoute = isParticipantRoute(location.pathname);

  const clearHighlight = useCallback(() => {
    const element = highlightedElement.current;
    const previous = previousInlineStyle.current;
    if (element && previous) {
      element.style.transform = previous.transform;
      element.style.position = previous.position;
      element.style.zIndex = previous.zIndex;
      element.style.transition = previous.transition;
      element.style.transformOrigin = previous.transformOrigin;
    }
    highlightedElement.current = null;
    previousInlineStyle.current = null;
    setRect(null);
    setTargetReady(false);
  }, []);

  const updateRect = useCallback((element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    const padding = window.innerWidth < 640 ? 8 : 12;
    setRect({
      top: Math.max(8, box.top - padding),
      left: Math.max(8, box.left - padding),
      width: Math.min(window.innerWidth - 16, box.width + padding * 2),
      height: Math.min(window.innerHeight - 16, box.height + padding * 2),
    });
  }, []);

  const highlightTarget = useCallback(
    async (step: TourStep) => {
      clearHighlight();

      const target = TOUR_TARGETS[step.target];
      if (location.pathname !== step.route) {
        navigate(step.route);
      }

      let attempts = 0;
      const maxAttempts = 40;

      const find = async (): Promise<void> => {
        const element = document.querySelector(target.selector) as HTMLElement | null;
        if (!element) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            setTargetReady(true);
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          return find();
        }

        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        await new Promise((resolve) => window.setTimeout(resolve, 360));

        previousInlineStyle.current = {
          transform: element.style.transform,
          position: element.style.position,
          zIndex: element.style.zIndex,
          transition: element.style.transition,
          transformOrigin: element.style.transformOrigin,
        };
        highlightedElement.current = element;

        element.style.position = element.style.position || "relative";
        element.style.zIndex = "10002";
        element.style.transition = "transform 220ms ease, box-shadow 220ms ease";
        element.style.transformOrigin = "center";
        element.style.transform =
          window.innerWidth < 640 ? "scale(1.015)" : "scale(1.035)";

        updateRect(element);
        setTargetReady(true);
      };

      await find();
    },
    [clearHighlight, location.pathname, navigate, updateRect],
  );

  useEffect(() => {
    const handleResize = () => {
      if (highlightedElement.current) updateRect(highlightedElement.current);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [updateRect]);

  useEffect(() => {
    if (!activeStep) {
      clearHighlight();
      return;
    }
    void highlightTarget(activeStep);
  }, [activeStep?.id, activeStep?.route, activeStep?.target, highlightTarget, clearHighlight]);

  const loadContext = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const id = session?.user?.id ?? null;
    setUserId(id);
    if (!id) {
      setGuideContext(null);
      return;
    }

    const { data, error } = await supabase.rpc("get_goals_guide_context");
    if (!error && data) {
      setGuideContext(data as unknown as GuideContext);
    }
  }, []);

  useEffect(() => {
    void loadContext();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      if (session?.user) {
        window.setTimeout(() => void loadContext(), 0);
      } else {
        setGuideContext(null);
        setWelcomeOpen(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadContext]);

  useEffect(() => {
    if (!userId || !participantRoute || tour || oneOffStep) return;

    const checkFirstTour = async () => {
      const { data } = await supabase
        .from("user_tour_state")
        .select("completed_at,dismissed_at,auto_disabled")
        .eq("user_id", userId)
        .eq("tour_key", MAIN_TOUR.key)
        .maybeSingle();

      if (!data?.completed_at && !data?.auto_disabled && !data?.dismissed_at) {
        setWelcomeOpen(true);
      }
    };

    void checkFirstTour();
  }, [userId, participantRoute, tour, oneOffStep]);

  const persistTourState = useCallback(
    async (
      tourKey: string,
      patch: {
        last_step?: number;
        completed_at?: string | null;
        dismissed_at?: string | null;
        auto_disabled?: boolean;
      },
    ) => {
      if (!userId) return;
      await supabase.from("user_tour_state").upsert({
        user_id: userId,
        tour_key: tourKey,
        last_step: patch.last_step ?? 0,
        completed_at: patch.completed_at ?? null,
        dismissed_at: patch.dismissed_at ?? null,
        auto_disabled: patch.auto_disabled ?? false,
        updated_at: new Date().toISOString(),
      });
    },
    [userId],
  );

  const startTour = useCallback(
    (nextTour: TourDefinition) => {
      setWelcomeOpen(false);
      setGuideOpen(false);
      setGuideReply(null);
      setOneOffStep(null);
      setTour(nextTour);
      setStepIndex(0);
      setMicroSuggestionDismissed(true);
      void persistTourState(nextTour.key, {
        last_step: 0,
        dismissed_at: null,
      });
    },
    [persistTourState],
  );

  const startMainTour = useCallback(() => startTour(MAIN_TOUR), [startTour]);

  const finishTour = useCallback(async () => {
    if (tour) {
      await persistTourState(tour.key, {
        last_step: tour.steps.length - 1,
        completed_at: new Date().toISOString(),
        dismissed_at: null,
      });
    }
    setTour(null);
    setStepIndex(0);
    clearHighlight();
    void loadContext();
  }, [tour, persistTourState, clearHighlight, loadContext]);

  const skipTour = useCallback(async () => {
    if (tour) {
      await persistTourState(tour.key, {
        last_step: stepIndex,
        dismissed_at: new Date().toISOString(),
      });
    }
    setTour(null);
    setOneOffStep(null);
    clearHighlight();
  }, [tour, stepIndex, persistTourState, clearHighlight]);

  const next = useCallback(() => {
    if (!tour) {
      setOneOffStep(null);
      clearHighlight();
      return;
    }

    if (stepIndex >= tour.steps.length - 1) {
      void finishTour();
      return;
    }

    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    void persistTourState(tour.key, { last_step: nextIndex });
  }, [tour, stepIndex, finishTour, persistTourState, clearHighlight]);

  const previous = useCallback(() => {
    if (!tour || stepIndex === 0) return;
    const nextIndex = stepIndex - 1;
    setStepIndex(nextIndex);
    void persistTourState(tour.key, { last_step: nextIndex });
  }, [tour, stepIndex, persistTourState]);

  const showTarget = useCallback(
    (target: TourTargetId, message?: string) => {
      const registryTarget = TOUR_TARGETS[target];
      setGuideOpen(false);
      setGuideReply(null);
      setTour(null);
      setOneOffStep({
        id: `one-off-${target}-${Date.now()}`,
        target,
        route: registryTarget.route,
        title: registryTarget.label,
        description:
          message ??
          `This is ${registryTarget.label}. You can return here anytime from the GOALS platform.`,
      });
    },
    [],
  );

  const askGuide = useCallback(async () => {
    const question = guideQuestion.trim();
    if (!question) return;

    setGuideLoading(true);
    setGuideReply(null);

    const fallback = fallbackGuideAnswer(question, context);

    try {
      const { data, error } = await supabase.functions.invoke("goals-guide", {
        body: { question },
      });

      if (
        !error &&
        data &&
        typeof data.answer === "string" &&
        (!data.target || data.target in TOUR_TARGETS)
      ) {
        setGuideReply({
          answer: data.answer,
          target: data.target as TourTargetId | undefined,
          route: data.route,
          ctaLabel: data.ctaLabel ?? "Show me",
        });
      } else {
        setGuideReply(fallback);
      }
    } catch {
      setGuideReply(fallback);
    } finally {
      setGuideLoading(false);
    }
  }, [guideQuestion, context]);

  const dismissWelcome = useCallback(
    (disableAutomatic: boolean) => {
      setWelcomeOpen(false);
      void persistTourState(MAIN_TOUR.key, {
        dismissed_at: new Date().toISOString(),
        auto_disabled: disableAutomatic,
      });
    },
    [persistTourState],
  );

  const microTour = useMemo(
    () => (guideContext ? chooseMicroTour(guideContext) : null),
    [guideContext],
  );

  useEffect(() => {
    if (!microTour) return;
    const key = `dyp-micro-tour-dismissed:${microTour.key}`;
    setMicroSuggestionDismissed(window.sessionStorage.getItem(key) === "1");
  }, [microTour?.key]);

  const dismissMicro = () => {
    if (microTour) {
      window.sessionStorage.setItem(
        `dyp-micro-tour-dismissed:${microTour.key}`,
        "1",
      );
    }
    setMicroSuggestionDismissed(true);
  };

  const activeDescription =
    typeof activeStep?.description === "function"
      ? activeStep.description(context)
      : activeStep?.description ?? "";

  const desktopCardTop = rect
    ? rect.top + rect.height + 16 + 250 < window.innerHeight
      ? rect.top + rect.height + 16
      : Math.max(16, rect.top - 250)
    : 120;

  const value = useMemo<TourContextValue>(
    () => ({
      startMainTour,
      startTour,
      showTarget,
      openGuide: () => setGuideOpen(true),
      context: guideContext,
    }),
    [startMainTour, startTour, showTarget, guideContext],
  );

  return (
    <TourContext.Provider value={value}>
      {children}

      {participantRoute && userId && !activeStep && (
        <Button
          type="button"
          size="icon"
          onClick={() => setGuideOpen(true)}
          aria-label="Open GOALS Guide"
          className="fixed bottom-24 right-4 z-[70] h-12 w-12 rounded-full shadow-xl md:bottom-6 md:right-6"
          data-tour="goals-guide-button"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      )}

      {participantRoute &&
        userId &&
        microTour &&
        !microSuggestionDismissed &&
        !activeStep &&
        !guideOpen &&
        !welcomeOpen && (
          <div className="fixed bottom-24 left-4 right-20 z-[65] rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur md:bottom-6 md:left-6 md:right-auto md:w-[340px]">
            <button
              type="button"
              onClick={dismissMicro}
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss suggestion"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Suggested next step</p>
                <p className="mt-1 text-sm text-muted-foreground">{microTour.intro}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => startTour(microTour)}>
                Show me
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissMicro}>
                Not now
              </Button>
            </div>
          </div>
        )}

      {welcomeOpen && (
        <div className="fixed inset-0 z-[10020] grid place-items-end bg-black/50 p-3 sm:place-items-center">
          <div className="w-full max-w-md rounded-3xl border bg-background p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Map className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold">{MAIN_TOUR.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {MAIN_TOUR.intro}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissWelcome(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button size="lg" onClick={startMainTour}>
                <Sparkles className="mr-2 h-4 w-4" />
                Start quick tour
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => dismissWelcome(false)}
              >
                Maybe later
              </Button>
            </div>
            <button
              type="button"
              className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => dismissWelcome(true)}
            >
              Don’t show the tour automatically again
            </button>
          </div>
        </div>
      )}

      {activeStep && (
        <>
          {rect && (
            <div
              className="pointer-events-none fixed z-[10000] rounded-2xl border-2 border-primary shadow-[0_0_0_9999px_rgba(4,18,17,0.68),0_0_0_6px_rgba(200,243,29,0.18)] transition-all duration-300"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
            />
          )}

          <div
            className={
              "fixed z-[10010] border bg-background shadow-2xl " +
              "inset-x-2 bottom-2 rounded-[1.6rem] p-5 " +
              "sm:inset-x-auto sm:bottom-auto sm:right-5 sm:w-[390px] sm:rounded-2xl"
            }
            style={
              window.innerWidth >= 640
                ? { top: desktopCardTop }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                  {tour
                    ? `${stepIndex + 1} of ${tour.steps.length}`
                    : "GOALS Guide"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void skipTour()}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close tour"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h2 className="mt-3 text-xl font-bold">{activeStep.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {activeDescription}
            </p>

            {!targetReady && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Finding this part of the page…
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
              {tour ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={previous}
                    disabled={stepIndex === 0}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" onClick={() => void skipTour()}>
                      Skip
                    </Button>
                    <Button type="button" onClick={next}>
                      {stepIndex === tour.steps.length - 1 ? "Finish" : "Next"}
                      {stepIndex < tour.steps.length - 1 && (
                        <ArrowRight className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <Button type="button" className="ml-auto" onClick={next}>
                  Got it
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {guideOpen && !activeStep && (
        <div className="fixed inset-0 z-[10015] flex items-end justify-end bg-black/35 p-3 sm:p-5">
          <div className="w-full rounded-3xl border bg-background shadow-2xl sm:max-w-md">
            <div className="flex items-center justify-between border-b p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">GOALS Guide</p>
                  <p className="text-xs text-muted-foreground">
                    Ask where something is or what to do next.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4">
              <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                I can explain the platform and then spotlight the exact place you need.
              </div>

              {guideReply && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm leading-relaxed">{guideReply.answer}</p>
                  {guideReply.target && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        showTarget(guideReply.target!, guideReply.answer)
                      }
                    >
                      <Map className="mr-2 h-4 w-4" />
                      {guideReply.ctaLabel ?? "Show me"}
                    </Button>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                {[
                  "What should I do next?",
                  "Where are my referral earnings?",
                  "How do I plan my week?",
                  "Where is Accountability Lab?",
                ].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setGuideQuestion(question);
                      setGuideReply(null);
                    }}
                    className="rounded-xl border px-3 py-2 text-left text-xs hover:border-primary/40 hover:bg-muted/30"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={guideQuestion}
                  onChange={(event) => setGuideQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void askGuide();
                    }
                  }}
                  placeholder="Ask the GOALS Guide…"
                />
                <Button
                  type="button"
                  onClick={() => void askGuide()}
                  disabled={guideLoading || !guideQuestion.trim()}
                >
                  {guideLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={startMainTour}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Restart platform tour
                </button>
                {MICRO_TOURS && (
                  <span className="text-[0.68rem] text-muted-foreground">
                    Context-aware guidance
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </TourContext.Provider>
  );
}
