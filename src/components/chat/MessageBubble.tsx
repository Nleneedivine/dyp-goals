import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Check, 
  CheckCheck, 
  MoreVertical, 
  Reply, 
  Forward, 
  Copy, 
  Star, 
  Trash2,
  Pencil,
  Smile
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

interface MessageBubbleProps {
  id: string;
  message: string;
  timestamp: Date;
  isOwn: boolean;
  senderName: string;
  senderInitials: string;
  isRead: boolean;
  isEdited: boolean;
  reactions: Reaction[];
  replyTo?: { senderName: string; message: string } | null;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onCopy: (message: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const MessageBubble = ({
  id,
  message,
  timestamp,
  isOwn,
  senderName,
  senderInitials,
  isRead,
  isEdited,
  reactions,
  replyTo,
  onReact,
  onReply,
  onDelete,
  onCopy
}: MessageBubbleProps) => {
  const [showReactions, setShowReactions] = useState(false);

  return (
    <div className={cn("flex gap-2 group", isOwn ? "flex-row-reverse" : "flex-row")}>
      {!isOwn && (
        <Avatar className="h-8 w-8 mt-auto">
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {senderInitials}
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={cn("max-w-[70%] relative", isOwn ? "items-end" : "items-start")}>
        {/* Reply Preview */}
        {replyTo && (
          <div className={cn(
            "text-xs p-2 rounded-t-lg border-l-2 border-primary mb-1",
            isOwn ? "bg-primary/30" : "bg-muted"
          )}>
            <span className="font-medium text-primary">{replyTo.senderName}</span>
            <p className="text-muted-foreground truncate">{replyTo.message}</p>
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            "px-3 py-2 rounded-2xl relative",
            isOwn 
              ? "bg-primary text-primary-foreground rounded-br-md" 
              : "bg-muted text-foreground rounded-bl-md"
          )}
        >
          {!isOwn && (
            <p className="text-xs font-medium text-primary mb-1">{senderName}</p>
          )}
          <p className="text-sm whitespace-pre-wrap break-words">{message}</p>
          <div className={cn(
            "flex items-center gap-1 mt-1",
            isOwn ? "justify-end" : "justify-start"
          )}>
            {isEdited && (
              <span className="text-[10px] opacity-70">edited</span>
            )}
            <span className="text-[10px] opacity-70">
              {format(timestamp, 'HH:mm')}
            </span>
            {isOwn && (
              isRead ? (
                <CheckCheck className="h-3 w-3 text-blue-400" />
              ) : (
                <Check className="h-3 w-3 opacity-70" />
              )
            )}
          </div>
        </div>

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className={cn(
            "flex flex-wrap gap-1 mt-1",
            isOwn ? "justify-end" : "justify-start"
          )}>
            {reactions.map((reaction, idx) => (
              <button
                key={idx}
                onClick={() => onReact(id, reaction.emoji)}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1",
                  reaction.userReacted 
                    ? "bg-primary/20 border border-primary" 
                    : "bg-muted border border-border"
                )}
              >
                <span>{reaction.emoji}</span>
                {reaction.count > 1 && <span>{reaction.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Quick Reaction Bar */}
        {showReactions && (
          <div className={cn(
            "absolute bottom-full mb-2 bg-card border border-border rounded-full p-1 flex gap-1 shadow-lg z-10",
            isOwn ? "right-0" : "left-0"
          )}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(id, emoji);
                  setShowReactions(false);
                }}
                className="hover:scale-125 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Actions Menu */}
        <div className={cn(
          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity",
          isOwn ? "left-0 -translate-x-full pr-2" : "right-0 translate-x-full pl-2"
        )}>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => setShowReactions(!showReactions)}
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => onReply(id)}
            >
              <Reply className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOwn ? "end" : "start"}>
                <DropdownMenuItem onClick={() => onReply(id)}>
                  <Reply className="h-4 w-4 mr-2" /> Reply
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopy(message)}>
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Forward className="h-4 w-4 mr-2" /> Forward
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Star className="h-4 w-4 mr-2" /> Star
                </DropdownMenuItem>
                {isOwn && (
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => onDelete(id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
