'use client';

import { useUser, useFirestore } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function TestAuthPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  const testQuery = async () => {
    if (!user || !firestore) {
      setError("No user or firestore");
      return;
    }

    try {
      setResult("Querying...");
      setError("");
      
      const driversRef = collection(firestore, `owner_operators/${user.uid}/drivers`);
      const snapshot = await getDocs(driversRef);
      
      setResult(`Success! Found ${snapshot.docs.length} drivers`);
    } catch (err: any) {
      setError(`Error: ${err.message}`);
      console.error("Query error:", err);
    }
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Auth Test Page</h1>
      
      <div className="p-4 bg-muted rounded">
        <p><strong>Loading:</strong> {isUserLoading ? "Yes" : "No"}</p>
        <p><strong>User:</strong> {user ? user.email : "Not logged in"}</p>
        <p><strong>UID:</strong> {user?.uid || "N/A"}</p>
      </div>

      <Button onClick={testQuery} disabled={!user || isUserLoading}>
        Test Firestore Query
      </Button>

      {result && (
        <div className="p-4 bg-green-100 text-green-800 rounded">
          {result}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded">
          {error}
        </div>
      )}
    </div>
  );
}