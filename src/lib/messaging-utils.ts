import { Firestore, collection, addDoc, doc, getDoc } from "firebase/firestore";

export interface ConversationData {
  participants: string[];
  participantDetails: Record<string, {
    companyName: string;
    email: string;
  }>;
  loadDetails: {
    origin: string;
    destination: string;
    cargo: string;
  };
  tlaId?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: Record<string, number>;
  createdAt: string;
}

/**
 * Create a conversation between driver owner (lessor) and load owner (lessee)
 * FIX #2: Added detailed logging to debug conversation creation
 */
export async function createConversation(
  firestore: Firestore,
  driverOwnerId: string,  // Lessor (driver owner)
  loadOwnerId: string,    // Lessee (load owner)
  loadId: string,
  tlaId?: string
): Promise<string | null> {
  try {
    console.log("🔵 Creating conversation...");
    console.log("  Driver Owner (Lessor):", driverOwnerId);
    console.log("  Load Owner (Lessee):", loadOwnerId);
    console.log("  Load ID:", loadId);
    console.log("  TLA ID:", tlaId);

    // Fetch load details
    const loadDoc = await getDoc(doc(firestore, `owner_operators/${loadOwnerId}/loads/${loadId}`));
    if (!loadDoc.exists()) {
      console.error("❌ Load not found:", loadId);
      throw new Error("Load not found");
    }
    const loadData = loadDoc.data();
    console.log("✅ Load data fetched");

    // Fetch driver owner (lessor) info
    const lessorDoc = await getDoc(doc(firestore, `owner_operators/${driverOwnerId}`));
    if (!lessorDoc.exists()) {
      console.error("❌ Driver owner not found:", driverOwnerId);
      throw new Error("Driver owner not found");
    }
    const lessorData = lessorDoc.data();
    console.log("✅ Driver owner data fetched");

    // Fetch load owner (lessee) info
    const lesseeDoc = await getDoc(doc(firestore, `owner_operators/${loadOwnerId}`));
    if (!lesseeDoc.exists()) {
      console.error("❌ Load owner not found:", loadOwnerId);
      throw new Error("Load owner not found");
    }
    const lesseeData = lesseeDoc.data();
    console.log("✅ Load owner data fetched");

    // Create conversation
    const conversationData: ConversationData = {
      participants: [driverOwnerId, loadOwnerId],
      participantDetails: {
        [driverOwnerId]: {
          companyName: lessorData.companyName || lessorData.legalName || "Driver Owner",
          email: lessorData.contactEmail || lessorData.email || "",
        },
        [loadOwnerId]: {
          companyName: lesseeData.companyName || lesseeData.legalName || "Load Owner",
          email: lesseeData.contactEmail || lesseeData.email || "",
        },
      },
      loadDetails: {
        origin: loadData.origin,
        destination: loadData.destination,
        cargo: loadData.cargo,
      },
      tlaId,
      lastMessage: "Conversation started",
      lastMessageAt: new Date().toISOString(),
      unreadCount: {
        [driverOwnerId]: 0,
        [loadOwnerId]: 0,
      },
      createdAt: new Date().toISOString(),
    };

    console.log("📤 Creating conversation document...");
    const conversationRef = await addDoc(collection(firestore, "conversations"), conversationData);
    console.log("✅ Conversation created with ID:", conversationRef.id);

    // Add initial system message
    console.log("📤 Adding initial message...");
    await addDoc(collection(firestore, `conversations/${conversationRef.id}/messages`), {
      conversationId: conversationRef.id,
      senderId: "system",
      text: `Trip from ${loadData.origin} to ${loadData.destination} - ${loadData.cargo}. Use this chat to coordinate details.`,
      timestamp: new Date().toISOString(),
      read: false,
    });
    console.log("✅ Initial message added");

    console.log("🎉 Conversation setup complete!");
    return conversationRef.id;
  } catch (error) {
    console.error("❌ Failed to create conversation:", error);
    throw error;
  }
}
