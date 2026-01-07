import { toast } from '@/hooks/use-toast';

export const showSuccess = (message: string, title?: string) => {
  toast({
    title: title || 'Success',
    description: message,
    variant: 'default',
    className: 'bg-green-50 border-green-200 text-green-900',
  });
};

export const showError = (message: string, title?: string) => {
  toast({
    title: title || 'Error',
    description: message,
    variant: 'destructive',
  });
};

export const showWarning = (message: string, title?: string) => {
  toast({
    title: title || 'Warning',
    description: message,
    variant: 'default',
    className: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  });
};

export const showInfo = (message: string, title?: string) => {
  toast({
    title: title || 'Info',
    description: message,
    variant: 'default',
    className: 'bg-blue-50 border-blue-200 text-blue-900',
  });
};