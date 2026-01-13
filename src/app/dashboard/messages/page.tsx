"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, Timestamp, writeBatch, getDocs } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, MessageSquare, Loader2, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Conversation, Message } from "@/lib/types/messaging";
import { showError } from "@/lib/toast-utils";

export default function MessagesPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoading(false);
      return;
    }

    const conversationsRef = collection(firestore, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const convos: Conversation[] = [];
        snapshot.forEach((doc) => {
          convos.push({ id: doc.id, ...doc.data() } as Conversation);
        });
        convos.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        setConversations(convos);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error loading conversations:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!firestore || !selectedConversation) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(firestore, `conversations/${selectedConversation.id}/messages`);
    const q = query(messagesRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((doc) => {
          msgs.push({ id: doc.id, ...doc.data() } as Message);
        });
        msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setMessages(msgs);
      },
      (error) => {
        console.error("Error loading messages:", error);
        showError("Failed to load messages");
      }
    );

    return () => unsubscribe();
  }, [firestore, selectedConversation]);

  // CRITICAL FIX: Mark messages as read when messages change or conversation is selected
  useEffect(() => {
    if (!firestore || !selectedConversation || !user?.uid || messages.length === 0) return;

    const markMessagesAsRead = async () => {
      const unreadMessages = messages.filter(
        (msg) => !msg.read && msg.senderId !== user.uid
      );

      if (unreadMessages.length === 0) return;

      console.log(`Marking ${unreadMessages.length} messages as read`);

      const batch = writeBatch(firestore);

      unreadMessages.forEach((msg) => {
        const msgRef = doc(firestore, `conversations/${selectedConversation.id}/messages/${msg.id}`);
        batch.update(msgRef, { read: true });
      });

      // Update unread count in conversation
      const conversationRef = doc(firestore, `conversations/${selectedConversation.id}`);
      batch.update(conversationRef, {
        [`unreadCount.${user.uid}`]: 0
      });

      try {
        await batch.commit();
        console.log('✅ Messages marked as read');
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    };

    // Small delay to ensure we have the latest messages
    const timer = setTimeout(() => {
      markMessagesAsRead();
    }, 500);

    return () => clearTimeout(timer);
  }, [firestore, selectedConversation, user?.uid, messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversation || !firestore || !user?.uid) return;

    setIsSending(true);
    try {
      const messagesRef = collection(firestore, `conversations/${selectedConversation.id}/messages`);
      
      await addDoc(messagesRef, {
        conversationId: selectedConversation.id,
        senderId: user.uid,
        text: messageText.trim(),
        timestamp: Timestamp.now().toDate().toISOString(),
        read: false,
      });

      // Update conversation's last message
      const conversationRef = doc(firestore, `conversations/${selectedConversation.id}`);
      const otherParticipantId = selectedConversation.participants.find(id => id !== user.uid);
      
      await updateDoc(conversationRef, {
        lastMessageAt: Timestamp.now().toDate().toISOString(),
        lastMessage: messageText.trim(),
        [`unreadCount.${otherParticipantId}`]: (selectedConversation.unreadCount?.[otherParticipantId!] || 0) + 1
      });

      setMessageText("");
    } catch (error: any) {
      console.error("Error sending message:", error);
      showError("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const getOtherParticipantName = (conversation: Conversation) => {
    const otherParticipantId = conversation.participants.find(id => id !== user?.uid);
    if (!otherParticipantId) return "Unknown";
    
    const details = conversation.participantDetails?.[otherParticipantId];
    return details?.companyName || details?.email || "Unknown Company";
  };

  const getInitials = (conversation: Conversation) => {
    const name = getOtherParticipantName(conversation);
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getUnreadCount = (conversation: Conversation) => {
    return conversation.unreadCount?.[user?.uid || ""] || 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
      {/* Conversations List */}
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messages
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No conversations yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Messages will appear here when you match with other operators
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {conversations.map((conversation) => {
                  const unreadCount = getUnreadCount(conversation);
                  const isSelected = selectedConversation?.id === conversation.id;
                  
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                        isSelected ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(conversation)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-sm truncate">
                              {getOtherParticipantName(conversation)}
                            </p>
                            {unreadCount > 0 && (
                              <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5">
                                {unreadCount}
                              </Badge>
                            )}
                          </div>
                          {conversation.loadDetails && (
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {conversation.loadDetails.origin} → {conversation.loadDetails.destination}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground truncate">
                            {conversation.lastMessage || "No messages yet"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}\n              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Messages Panel */}
      <Card className="md:col-span-2 flex flex-col">
        {selectedConversation ? (
          <>
            <CardHeader className="border-b">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{getInitials(selectedConversation)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <CardTitle className="text-lg">
                    {getOtherParticipantName(selectedConversation)}
                  </CardTitle>
                  {selectedConversation.loadDetails && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Package className="h-3 w-3" />
                      {selectedConversation.loadDetails.cargo}: {selectedConversation.loadDetails.origin} → {selectedConversation.loadDetails.destination}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => {
                  const isOwnMessage = message.senderId === user?.uid;
                  
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          isOwnMessage
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm break-words">{message.text}</p>
                        <p className={`text-xs mt-1 ${
                          isOwnMessage ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}>
                          {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <CardContent className="border-t p-4">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isSending}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!messageText.trim() || isSending}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </CardContent>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
