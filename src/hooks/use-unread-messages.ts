import { useEffect, useState } from "react";
import { useUser, useFirestore } from "@/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import type { Conversation } from "@/lib/types/messaging";

export function useUnreadMessagesCount() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!firestore || !user?.uid) {
      setUnreadCount(0);
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
        let total = 0;
        snapshot.forEach((doc) => {
          const conversation = doc.data() as Conversation;
          const userUnread = conversation.unreadCount?.[user.uid] || 0;
          total += userUnread;
        });
        setUnreadCount(total);
      },
      (error) => {
        console.error("Error loading unread count:", error);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  return unreadCount;
}
