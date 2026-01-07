'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import DriverProfilePage from '../drivers/[id]/page';

function ProfileContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  
  if (!id) {
    return <div>No driver ID provided</div>;
  }
  
  return <DriverProfilePage params={{ id }} />;
}

export default function DriverProfile() {
  return (
    <Suspense fallback={<div>Loading driver profile...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
