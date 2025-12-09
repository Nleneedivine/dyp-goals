import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ArrowRight, Clock, Target, Calendar, ListChecks, AlertCircle, Sun, Moon } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface QuestionnaireData {
  specificOutcomes: string;
  deadline: string;
  milestones: string;
  hoursPerWeek: number;
  dailyWeeklyActivities: string;
  constraints: string;
  wakeTime: string;
  sleepTime: string;
  weekendPreference: 'light' | 'same' | 'intense';
}

interface QuestionnaireStepProps {
  goal: string;
  currentStep: number;
  data: QuestionnaireData;
  onDataChange: (data: Partial<QuestionnaireData>) => void;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

const questions = [
  {
    key: 'specificOutcomes',
    title: 'Specific Outcomes',
    question: 'What specific outcomes do you want to achieve?',
    description: 'Be as detailed as possible about what success looks like for you.',
    icon: Target,
    type: 'textarea',
    placeholder: 'e.g., I want to lose 20 pounds, build muscle definition, and be able to run 5km without stopping...'
  },
  {
    key: 'deadline',
    title: 'Deadline',
    question: 'What is your deadline for achieving this goal?',
    description: 'Having a clear deadline helps create urgency and structure.',
    icon: Calendar,
    type: 'date',
    placeholder: ''
  },
  {
    key: 'milestones',
    title: 'Milestones & Sub-tasks',
    question: 'List all the sub-tasks and milestones needed to achieve your goal.',
    description: 'Break down your goal into smaller, manageable pieces.',
    icon: ListChecks,
    type: 'textarea',
    placeholder: 'e.g., \n1. Join a gym\n2. Create a meal plan\n3. Start with 3 workouts per week\n4. Increase to 5 workouts by month 2...'
  },
  {
    key: 'hoursPerWeek',
    title: 'Weekly Commitment',
    question: 'How many hours per week can you commit to this goal?',
    description: 'Be realistic about your available time.',
    icon: Clock,
    type: 'number',
    placeholder: 'e.g., 10'
  },
  {
    key: 'dailyWeeklyActivities',
    title: 'Recurring Activities',
    question: 'What activities must be done daily or weekly?',
    description: 'These are non-negotiable activities that need to happen regularly.',
    icon: ListChecks,
    type: 'textarea',
    placeholder: 'e.g., Daily: 30 min exercise, meal prep\nWeekly: Review progress, plan next week...'
  },
  {
    key: 'constraints',
    title: 'Constraints',
    question: 'What constraints do you have?',
    description: 'Work, school, family obligations, curfews, etc.',
    icon: AlertCircle,
    type: 'textarea',
    placeholder: 'e.g., Work 9-5 Mon-Fri, kids activities on Saturdays, church on Sundays...'
  },
  {
    key: 'schedule',
    title: 'Sleep Schedule',
    question: 'What time do you wake up and go to sleep?',
    description: 'This helps us create realistic daily schedules.',
    icon: Sun,
    type: 'time-range',
    placeholder: ''
  },
  {
    key: 'weekendPreference',
    title: 'Weekend Preference',
    question: 'What is your weekend workload preference?',
    description: 'How intensely do you want to work on your goal during weekends?',
    icon: Calendar,
    type: 'radio',
    options: [
      { value: 'light', label: 'Light', description: 'Minimal work, mostly rest' },
      { value: 'same', label: 'Same as Weekdays', description: 'Similar effort as weekdays' },
      { value: 'intense', label: 'Intense', description: 'More work than weekdays' }
    ]
  }
];

export function QuestionnaireStep({
  goal,
  currentStep,
  data,
  onDataChange,
  onNext,
  onBack,
  onSubmit,
  isSubmitting
}: QuestionnaireStepProps) {
  const questionIndex = currentStep - 1;
  const currentQuestion = questions[questionIndex];
  const totalSteps = questions.length;
  const progress = (currentStep / totalSteps) * 100;
  const isLastStep = currentStep === totalSteps;
  
  const Icon = currentQuestion?.icon || Target;

  const getValue = () => {
    if (currentQuestion.key === 'schedule') {
      return { wake: data.wakeTime, sleep: data.sleepTime };
    }
    return data[currentQuestion.key as keyof QuestionnaireData];
  };

  const handleChange = (value: any) => {
    if (currentQuestion.key === 'schedule') {
      onDataChange(value);
    } else {
      onDataChange({ [currentQuestion.key]: value });
    }
  };

  const canProceed = () => {
    if (currentQuestion.key === 'schedule') {
      return data.wakeTime && data.sleepTime;
    }
    const value = data[currentQuestion.key as keyof QuestionnaireData];
    if (currentQuestion.type === 'number') {
      return typeof value === 'number' && value > 0;
    }
    return value && String(value).trim().length > 0;
  };

  if (!currentQuestion) return null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>Question {currentStep} of {totalSteps}</span>
          <span>{Math.round(progress)}% Complete</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Goal Reminder */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-6">
        <p className="text-sm text-muted-foreground">Your Goal:</p>
        <p className="font-medium text-foreground">{goal}</p>
      </div>

      {/* Question Card */}
      <Card className="bg-card border-border animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 rounded-lg bg-primary/20">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            {currentQuestion.title}
          </CardTitle>
          <p className="text-lg text-foreground mt-2">{currentQuestion.question}</p>
          <p className="text-sm text-muted-foreground">{currentQuestion.description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentQuestion.type === 'textarea' && (
            <Textarea
              value={getValue() as string || ''}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={currentQuestion.placeholder}
              className="min-h-[150px] bg-background border-border"
            />
          )}

          {currentQuestion.type === 'date' && (
            <Input
              type="date"
              value={getValue() as string || ''}
              onChange={(e) => handleChange(e.target.value)}
              className="bg-background border-border"
            />
          )}

          {currentQuestion.type === 'number' && (
            <div className="flex items-center gap-4">
              <Input
                type="number"
                min="1"
                max="168"
                value={getValue() as number || ''}
                onChange={(e) => handleChange(parseInt(e.target.value) || 0)}
                placeholder={currentQuestion.placeholder}
                className="w-32 bg-background border-border"
              />
              <span className="text-muted-foreground">hours per week</span>
            </div>
          )}

          {currentQuestion.type === 'time-range' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-primary" />
                  Wake Time
                </Label>
                <Input
                  type="time"
                  value={data.wakeTime || ''}
                  onChange={(e) => handleChange({ wakeTime: e.target.value })}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-secondary" />
                  Sleep Time
                </Label>
                <Input
                  type="time"
                  value={data.sleepTime || ''}
                  onChange={(e) => handleChange({ sleepTime: e.target.value })}
                  className="bg-background border-border"
                />
              </div>
            </div>
          )}

          {currentQuestion.type === 'radio' && currentQuestion.options && (
            <RadioGroup
              value={getValue() as string || ''}
              onValueChange={handleChange}
              className="space-y-3"
            >
              {currentQuestion.options.map((option) => (
                <div
                  key={option.value}
                  className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                    getValue() === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => handleChange(option.value)}
                >
                  <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                  <div>
                    <Label htmlFor={option.value} className="font-medium cursor-pointer">
                      {option.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={onBack}
              disabled={currentStep === 1}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {isLastStep ? (
              <Button
                onClick={onSubmit}
                disabled={!canProceed() || isSubmitting}
                className="gap-2 bg-gradient-to-r from-primary to-secondary"
              >
                {isSubmitting ? 'Generating Plan...' : 'Generate Time Plan'}
              </Button>
            ) : (
              <Button
                onClick={onNext}
                disabled={!canProceed()}
                className="gap-2"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
