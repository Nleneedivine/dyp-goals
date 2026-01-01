import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EditSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionType: 'yearly' | 'monthly' | 'weekly' | 'daily';
  currentData: any;
  planId: string;
  goal: string;
  onUpdate: (sectionType: string, newData: any) => void;
}

export const EditSectionModal = ({
  isOpen,
  onClose,
  sectionType,
  currentData,
  planId,
  goal,
  onUpdate,
}: EditSectionModalProps) => {
  const [feedback, setFeedback] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  const sectionLabels = {
    yearly: "Yearly Plan",
    monthly: "Monthly Plan",
    weekly: "Weekly Plan",
    daily: "Daily Plan",
  };

  const handleRegenerate = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Please provide feedback",
        description: "Describe what changes you'd like to make.",
        variant: "destructive",
      });
      return;
    }

    setIsRegenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-time-plan', {
        body: {
          regenerateSection: {
            sectionType,
            currentData,
            feedback,
            goal,
          }
        }
      });

      if (error) throw error;

      if (data?.sectionData) {
        // Update the database
        const updateField = `${sectionType}_plan`;
        await supabase
          .from('time_plans')
          .update({ [updateField]: data.sectionData })
          .eq('id', planId);

        onUpdate(sectionType, data.sectionData);
        
        toast({
          title: "Section Updated!",
          description: `Your ${sectionLabels[sectionType]} has been regenerated.`,
        });

        setFeedback("");
        onClose();
      }
    } catch (error: any) {
      console.error('Error regenerating section:', error);
      toast({
        title: "Regeneration Failed",
        description: error.message || "Unable to regenerate section. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Edit {sectionLabels[sectionType]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="feedback">What would you like to change?</Label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={`e.g., "Make the ${sectionType} schedule more relaxed", "Add more study blocks", "Reduce weekend activities"...`}
              className="mt-2 min-h-[120px] bg-background border-border"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Provide specific feedback about what you'd like to change in your {sectionLabels[sectionType].toLowerCase()}.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="font-medium text-foreground mb-1">Tips for good feedback:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Be specific about what needs changing</li>
              <li>Mention time preferences if relevant</li>
              <li>Include any new constraints or activities</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRegenerating}>
            Cancel
          </Button>
          <Button
            onClick={handleRegenerate}
            disabled={isRegenerating || !feedback.trim()}
            className="gap-2 bg-gradient-to-r from-primary to-secondary"
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Regenerate Section
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
