import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import MessageBubble from "./MessageBubble";
import { 
  Send, 
  Smile, 
  Paperclip, 
  Mic, 
  Phone, 
  Video, 
  Search, 
  MoreVertical,
  X,
  Image as ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
  is_edited: boolean;
  reply_to_id: string | null;
  media_url: string | null;
  media_type: string | null;
  group_id: string | null;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
}

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

interface ChatWindowProps {
  currentUserId: string;
  chatId: string | null;
  chatType: 'group' | 'global';
}

const ChatWindow = ({ currentUserId, chatId, chatType }: ChatWindowProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [newMessage, setNewMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const QUICK_EMOJIS = ['😊', '😂', '❤️', '👍', '🎯', '🔥', '💪', '🙌', '✨', '🚀'];

  useEffect(() => {
    if (!chatId) return;
    fetchMessages();
    const channel = setupRealtimeSubscription();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (chatType === 'global') {
        query = query.is('group_id', null);
      } else {
        query = query.eq('group_id', chatId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setMessages(data || []);

      // Fetch profiles
      const userIds = [...new Set(data?.map(m => m.user_id) || [])];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);

        if (profileData) {
          const profileMap: Record<string, Profile> = {};
          profileData.forEach(p => { profileMap[p.id] = p; });
          setProfiles(profileMap);
        }
      }

      // Fetch reactions
      if (data && data.length > 0) {
        const messageIds = data.map(m => m.id);
        const { data: reactionData } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds);

        if (reactionData) {
          const reactionMap: Record<string, Reaction[]> = {};
          reactionData.forEach(r => {
            if (!reactionMap[r.message_id]) {
              reactionMap[r.message_id] = [];
            }
            const existing = reactionMap[r.message_id].find(x => x.emoji === r.emoji);
            if (existing) {
              existing.count++;
              if (r.user_id === currentUserId) existing.userReacted = true;
            } else {
              reactionMap[r.message_id].push({
                emoji: r.emoji,
                count: 1,
                userReacted: r.user_id === currentUserId
              });
            }
          });
          setReactions(reactionMap);
        }
      }

      // Mark messages as read
      const unreadIds = data?.filter(m => m.user_id !== currentUserId && !m.read_at).map(m => m.id) || [];
      if (unreadIds.length > 0) {
        await supabase
          .from('chat_messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    return supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;
            if ((chatType === 'global' && !newMsg.group_id) || newMsg.group_id === chatId) {
              setMessages(prev => [...prev, newMsg]);
              
              // Fetch profile if needed
              if (!profiles[newMsg.user_id]) {
                const { data } = await supabase
                  .from('profiles')
                  .select('id, first_name, last_name')
                  .eq('id', newMsg.user_id)
                  .single();
                if (data) {
                  setProfiles(prev => ({ ...prev, [data.id]: data }));
                }
              }

              // Mark as read if from someone else
              if (newMsg.user_id !== currentUserId) {
                await supabase
                  .from('chat_messages')
                  .update({ read_at: new Date().toISOString() })
                  .eq('id', newMsg.id);
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m));
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => {
          // Refetch reactions on any change
          fetchMessages();
        }
      )
      .subscribe();
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const messageData: any = {
        user_id: currentUserId,
        message: newMessage.trim(),
      };

      if (replyingTo) {
        messageData.reply_to_id = replyingTo.id;
      }

      if (chatType !== 'global' && chatId) {
        messageData.group_id = chatId;
      }

      const { error } = await supabase
        .from('chat_messages')
        .insert(messageData);

      if (error) throw error;

      setNewMessage("");
      setReplyingTo(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    try {
      const existingReaction = reactions[messageId]?.find(r => r.emoji === emoji && r.userReacted);
      
      if (existingReaction) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', currentUserId)
          .eq('emoji', emoji);
      } else {
        await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: currentUserId, emoji });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleReply = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg) setReplyingTo(msg);
  };

  const handleDelete = async (messageId: string) => {
    try {
      await supabase
        .from('chat_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId);
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({ title: "Message deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCopy = (message: string) => {
    navigator.clipboard.writeText(message);
    toast({ title: "Copied to clipboard" });
  };

  const getReplyContent = (replyToId: string | null) => {
    if (!replyToId) return null;
    const replyMsg = messages.find(m => m.id === replyToId);
    if (!replyMsg) return null;
    const profile = profiles[replyMsg.user_id];
    return {
      senderName: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown',
      message: replyMsg.message
    };
  };

  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <MessageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Chat Header */}
      <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/20 text-primary">GC</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-foreground">Goals Chat</h2>
            <p className="text-xs text-muted-foreground">
              {messages.length} messages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Encryption Notice */}
          <div className="text-center py-2">
            <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
              🔒 Messages are end-to-end encrypted
            </span>
          </div>

          {messages.map((msg) => {
            const profile = profiles[msg.user_id];
            const isOwn = msg.user_id === currentUserId;
            const senderName = profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown';
            const initials = profile 
              ? `${profile.first_name[0]}${profile.last_name[0]}`
              : '??';

            return (
              <MessageBubble
                key={msg.id}
                id={msg.id}
                message={msg.message}
                timestamp={new Date(msg.created_at)}
                isOwn={isOwn}
                senderName={senderName}
                senderInitials={initials}
                isRead={!!msg.read_at}
                isEdited={msg.is_edited || false}
                reactions={reactions[msg.id] || []}
                replyTo={getReplyContent(msg.reply_to_id)}
                onReact={handleReact}
                onReply={handleReply}
                onDelete={handleDelete}
                onCopy={handleCopy}
              />
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Reply Preview */}
      {replyingTo && (
        <div className="px-4 py-2 bg-muted/50 border-t border-border flex items-center gap-2">
          <div className="flex-1 border-l-2 border-primary pl-2">
            <p className="text-xs text-primary font-medium">
              Replying to {profiles[replyingTo.user_id]?.first_name || 'Unknown'}
            </p>
            <p className="text-sm text-muted-foreground truncate">{replyingTo.message}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setReplyingTo(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Quick Emoji Panel */}
      {showEmojiPicker && (
        <div className="px-4 py-2 bg-card border-t border-border">
          <div className="flex gap-2 flex-wrap">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setNewMessage(prev => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                className="text-2xl hover:scale-125 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder="Type a message"
            className="flex-1 bg-muted/50"
          />
          {newMessage.trim() ? (
            <Button size="icon" onClick={handleSendMessage}>
              <Send className="h-5 w-5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon">
              <Mic className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const MessageIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default ChatWindow;
