"use client"

import * as React from "react"
import { Upload, X, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DocumentUploadProps {
  onFileSelect: (file: File | null) => void
  currentFileName?: string
  accept?: string
  disabled?: boolean
}

export function DocumentUpload({ 
  onFileSelect, 
  currentFileName, 
  accept = "image/*,.pdf",
  disabled = false 
}: DocumentUploadProps) {
  const [fileName, setFileName] = React.useState<string | undefined>(currentFileName)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFileName(file.name)
      onFileSelect(file)
    }
  }

  const handleClear = () => {
    setFileName(undefined)
    onFileSelect(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      
      {fileName ? (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1 truncate">{fileName}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Document (Optional)
        </Button>
      )}
      
      <p className="text-xs text-muted-foreground">
        Accepted: PDF, JPG, PNG (Max 10MB)
      </p>
    </div>
  )
}
