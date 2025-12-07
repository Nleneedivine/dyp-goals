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
    fetchChats();

    // Subscribe to new messages
    const channel = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as any;
          setChats(prev => prev.map(chat => {
            if (chat.type === 'global' && !msg.group_id) {
              return { 
                ...chat, 
                lastMessage: msg.message.length > 40 ? msg.message.substring(0, 40) + '...' : msg.message,
                lastMessageTime: new Date(msg.created_at)
              };
            }
            if (chat.type === 'group' && msg.group_id === chat.id) {
              return {
                ...chat,
                lastMessage: msg.message.length > 40 ? msg.message.substring(0, 40) + '...' : msg.message,
                lastMessageTime: new Date(msg.created_at)
              };
            }
            return chat;
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_group_members' },
        () => {
          // Refetch when membership changes
          fetchChats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const fetchChats = async () => {
    const chatPreviews: ChatPreview[] = [];

    // Add global chat
    const globalChat: ChatPreview = {
      id: 'global',
      name: 'Goals Chat',
      lastMessage: 'Tap to start chatting...',
      lastMessageTime: null,
      unreadCount: 0,
      type: 'global',
      avatarInitials: 'GC'
    };

    // Fetch latest message for global chat
    const { data: globalMsg } = await supabase
      .from('chat_messages')
      .select('message, created_at')
      .is('group_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (globalMsg) {
      globalChat.lastMessage = globalMsg.message.length > 40 
        ? globalMsg.message.substring(0, 40) + '...' 
        : globalMsg.message;
      globalChat.lastMessageTime = new Date(globalMsg.created_at);
    }

    chatPreviews.push(globalChat);

    // Fetch user's chat groups (accountability group chats)
    const { data: memberGroups } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', currentUserId);

    if (memberGroups && memberGroups.length > 0) {
      const groupIds = memberGroups.map(m => m.group_id);
      
      const { data: groups } = await supabase
        .from('chat_groups')
        .select('*')
        .in('id', groupIds);

      if (groups) {
        for (const group of groups) {
          // Fetch latest message for this group
          const { data: latestMsg } = await supabase
            .from('chat_messages')
            .select('message, created_at')
            .eq('group_id', group.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const initials = group.name
            .split(' ')
            .map((word: string) => word[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

          chatPreviews.push({
            id: group.id,
            name: group.name,
            lastMessage: latestMsg?.message 
              ? (latestMsg.message.length > 40 ? latestMsg.message.substring(0, 40) + '...' : latestMsg.message)
              : 'No messages yet',
            lastMessageTime: latestMsg ? new Date(latestMsg.created_at) : null,
            unreadCount: 0,
            type: 'group',
            avatarInitials: initials
          });
        }
      }
    }

    // Sort by last message time (most recent first), global chat always at top
    chatPreviews.sort((a, b) => {
      if (a.id === 'global') return -1;
      if (b.id === 'global') return 1;
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
    });

    setChats(chatPreviews);
  };

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
              <AvatarFallback className={cn(
                "text-primary",
                chat.type === 'global' ? "bg-primary/20" : "bg-secondary/20"
              )}>
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
