"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Trash2, Upload, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EmploymentEntry {
  id: string;
  companyName: string;
  position: string;
  startDate: string;
  endDate: string;
  reasonForLeaving: string;
  supervisorName: string;
  supervisorContact: string;
}

interface AccidentEntry {
  id: string;
  date: string;
  location: string;
  description: string;
  injuries: boolean;
  fatalities: boolean;
}

interface ViolationEntry {
  id: string;
  date: string;
  location: string;
  violationType: string;
  citationNumber: string;
  fineAmount: string;
}

interface DQFCompletionFormProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function DQFCompletionForm({ onComplete, onCancel }: DQFCompletionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [dob, setDob] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  
  const [employmentHistory, setEmploymentHistory] = useState<EmploymentEntry[]>([
    { id: crypto.randomUUID(), companyName: "", position: "", startDate: "", endDate: "", reasonForLeaving: "", supervisorName: "", supervisorContact: "" }
  ]);
  
  const [hasAccidents, setHasAccidents] = useState(false);
  const [accidents, setAccidents] = useState<AccidentEntry[]>([]);
  
  const [cdlFrontFile, setCdlFrontFile] = useState<File | null>(null);
  const [cdlBackFile, setCdlBackFile] = useState<File | null>(null);
  const [cdlFrontPreview, setCdlFrontPreview] = useState<string | null>(null);
  const [cdlBackPreview, setCdlBackPreview] = useState<string | null>(null);
  
  const [hasViolations, setHasViolations] = useState(false);
  const [violations, setViolations] = useState<ViolationEntry[]>([]);

  const addEmployment = () => {
    setEmploymentHistory([...employmentHistory, {
      id: crypto.randomUUID(),
      companyName: "",
      position: "",
      startDate: "",
      endDate: "",
      reasonForLeaving: "",
      supervisorName: "",
      supervisorContact: ""
    }]);
  };

  const removeEmployment = (id: string) => setEmploymentHistory(employmentHistory.filter(e => e.id !== id));
  const updateEmployment = (id: string, field: keyof EmploymentEntry, value: string) => {
    setEmploymentHistory(employmentHistory.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const addAccident = () => {
    setAccidents([...accidents, {
      id: crypto.randomUUID(),
      date: "",
      location: "",
      description: "",
      injuries: false,
      fatalities: false
    }]);
  };

  const removeAccident = (id: string) => setAccidents(accidents.filter(a => a.id !== id));
  const updateAccident = (id: string, field: keyof AccidentEntry, value: string | boolean) => {
    setAccidents(accidents.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const addViolation = () => {
    setViolations([...violations, {
      id: crypto.randomUUID(),
      date: "",
      location: "",
      violationType: "",
      citationNumber: "",
      fineAmount: ""
    }]);
  };

  const removeViolation = (id: string) => setViolations(violations.filter(v => v.id !== id));
  const updateViolation = (id: string, field: keyof ViolationEntry, value: string) => {
    setViolations(violations.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleCdlFrontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCdlFrontFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCdlFrontPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCdlBackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCdlBackFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCdlBackPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const validateForm = () => {
    if (!dob || !street || !city || !state || !zip) {
      toast({ title: "Missing Information", description: "Please fill in all personal information fields.", variant: "destructive" });
      return false;
    }
    if (employmentHistory.length === 0 || !employmentHistory[0].companyName) {
      toast({ title: "Employment History Required", description: "Please add at least one employment entry.", variant: "destructive" });
      return false;
    }
    if (!cdlFrontFile || !cdlBackFile) {
      toast({ title: "CDL Images Required", description: "Please upload both front and back images of your CDL.", variant: "destructive" });
      return false;
    }
    if (hasViolations && violations.length === 0) {
      toast({ title: "Traffic Violations", description: "Please add violation details or uncheck 'I have violations to report'.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      const cdlFrontBase64 = cdlFrontPreview?.split(',')[1];
      const cdlBackBase64 = cdlBackPreview?.split(',')[1];

      const dqfData = {
        personalInfo: { dob, address: { street, city, state, zip } },
        employmentHistory: employmentHistory.filter(e => e.companyName),
        accidentHistory: { hasAccidents, accidents: hasAccidents ? accidents : [] },
        cdlImages: { front: cdlFrontBase64, back: cdlBackBase64, frontFileName: cdlFrontFile?.name, backFileName: cdlBackFile?.name },
        trafficViolations: { hasViolations, violations: hasViolations ? violations : [] }
      };

      const response = await fetch('/api/submit-dqf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dqfData),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to submit DQF');

      toast({ title: "DQF Submitted Successfully!", description: "Your Driver Qualification File has been submitted for review." });
      onComplete?.();
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message || "An error occurred while submitting your DQF.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-6">
      <div>
        <h2 className="text-3xl font-bold font-headline">Complete Your Driver Qualification File</h2>
        <p className="text-muted-foreground mt-2">
          Please provide the following information as required by FMCSA regulations. All fields are required unless marked optional.
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This information will be reviewed by your fleet owner before you can start matching with loads.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Basic information for your driver profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="dob">Date of Birth *</Label>
            <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required disabled={isSubmitting} />
          </div>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-medium">Current Address *</h4>
            <div>
              <Label htmlFor="street">Street Address</Label>
              <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" required disabled={isSubmitting} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tampa" required disabled={isSubmitting} />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="FL" maxLength={2} required disabled={isSubmitting} />
              </div>
            </div>
            <div>
              <Label htmlFor="zip">ZIP Code</Label>
              <Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="33602" maxLength={5} required disabled={isSubmitting} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment History (Last 10 Years) *</CardTitle>
          <CardDescription>List all employment for the past 10 years. Gaps are acceptable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {employmentHistory.map((entry, index) => (
            <div key={entry.id} className="space-y-4 p-4 border rounded-lg relative">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Employment #{index + 1}</h4>
                {employmentHistory.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeEmployment(entry.id)} disabled={isSubmitting}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input value={entry.companyName} onChange={(e) => updateEmployment(entry.id, 'companyName', e.target.value)} placeholder="ABC Trucking" required disabled={isSubmitting} />
                </div>
                <div>
                  <Label>Position *</Label>
                  <Input value={entry.position} onChange={(e) => updateEmployment(entry.id, 'position', e.target.value)} placeholder="CDL Driver" required disabled={isSubmitting} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date *</Label>
                  <Input type="date" value={entry.startDate} onChange={(e) => updateEmployment(entry.id, 'startDate', e.target.value)} required disabled={isSubmitting} />
                </div>
                <div>
                  <Label>End Date *</Label>
                  <Input type="date" value={entry.endDate} onChange={(e) => updateEmployment(entry.id, 'endDate', e.target.value)} required disabled={isSubmitting} />
                </div>
              </div>
              <div>
                <Label>Reason for Leaving</Label>
                <Input value={entry.reasonForLeaving} onChange={(e) => updateEmployment(entry.id, 'reasonForLeaving', e.target.value)} placeholder="Career advancement" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supervisor Name</Label>
                  <Input value={entry.supervisorName} onChange={(e) => updateEmployment(entry.id, 'supervisorName', e.target.value)} placeholder="John Smith" disabled={isSubmitting} />
                </div>
                <div>
                  <Label>Supervisor Contact</Label>
                  <Input value={entry.supervisorContact} onChange={(e) => updateEmployment(entry.id, 'supervisorContact', e.target.value)} placeholder="(555) 123-4567" disabled={isSubmitting} />
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addEmployment} disabled={isSubmitting} className="w-full">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Employment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accident History (Last 3 Years) *</CardTitle>
          <CardDescription>Report all accidents in the last 3 years</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="no-accidents" checked={!hasAccidents} onCheckedChange={(checked) => { setHasAccidents(!checked); if (checked) setAccidents([]); }} disabled={isSubmitting} />
            <Label htmlFor="no-accidents" className="cursor-pointer">
              I certify I have NO accidents in the last 3 years
            </Label>
          </div>
          {hasAccidents && (
            <>
              {accidents.map((accident, index) => (
                <div key={accident.id} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Accident #{index + 1}</h4>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeAccident(accident.id)} disabled={isSubmitting}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date *</Label>
                      <Input type="date" value={accident.date} onChange={(e) => updateAccident(accident.id, 'date', e.target.value)} required disabled={isSubmitting} />
                    </div>
                    <div>
                      <Label>Location *</Label>
                      <Input value={accident.location} onChange={(e) => updateAccident(accident.id, 'location', e.target.value)} placeholder="City, State" required disabled={isSubmitting} />
                    </div>
                  </div>
                  <div>
                    <Label>Description *</Label>
                    <Textarea value={accident.description} onChange={(e) => updateAccident(accident.id, 'description', e.target.value)} placeholder="Describe what happened..." required disabled={isSubmitting} />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id={`injuries-${accident.id}`} checked={accident.injuries} onCheckedChange={(checked) => updateAccident(accident.id, 'injuries', !!checked)} disabled={isSubmitting} />
                      <Label htmlFor={`injuries-${accident.id}`} className="cursor-pointer">Injuries occurred</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id={`fatalities-${accident.id}`} checked={accident.fatalities} onCheckedChange={(checked) => updateAccident(accident.id, 'fatalities', !!checked)} disabled={isSubmitting} />
                      <Label htmlFor={`fatalities-${accident.id}`} className="cursor-pointer">Fatalities occurred</Label>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addAccident} disabled={isSubmitting} className="w-full">
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Accident
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commercial Driver's License *</CardTitle>
          <CardDescription>Upload clear photos of both sides of your CDL</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CDL Front *</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {cdlFrontPreview ? (
                  <div className="space-y-2">
                    <img src={cdlFrontPreview} alt="CDL Front" className="max-h-48 mx-auto rounded" />
                    <Button type="button" variant="outline" size="sm" onClick={() => { setCdlFrontFile(null); setCdlFrontPreview(null); }} disabled={isSubmitting}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload</p>
                    <input type="file" accept="image/*" className="hidden" onChange={handleCdlFrontChange} disabled={isSubmitting} />
                  </label>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>CDL Back *</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {cdlBackPreview ? (
                  <div className="space-y-2">
                    <img src={cdlBackPreview} alt="CDL Back" className="max-h-48 mx-auto rounded" />
                    <Button type="button" variant="outline" size="sm" onClick={() => { setCdlBackFile(null); setCdlBackPreview(null); }} disabled={isSubmitting}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload</p>
                    <input type="file" accept="image/*" className="hidden" onChange={handleCdlBackChange} disabled={isSubmitting} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Traffic Violations (Last 12 Months) *</CardTitle>
          <CardDescription>Report all traffic violations in the last 12 months</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="no-violations" checked={!hasViolations} onCheckedChange={(checked) => { setHasViolations(!checked); if (checked) setViolations([]); }} disabled={isSubmitting} />
            <Label htmlFor="no-violations" className="cursor-pointer">
              I certify I have NO traffic violations in the last 12 months
            </Label>
          </div>
          {hasViolations && (
            <>
              {violations.map((violation, index) => (
                <div key={violation.id} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Violation #{index + 1}</h4>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeViolation(violation.id)} disabled={isSubmitting}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date *</Label>
                      <Input type="date" value={violation.date} onChange={(e) => updateViolation(violation.id, 'date', e.target.value)} required disabled={isSubmitting} />
                    </div>
                    <div>
                      <Label>Location *</Label>
                      <Input value={violation.location} onChange={(e) => updateViolation(violation.id, 'location', e.target.value)} placeholder="City, State" required disabled={isSubmitting} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Violation Type *</Label>
                      <Input value={violation.violationType} onChange={(e) => updateViolation(violation.id, 'violationType', e.target.value)} placeholder="Speeding, etc." required disabled={isSubmitting} />
                    </div>
                    <div>
                      <Label>Citation Number</Label>
                      <Input value={violation.citationNumber} onChange={(e) => updateViolation(violation.id, 'citationNumber', e.target.value)} placeholder="12345" disabled={isSubmitting} />
                    </div>
                  </div>
                  <div>
                    <Label>Fine Amount (if applicable)</Label>
                    <Input value={violation.fineAmount} onChange={(e) => updateViolation(violation.id, 'fineAmount', e.target.value)} placeholder="$150" disabled={isSubmitting} />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addViolation} disabled={isSubmitting} className="w-full">
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Violation
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4 justify-end sticky bottom-0 bg-background p-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Do This Later
          </Button>
        )}
        <Button type="submit" variant="accent" disabled={isSubmitting} className="min-w-[200px]">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit for Approval'
          )}
        </Button>
      </div>
    </form>
  );
}
