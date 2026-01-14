import { useEffect, useState } from 'react';
import { showSuccess, showWarning } from '@/lib/toast-utils';

/**
 * Custom hook to track online/offline status
 * Shows toast notifications when connection status changes
 * 
 * @returns boolean - true if online, false if offline
 * 
 * @example
 * const isOnline = useOnlineStatus();
 * if (!isOnline) {
 *   return <OfflineMessage />;
 * }
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('You\'re back online!');
    };

    const handleOffline = () => {
      setIsOnline(false);
      showWarning('You\'re offline. Some features may not work.');
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Set initial state
    setIsOnline(navigator.onLine);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
