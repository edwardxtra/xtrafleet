"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser, useStorage } from "@/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { validateFile, formatFileSize } from "@/lib/file-validation";
import { UploadCloud, FileText, Loader2, Check, X, AlertCircle } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast-utils";

export interface COIData {
  // File upload
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  uploadedAt?: string;
  // Manual entry
  insurerName?: string;
  policyNumber?: string;
  expiryDate?: string;
}

interface COIUploadSectionProps {
  onCoiChange: (data: COIData) => void;
  initialData?: COIData;
}

export function COIUploadSection({ onCoiChange, initialData }: COIUploadSectionProps) {
  const { user } = useUser();
  const storage = useStorage();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string } | null>(
    initialData?.fileUrl ? { name: initialData.fileName || 'COI Document', url: initialData.fileUrl } : null
  );
  const [insurerName, setInsurerName] = useState(initialData?.insurerName || "");
  const [policyNumber, setPolicyNumber] = useState(initialData?.policyNumber || "");
  const [expiryDate, setExpiryDate] = useState(initialData?.expiryDate || "");
  const [activeTab, setActiveTab] = useState<string>(initialData?.fileUrl ? "upload" : "upload");

  const handleFileUpload = useCallback(async (file: File) => {
    if (!user) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      showError(validation.error || 'Invalid file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `documents/${user.uid}/coi/${timestamp}_${sanitizedName}`;
      const storageRef = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: user.uid,
          documentType: 'coi',
          originalName: file.name,
        },
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('Upload error:', error);
          showError('Failed to upload file. Please try again.');
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadedFile({ name: file.name, url: downloadURL });
          setUploading(false);
          showSuccess('COI uploaded successfully!');

          onCoiChange({
            fileUrl: downloadURL,
            fileName: file.name,
            fileSize: file.size,
            uploadedAt: new Date().toISOString(),
            insurerName,
            policyNumber,
            expiryDate,
          });
        }
      );
    } catch (error) {
      console.error('Upload error:', error);
      showError('Failed to upload file.');
      setUploading(false);
    }
  }, [user, storage, onCoiChange, insurerName, policyNumber, expiryDate]);

  const handleManualChange = useCallback(() => {
    onCoiChange({
      fileUrl: uploadedFile?.url,
      fileName: uploadedFile?.name,
      insurerName,
      policyNumber,
      expiryDate,
    });
  }, [onCoiChange, uploadedFile, insurerName, policyNumber, expiryDate]);

  const removeFile = () => {
    setUploadedFile(null);
    setUploadProgress(0);
    onCoiChange({
      insurerName,
      policyNumber,
      expiryDate,
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-base font-medium">Certificate of Insurance (COI)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your COI document and/or enter your insurance details.
        </p>
        <p className="text-xs text-muted-foreground mt-1 italic">
          XtraFleet verifies insurance status only. Coverage adequacy and applicability remain the responsibility of the fleet.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload Document</TabsTrigger>
          <TabsTrigger value="manual">Enter Manually</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4 mt-4">
          {uploadedFile ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">Uploaded successfully</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <button type="button" onClick={removeFile} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => document.getElementById('coi-file-input')?.click()}
            >
              {uploading ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
                  <div className="w-full bg-muted rounded-full h-2 max-w-xs mx-auto">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Drop your COI here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, or WEBP (max 10MB)</p>
                </>
              )}
            </div>
          )}
          <input
            id="coi-file-input"
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
        </TabsContent>

        <TabsContent value="manual" className="space-y-4 mt-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="insurerName">Insurance Company Name</Label>
              <Input
                id="insurerName"
                placeholder="e.g., Progressive Commercial"
                value={insurerName}
                onChange={(e) => {
                  setInsurerName(e.target.value);
                  setTimeout(handleManualChange, 0);
                }}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="policyNumber">Policy Number</Label>
                <Input
                  id="policyNumber"
                  placeholder="e.g., COM-12345678"
                  value={policyNumber}
                  onChange={(e) => {
                    setPolicyNumber(e.target.value);
                    setTimeout(handleManualChange, 0);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    setTimeout(handleManualChange, 0);
                  }}
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-3">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          You can upload a document, enter details manually, or both. We recommend uploading your COI for faster verification.
        </p>
      </div>
    </div>
  );
}
