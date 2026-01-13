import { Firestore, collection, addDoc, Timestamp, doc, getDoc } from "firebase/firestore";

export async function createConversation(
  firestore: Firestore,
  driverOwnerId: string,  // Lessor (driver owner)
  loadOwnerId: string,    // Lessee (load owner) 
  loadId: string,
  tlaId?: string
) {
  try {
    // Fetch participant details
    const [driverOwnerDoc, loadOwnerDoc] = await Promise.all([
      getDoc(doc(firestore, `owner_operators/${driverOwnerId}`)),
      getDoc(doc(firestore, `owner_operators/${loadOwnerId}`))
    ]);

    const driverOwnerData = driverOwnerDoc.data();
    const loadOwnerData = loadOwnerDoc.data();

    // Fetch load details - CRITICAL FIX: Use loadOwnerId, not driverOwnerId
    const loadDoc = await getDoc(doc(firestore, `owner_operators/${loadOwnerId}/loads/${loadId}`));
    const loadData = loadDoc.data();

    const participantDetails = {
      [driverOwnerId]: {
        companyName: driverOwnerData?.companyName || driverOwnerData?.legalName || driverOwnerData?.email || "Unknown",
        email: driverOwnerData?.contactEmail || driverOwnerData?.email || "",
      },
      [loadOwnerId]: {
        companyName: loadOwnerData?.companyName || loadOwnerData?.legalName || loadOwnerData?.email || "Unknown",
        email: loadOwnerData?.contactEmail || loadOwnerData?.email || "",
      },
    };

    const loadDetails = loadData
      ? {
          origin: loadData.origin || "",
          destination: loadData.destination || "",
          cargo: loadData.cargo || "",
        }
      : undefined;

    const conversationData = {
      participants: [driverOwnerId, loadOwnerId],
      participantDetails,
      loadId,
      loadDetails,
      tlaId: tlaId || null,
      createdAt: Timestamp.now().toDate().toISOString(),
      lastMessageAt: Timestamp.now().toDate().toISOString(),
      lastMessage: "Match accepted! Coordinate pickup and delivery details here.",
      unreadCount: {
        [driverOwnerId]: 1,
        [loadOwnerId]: 1,
      },
    };

    const conversationsRef = collection(firestore, "conversations");
    const conversationDoc = await addDoc(conversationsRef, conversationData);

    // Create initial welcome message
    const messagesRef = collection(firestore, `conversations/${conversationDoc.id}/messages`);
    await addDoc(messagesRef, {
      conversationId: conversationDoc.id,
      senderId: "system",
      text: "Match accepted! Use this chat to coordinate pickup and delivery details.",
      timestamp: Timestamp.now().toDate().toISOString(),
      read: false,
    });

    console.log("✅ Conversation created successfully:", conversationDoc.id);
    return conversationDoc.id;
  } catch (error) {
    console.error("❌ Error creating conversation:", error);
    throw error;
  }
}
