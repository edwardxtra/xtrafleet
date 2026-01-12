export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface Conversation {
  id: string;
  participants: string[]; // Array of owner_operator IDs
  participantDetails?: {
    [key: string]: {
      companyName: string;
      email: string;
    };
  };
  loadId?: string;
  loadDetails?: {
    origin: string;
    destination: string;
    cargo: string;
  };
  tlaId?: string;
  createdAt: string;
  lastMessageAt: string;
  lastMessage: string;
  unreadCount?: {
    [key: string]: number; // userId: count
  };
}
