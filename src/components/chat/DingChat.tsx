import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";

const DingChat = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>('global');
  const [selectedChatType, setSelectedChatType] = useState<'group' | 'global'>('global');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  const handleSelectChat = (chatId: string | null, type: 'group' | 'global') => {
    setSelectedChatId(chatId);
    setSelectedChatType(type);
  };

  if (!currentUserId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <ChatSidebar
        currentUserId={currentUserId}
        onSelectChat={handleSelectChat}
        selectedChatId={selectedChatId}
      />
      <ChatWindow
        currentUserId={currentUserId}
        chatId={selectedChatId}
        chatType={selectedChatType}
      />
    </div>
  );
};

export default DingChat;
