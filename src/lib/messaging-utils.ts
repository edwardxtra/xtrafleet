import { Firestore, collection, addDoc, Timestamp, doc, getDoc } from "firebase/firestore";

export async function createConversation(
  firestore: Firestore,
  participantId1: string,
  participantId2: string,
  loadId: string,
  tlaId?: string
) {
  try {
    // Fetch participant details
    const [owner1Doc, owner2Doc] = await Promise.all([
      getDoc(doc(firestore, `owner_operators/${participantId1}`)),
      getDoc(doc(firestore, `owner_operators/${participantId2}`))
    ]);

    const owner1Data = owner1Doc.data();
    const owner2Data = owner2Doc.data();

    // Fetch load details
    const loadDoc = await getDoc(doc(firestore, `owner_operators/${participantId1}/loads/${loadId}`));
    const loadData = loadDoc.data();

    const participantDetails = {
      [participantId1]: {
        companyName: owner1Data?.companyName || owner1Data?.email || "Unknown",
        email: owner1Data?.email || "",
      },
      [participantId2]: {
        companyName: owner2Data?.companyName || owner2Data?.email || "Unknown",
        email: owner2Data?.email || "",
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
      participants: [participantId1, participantId2],
      participantDetails,
      loadId,
      loadDetails,
      tlaId: tlaId || null,
      createdAt: Timestamp.now().toDate().toISOString(),
      lastMessageAt: Timestamp.now().toDate().toISOString(),
      lastMessage: "Match accepted! Coordinate pickup and delivery details here.",
      unreadCount: {
        [participantId1]: 1,
        [participantId2]: 1,
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

    return conversationDoc.id;
  } catch (error) {
    console.error("Error creating conversation:", error);
    throw error;
  }
}
