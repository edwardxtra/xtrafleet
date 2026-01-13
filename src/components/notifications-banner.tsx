"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot, orderBy, limit, updateDoc, doc } from "firebase/firestore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, MessageSquare, FileText, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "match_accepted" | "tla_ready" | "message_received";
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  createdAt: string;
  read: boolean;
  userId: string;
}

export function NotificationsBanner() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!firestore || !user) return;

    // Listen for unread notifications
    const notificationsRef = collection(firestore, "notifications");
    const q = query(
      notificationsRef,
      where("userId", "==", user.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(3)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  const markAsRead = async (notificationId: string) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, "notifications", notificationId), {
        read: true,
        readAt: new Date().toISOString(),
      });
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "match_accepted":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "tla_ready":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "message_received":
        return <MessageSquare className="h-4 w-4 text-purple-600" />;
    }
  };

  const getVariant = (type: Notification["type"]) => {
    switch (type) {
      case "match_accepted":
        return "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900";
      case "tla_ready":
        return "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900";
      case "message_received":
        return "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900";
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {notifications.map((notification) => (
        <Alert
          key={notification.id}
          className={cn("relative pr-12", getVariant(notification.type))}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getIcon(notification.type)}</div>
            <div className="flex-1">
              <AlertDescription>
                <div className="font-medium text-sm mb-1">{notification.title}</div>
                <div className="text-sm text-muted-foreground">{notification.message}</div>
                {notification.link && notification.linkText && (
                  <Button
                    asChild
                    variant="link"
                    className="h-auto p-0 mt-2 text-sm"
                    onClick={() => markAsRead(notification.id)}
                  >
                    <Link href={notification.link}>{notification.linkText}</Link>
                  </Button>
                )}
              </AlertDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6"
              onClick={() => markAsRead(notification.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}
