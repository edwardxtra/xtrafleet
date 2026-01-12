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
      lastMessage: "Conversation started",
      unreadCount: {
        [participantId1]: 0,
        [participantId2]: 0,
      },
    };

    const conversationsRef = collection(firestore, "conversations");
    const conversationDoc = await addDoc(conversationsRef, conversationData);

    return conversationDoc.id;
  } catch (error) {
    console.error("Error creating conversation:", error);
    throw error;
  }
}
