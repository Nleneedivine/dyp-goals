export type GuideContext = {
  hasCurrentEnrollment: boolean;
  hasVision: boolean;
  goalCount: number;
  planCount: number;
  todayTaskCount: number;
  reviewCount: number;
  hasAccountabilityGroup: boolean;
  paymentStatus: string;
  whatsappAvailable: boolean;
  referralAvailable: boolean;
};

export type TourTargetId =
  | "journey-progress"
  | "program-access"
  | "vision"
  | "my-goals"
  | "planner"
  | "today"
  | "progress"
  | "accountability";

export type TourStep = {
  id: string;
  target: TourTargetId;
  route: string;
  title: string;
  description: string | ((context: GuideContext) => string);
};

export type TourDefinition = {
  key: string;
  title: string;
  intro: string;
  steps: TourStep[];
};

export const TOUR_TARGETS: Record<
  TourTargetId,
  { route: string; selector: string; label: string }
> = {
  "journey-progress": {
    route: "/journey",
    selector: '[data-tour="journey-progress"]',
    label: "Journey progress",
  },
  "program-access": {
    route: "/profile",
    selector: '[data-tour="program-access"]',
    label: "Program access",
  },
  vision: {
    route: "/vision",
    selector: '[data-tour="vision-page"]',
    label: "Vision",
  },
  "my-goals": {
    route: "/my-goals",
    selector: '[data-tour="my-goals-page"]',
    label: "My GOALS",
  },
  planner: {
    route: "/plan",
    selector: '[data-tour="planner-page"]',
    label: "Plan",
  },
  today: {
    route: "/todo",
    selector: '[data-tour="planner-page"]',
    label: "Today",
  },
  progress: {
    route: "/progress",
    selector: '[data-tour="progress-page"]',
    label: "Progress",
  },
  accountability: {
    route: "/journey",
    selector: '[data-tour="accountability-lab"]',
    label: "Accountability Lab",
  },
};

export const MAIN_TOUR: TourDefinition = {
  key: "platform-intro-v1",
  title: "Welcome to your GOALS journey",
  intro:
    "A quick interactive tour will show you where everything lives. You can skip it now and restart it anytime from the GOALS Guide.",
  steps: [
    {
      id: "journey",
      target: "journey-progress",
      route: "/journey",
      title: "Your Journey tells you what comes next",
      description:
        "You do not need to remember every feature. Journey checks what you have completed and points you to the next useful step.",
    },
    {
      id: "access",
      target: "program-access",
      route: "/profile",
      title: "Your program access stays in your profile",
      description: (context) =>
        context.paymentStatus === "paid"
          ? "Your WhatsApp access, referral link, earnings and program information stay here after registration."
          : "Your program information and referral tools live here. WhatsApp access appears here automatically once payment is confirmed.",
    },
    {
      id: "vision",
      target: "vision",
      route: "/vision",
      title: "Start with direction",
      description: (context) =>
        context.hasVision
          ? "You already have a saved vision. Return here whenever your direction or season changes."
          : "Use Vision to clarify the direction behind the goals you are about to build.",
    },
    {
      id: "goals",
      target: "my-goals",
      route: "/my-goals",
      title: "Turn direction into clear goals",
      description: (context) =>
        context.goalCount > 0
          ? `You already have ${context.goalCount} current goal${context.goalCount === 1 ? "" : "s"} here. This is the home of your goal portfolio.`
          : "Create and refine your goals here. The AI Coach helps you make them specific, measurable and executable.",
    },
    {
      id: "plan",
      target: "planner",
      route: "/plan",
      title: "Turn goals into execution",
      description: (context) =>
        context.planCount > 0
          ? "Your saved tasks and weekly actions live here. Keep translating goals into work you can actually schedule."
          : "Planning converts your goals into weekly actions and daily tasks so they do not remain ideas.",
    },
    {
      id: "today",
      target: "today",
      route: "/todo",
      title: "Today keeps execution simple",
      description: (context) =>
        context.todayTaskCount > 0
          ? `You have ${context.todayTaskCount} task${context.todayTaskCount === 1 ? "" : "s"} scheduled for today. Focus on execution here.`
          : "Today filters the bigger plan down to the actions that need your attention now.",
    },
    {
      id: "progress",
      target: "progress",
      route: "/progress",
      title: "Review what is actually working",
      description:
        "Progress helps you compare plans with execution, review your weeks and adjust instead of blindly repeating the same plan.",
    },
    {
      id: "accountability",
      target: "accountability",
      route: "/journey",
      title: "You do not have to execute alone",
      description: (context) =>
        context.hasAccountabilityGroup
          ? "Your Accountability Lab group is already connected to this GOALS cohort."
          : "Once your goals are ready, Accountability Lab can place you with a small group for regular human check-ins.",
    },
  ],
};

export const MICRO_TOURS: Record<string, TourDefinition> = {
  vision: {
    key: "micro-vision-v1",
    title: "Clarify your direction",
    intro: "One quick step will show you where to set the direction behind your goals.",
    steps: [MAIN_TOUR.steps[2]],
  },
  goals: {
    key: "micro-goals-v1",
    title: "Create your first goal",
    intro: "Your next useful step is to turn direction into a concrete goal.",
    steps: [MAIN_TOUR.steps[3]],
  },
  plan: {
    key: "micro-plan-v1",
    title: "Build your first execution plan",
    intro: "Your goals exist. Now connect them to weekly and daily action.",
    steps: [MAIN_TOUR.steps[4], MAIN_TOUR.steps[5]],
  },
  accountability: {
    key: "micro-accountability-v1",
    title: "Add human accountability",
    intro: "Your goal system is ready for support from other people.",
    steps: [MAIN_TOUR.steps[7]],
  },
  progress: {
    key: "micro-progress-v1",
    title: "Close the execution loop",
    intro: "Review what happened so your next plan can improve.",
    steps: [MAIN_TOUR.steps[6]],
  },
};

export function chooseMicroTour(context: GuideContext): TourDefinition | null {
  if (!context.hasVision) return MICRO_TOURS.vision;
  if (context.goalCount === 0) return MICRO_TOURS.goals;
  if (context.planCount === 0) return MICRO_TOURS.plan;
  if (!context.hasAccountabilityGroup) return MICRO_TOURS.accountability;
  if (context.reviewCount === 0) return MICRO_TOURS.progress;
  return null;
}

export function fallbackGuideAnswer(
  question: string,
  context: GuideContext,
): { answer: string; target: TourTargetId; route: string; ctaLabel: string } {
  const q = question.toLowerCase();

  if (q.includes("referr") || q.includes("earning") || q.includes("whatsapp") || q.includes("payment")) {
    return {
      answer: "Your program access, WhatsApp link, referral link and referral earnings are together in Program Access inside your Profile.",
      target: "program-access",
      route: "/profile",
      ctaLabel: "Show me",
    };
  }
  if (q.includes("vision") || q.includes("direction")) {
    return {
      answer: "Vision is where you clarify the direction behind your goals before turning it into an execution plan.",
      target: "vision",
      route: "/vision",
      ctaLabel: "Show me Vision",
    };
  }
  if (q.includes("goal")) {
    return {
      answer: "My GOALS is the home of your current goal portfolio and AI-assisted goal refinement.",
      target: "my-goals",
      route: "/my-goals",
      ctaLabel: "Show me My GOALS",
    };
  }
  if (q.includes("today") || q.includes("task")) {
    return {
      answer: "Today narrows your larger plan down to the tasks that need your attention now.",
      target: "today",
      route: "/todo",
      ctaLabel: "Show me Today",
    };
  }
  if (q.includes("plan") || q.includes("week")) {
    return {
      answer: "Plan is where your goals become weekly actions, scheduled tasks and a realistic execution system.",
      target: "planner",
      route: "/plan",
      ctaLabel: "Show me Plan",
    };
  }
  if (q.includes("progress") || q.includes("review")) {
    return {
      answer: "Progress is where you review execution, notice patterns and improve the next planning cycle.",
      target: "progress",
      route: "/progress",
      ctaLabel: "Show me Progress",
    };
  }
  if (q.includes("account") || q.includes("group") || q.includes("mentor")) {
    return {
      answer: "Accountability Lab connects your current GOALS cohort to a small human accountability group. Mentorship remains optional deeper support.",
      target: "accountability",
      route: "/journey",
      ctaLabel: "Show me Accountability",
    };
  }

  const micro = chooseMicroTour(context);
  const target = micro?.steps[0]?.target ?? "journey-progress";
  const route = TOUR_TARGETS[target].route;
  return {
    answer: micro
      ? `Based on your current GOALS journey, the most useful next area is ${TOUR_TARGETS[target].label}.`
      : "Your Journey page is the best place to see what the system recommends next.",
    target,
    route,
    ctaLabel: "Show me",
  };
}
