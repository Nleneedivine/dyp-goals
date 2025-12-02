import { MessageCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ViewToggleProps {
  isChat: boolean;
  onToggle: () => void;
}

const ViewToggle = ({ isChat, onToggle }: ViewToggleProps) => {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onToggle}
            size="lg"
            className="h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all duration-300 hover:scale-105"
          >
            {isChat ? (
              <Target className="h-6 w-6 text-primary-foreground" />
            ) : (
              <MessageCircle className="h-6 w-6 text-primary-foreground" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-card text-card-foreground border-border">
          <p>{isChat ? "Switch to Goals" : "Switch to Chat"}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default ViewToggle;