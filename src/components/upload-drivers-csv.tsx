
'use client';

import { useState, useRef, type ReactNode } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from './ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';

export function UploadDriversCSV({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a CSV file to upload.',
        variant: 'destructive',
      });
      return;
    }
    
    const user = auth.currentUser;
    if (!user) {
       toast({
        title: "Authentication Error",
        description: "You must be logged in to upload drivers.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setProgress(0);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const driversData = results.data.map(driver => ({
          name: (driver as any).name || `${(driver as any).firstName || ''} ${(driver as any).lastName || ''}`.trim(),
          email: (driver as any).email || '',
          phoneNumber: (driver as any).phoneNumber || '',
          cdlLicense: (driver as any).cdlLicense || '',
          availability: (driver as any).availability || 'Available',
          location: (driver as any).location || 'Unknown',
          vehicleType: (driver as any).vehicleType || 'Dry Van',
          certifications: (driver as any).certifications ? String((driver as any).certifications).split(',').map((s: string) => s.trim()) : [],
          profileSummary: (driver as any).profileSummary || '',
        }));
        
        if (driversData.length === 0) {
          toast({
            title: 'Empty CSV',
            description: 'The selected CSV file is empty or invalid.',
            variant: 'destructive',
          });
          setIsUploading(false);
          setProgress(0);
          return;
        }

        try {
          const idToken = await user.getIdToken();
          let successfulUploads = 0;

          for (let i = 0; i < driversData.length; i++) {
            const driver = driversData[i];
            const response = await fetch('/api/drivers', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify(driver)
            });

            if (response.ok) {
              successfulUploads++;
            } else {
              const res = await response.json();
              console.error(`Failed to upload driver ${driver.name}:`, res.error);
            }
            setProgress(((i + 1) / driversData.length) * 100);
          }

          if (successfulUploads > 0) {
            toast({
              title: 'Upload Complete',
              description: `${successfulUploads} of ${driversData.length} drivers have been added.`,
            });
          }
          
          if (successfulUploads !== driversData.length) {
             toast({
              title: 'Upload Incomplete',
              description: `${driversData.length - successfulUploads} drivers failed to upload. Check the console for details.`,
              variant: 'destructive'
            });
          }

          setTimeout(() => {
            setIsOpen(false);
            router.refresh();
          }, 500);

        } catch (error: any) {
          toast({
            title: 'Upload Failed',
            description: error.message || 'An unexpected error occurred.',
            variant: 'destructive',
          });
        } finally {
           setTimeout(() => {
            setIsUploading(false);
            setProgress(0);
            setFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
           }, 1000);
        }
      },
      error: (error: any) => {
        toast({
          title: 'Parsing Error',
          description: error.message,
          variant: 'destructive',
        });
        setIsUploading(false);
        setProgress(0);
      },
    });
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="cursor-pointer">
        {children}
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Drivers CSV</DialogTitle>
            <DialogDescription>
              Select a CSV file with your driver information. The file must contain columns for 'name', 'email', 'phoneNumber', and 'cdlLicense'.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="csv-file">CSV File</Label>
              <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
            </div>
            {isUploading && <Progress value={progress} className="w-full" />}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isUploading}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleUpload} disabled={isUploading || !file}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
