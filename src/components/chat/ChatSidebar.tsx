import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, 
  Circle, 
  Users, 
  Settings, 
  Search, 
  Plus,
  Check,
  CheckCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ChatSidebarProps {
  currentUserId: string;
  onSelectChat: (chatId: string | null, type: 'group' | 'global') => void;
  selectedChatId: string | null;
}

interface ChatPreview {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageTime: Date | null;
  unreadCount: number;
  type: 'group' | 'global';
  avatarInitials: string;
}

const ChatSidebar = ({ currentUserId, onSelectChat, selectedChatId }: ChatSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'channels' | 'settings'>('chats');

  useEffect(() => {
    // For now, we'll show a global Goals Chat
    const globalChat: ChatPreview = {
      id: 'global',
      name: 'Goals Chat',
      lastMessage: 'Tap to start chatting...',
      lastMessageTime: null,
      unreadCount: 0,
      type: 'global',
      avatarInitials: 'GC'
    };
    
    setChats([globalChat]);

    // Fetch latest message for global chat
    const fetchLatestMessage = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('message, created_at')
        .is('group_id', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setChats([{
          ...globalChat,
          lastMessage: data.message.length > 40 ? data.message.substring(0, 40) + '...' : data.message,
          lastMessageTime: new Date(data.created_at)
        }]);
      }
    };

    fetchLatestMessage();

    // Subscribe to new messages
    const channel = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as any;
          if (!msg.group_id) {
            setChats(prev => prev.map(chat => 
              chat.id === 'global' 
                ? { 
                    ...chat, 
                    lastMessage: msg.message.length > 40 ? msg.message.substring(0, 40) + '...' : msg.message,
                    lastMessageTime: new Date(msg.created_at)
                  }
                : chat
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {currentUserId.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-foreground">ding</span>
        </div>
        <Button variant="ghost" size="icon">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation Icons */}
      <div className="flex justify-around py-2 border-b border-border">
        <Button 
          variant={activeTab === 'chats' ? 'secondary' : 'ghost'} 
          size="icon"
          onClick={() => setActiveTab('chats')}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button 
          variant={activeTab === 'status' ? 'secondary' : 'ghost'} 
          size="icon"
          onClick={() => setActiveTab('status')}
        >
          <Circle className="h-5 w-5" />
        </Button>
        <Button 
          variant={activeTab === 'channels' ? 'secondary' : 'ghost'} 
          size="icon"
          onClick={() => setActiveTab('channels')}
        >
          <Users className="h-5 w-5" />
        </Button>
        <Button 
          variant={activeTab === 'settings' ? 'secondary' : 'ghost'} 
          size="icon"
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search or start new chat" 
            className="pl-10 bg-muted/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            className={cn(
              "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors",
              selectedChatId === chat.id && "bg-muted"
            )}
            onClick={() => onSelectChat(chat.id, chat.type)}
          >
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/20 text-primary">
                {chat.avatarInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground truncate">{chat.name}</span>
                {chat.lastMessageTime && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(chat.lastMessageTime, { addSuffix: false })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <CheckCheck className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-muted-foreground truncate">{chat.lastMessage}</span>
              </div>
            </div>
            {chat.unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {chat.unreadCount}
              </span>
            )}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;
