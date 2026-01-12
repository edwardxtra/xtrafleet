import jsPDF from 'jspdf';
import type { TLA } from '@/lib/data';
import { format, parseISO } from 'date-fns';

export function generateTLAPDF(tla: TLA): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let yPos = 25;

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not specified";
    try {
      return format(parseISO(dateString), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateString;
    }
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} minutes`;
    if (mins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
  };

  const addLine = () => {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;
  };

  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      yPos = 20;
    }
  };

  // ========== HEADER ==========
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  const title = 'TRIP LEASE AGREEMENT';
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const subtitle = 'FMCSA-Compliant Short-Term Lease - Driver Only';
  const subtitleWidth = doc.getTextWidth(subtitle);
  doc.text(subtitle, (pageWidth - subtitleWidth) / 2, yPos);
  yPos += 8;

  // Status Badge
  const statusText = tla.status.toUpperCase().replace('_', ' ');
  doc.setFontSize(9);
  const badgeTextWidth = doc.getTextWidth(statusText) + 12;
  const badgeX = (pageWidth - badgeTextWidth) / 2;
  
  const statusColor = tla.status === 'completed' ? [147, 51, 234] : 
                      tla.status === 'signed' ? [22, 163, 74] : 
                      tla.status === 'in_progress' ? [37, 99, 235] : [100, 100, 100];
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(badgeX, yPos - 5, badgeTextWidth, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, badgeX + 6, yPos);
  yPos += 12;

  // Agreement ID and Date
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(`Agreement ID: ${tla.id}`, margin, yPos);
  const createdText = `Created: ${formatDate(tla.createdAt)}`;
  const createdWidth = doc.getTextWidth(createdText);
  doc.text(createdText, pageWidth - margin - createdWidth, yPos);
  yPos += 8;

  addLine();
  yPos += 5;

  // ========== PARTIES ==========
  checkPageBreak(50);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('PARTIES', margin, yPos);
  yPos += 8;

  // Lessor
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Fleet A (Lessor - Driver Provider)', margin, yPos);
  yPos += 5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(tla.lessor.legalName, margin, yPos);
  yPos += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  if (tla.lessor.address) {
    doc.text(tla.lessor.address, margin, yPos);
    yPos += 4;
  }
  if (tla.lessor.dotNumber) {
    doc.text(`DOT: ${tla.lessor.dotNumber}`, margin, yPos);
    yPos += 4;
  }
  if (tla.lessor.mcNumber) {
    doc.text(`MC: ${tla.lessor.mcNumber}`, margin, yPos);
    yPos += 4;
  }
  yPos += 5;

  // Lessee
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Fleet B (Lessee - Hiring Carrier)', margin, yPos);
  yPos += 5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(tla.lessee.legalName, margin, yPos);
  yPos += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  if (tla.lessee.address) {
    doc.text(tla.lessee.address, margin, yPos);
    yPos += 4;
  }
  if (tla.lessee.dotNumber) {
    doc.text(`DOT: ${tla.lessee.dotNumber}`, margin, yPos);
    yPos += 4;
  }
  if (tla.lessee.mcNumber) {
    doc.text(`MC: ${tla.lessee.mcNumber}`, margin, yPos);
    yPos += 4;
  }
  yPos += 8;

  addLine();
  yPos += 5;

  // ========== DRIVER ==========
  checkPageBreak(30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('DRIVER', margin, yPos);
  yPos += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(tla.driver.name, margin, yPos);
  yPos += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  if (tla.driver.cdlNumber) {
    doc.text(`CDL: ${tla.driver.cdlNumber}`, margin, yPos);
    yPos += 4;
  }
  if (tla.driver.cdlState) {
    doc.text(`CDL State: ${tla.driver.cdlState}`, margin, yPos);
    yPos += 4;
  }
  if (tla.driver.medicalCardExpiry) {
    doc.text(`Medical Card Expires: ${formatDate(tla.driver.medicalCardExpiry)}`, margin, yPos);
    yPos += 4;
  }
  yPos += 8;

  addLine();
  yPos += 5;

  // ========== TRIP DETAILS ==========
  checkPageBreak(40);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TRIP DETAILS', margin, yPos);
  yPos += 8;

  const tripDetails = [
    ['Route:', `${tla.trip.origin} → ${tla.trip.destination}`],
    ['Cargo:', tla.trip.cargo || 'Not specified'],
    ['Weight:', `${tla.trip.weight?.toLocaleString() || 0} lbs`],
    ['Start Date:', formatDate(tla.trip.startDate)],
  ];

  doc.setFontSize(10);
  tripDetails.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, margin, yPos);
    doc.setTextColor(0, 0, 0);
    doc.text(value, margin + 35, yPos);
    yPos += 6;
  });
  yPos += 5;

  addLine();
  yPos += 5;

  // ========== PAYMENT ==========
  checkPageBreak(30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('PAYMENT TERMS', margin, yPos);
  yPos += 10;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(`$${tla.payment.amount.toLocaleString()}`, margin, yPos);
  yPos += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Due upon trip completion', margin, yPos);
  yPos += 10;

  addLine();
  yPos += 5;

  // ========== INSURANCE ==========
  checkPageBreak(35);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('INSURANCE & LIABILITY', margin, yPos);
  yPos += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const insuranceText = 'Fleet B assumes liability for all vehicle and driver operations during the trip. Fleet A confirms that the Driver holds a valid CDL, possesses a current medical certificate, and has a compliant driver qualification file.';
  const insuranceLines = doc.splitTextToSize(insuranceText, contentWidth);
  doc.text(insuranceLines, margin, yPos);
  yPos += insuranceLines.length * 4 + 5;

  if (tla.insurance?.option) {
    doc.setFillColor(240, 240, 240);
    const insuranceOptionText = tla.insurance.option === 'existing_policy' 
      ? 'Lessee confirms existing insurance policy covers this trip'
      : 'Lessee elected trip-based coverage';
    doc.roundedRect(margin, yPos - 3, contentWidth, 8, 2, 2, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text('☑ ' + insuranceOptionText, margin + 3, yPos + 2);
    yPos += 12;
  }
  yPos += 3;

  addLine();
  yPos += 5;

  // ========== TRIP TRACKING (if applicable) ==========
  if (tla.tripTracking?.startedAt) {
    checkPageBreak(45);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TRIP TRACKING', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    doc.setTextColor(100, 100, 100);
    doc.text('Started:', margin, yPos);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDate(tla.tripTracking.startedAt), margin + 35, yPos);
    yPos += 6;

    doc.setTextColor(100, 100, 100);
    doc.text('Started By:', margin, yPos);
    doc.setTextColor(0, 0, 0);
    doc.text(tla.tripTracking.startedByName || 'Unknown', margin + 35, yPos);
    yPos += 6;

    if (tla.tripTracking.endedAt) {
      doc.setTextColor(100, 100, 100);
      doc.text('Ended:', margin, yPos);
      doc.setTextColor(0, 0, 0);
      doc.text(formatDate(tla.tripTracking.endedAt), margin + 35, yPos);
      yPos += 6;

      doc.setTextColor(100, 100, 100);
      doc.text('Ended By:', margin, yPos);
      doc.setTextColor(0, 0, 0);
      doc.text(tla.tripTracking.endedByName || 'Unknown', margin + 35, yPos);
      yPos += 6;

      doc.setTextColor(100, 100, 100);
      doc.text('Duration:', margin, yPos);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(formatDuration(tla.tripTracking.durationMinutes || 0), margin + 35, yPos);
      yPos += 6;
    }
    yPos += 5;
    addLine();
    yPos += 5;
  }

  // ========== SIGNATURES ==========
  checkPageBreak(55);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('SIGNATURES', margin, yPos);
  yPos += 10;

  const boxWidth = (contentWidth - 10) / 2;
  const boxHeight = 32;

  // Lessor Signature Box
  if (tla.lessorSignature) {
    doc.setFillColor(240, 253, 244);
  } else {
    doc.setFillColor(250, 250, 250);
  }
  doc.roundedRect(margin, yPos, boxWidth, boxHeight, 3, 3, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Lessor (Driver Owner)', margin + 5, yPos + 7);
  
  if (tla.lessorSignature) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    doc.text(tla.lessorSignature.signedByName, margin + 5, yPos + 16);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(formatDate(tla.lessorSignature.signedAt), margin + 5, yPos + 22);
    doc.setTextColor(22, 163, 74);
    doc.text('✓ Signed', margin + 5, yPos + 28);
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Awaiting signature', margin + 5, yPos + 18);
  }

  // Lessee Signature Box
  const lesseeBoxX = margin + boxWidth + 10;
  if (tla.lesseeSignature) {
    doc.setFillColor(240, 253, 244);
  } else {
    doc.setFillColor(250, 250, 250);
  }
  doc.roundedRect(lesseeBoxX, yPos, boxWidth, boxHeight, 3, 3, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Lessee (Load Owner)', lesseeBoxX + 5, yPos + 7);
  
  if (tla.lesseeSignature) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    doc.text(tla.lesseeSignature.signedByName, lesseeBoxX + 5, yPos + 16);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(formatDate(tla.lesseeSignature.signedAt), lesseeBoxX + 5, yPos + 22);
    doc.setTextColor(22, 163, 74);
    doc.text('✓ Signed', lesseeBoxX + 5, yPos + 28);
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Awaiting signature', lesseeBoxX + 5, yPos + 18);
  }

  yPos += boxHeight + 10;

  // ========== TERMS & CONDITIONS ==========
  checkPageBreak(70);
  addLine();
  yPos += 5;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TERMS & CONDITIONS', margin, yPos);
  yPos += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);

  const terms = [
    'Control: Fleet B has exclusive possession, control, and responsibility for the Driver during the trip.',
    'Indemnification: Each party agrees to indemnify and hold harmless the other against claims caused by its negligence.',
    'Platform: XtraFleet Technologies, Inc. is a neutral technology facilitator and assumes no liability.',
    'Retention: Both parties shall retain documentation for a minimum of three (3) years.',
    'Governing Law: This Agreement is governed by Delaware law and applicable FMCSA regulations.',
  ];

  terms.forEach((term) => {
    checkPageBreak(12);
    const termLines = doc.splitTextToSize('• ' + term, contentWidth);
    doc.text(termLines, margin, yPos);
    yPos += termLines.length * 4 + 2;
  });

  // ========== FOOTER ==========
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated by XtraFleet on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}`, margin, footerY);
  
  const pageText = 'Page 1';
  const pageTextWidth = doc.getTextWidth(pageText);
  doc.text(pageText, pageWidth - margin - pageTextWidth, footerY);

  return doc;
}

export function downloadTLAPDF(tla: TLA) {
  const doc = generateTLAPDF(tla);
  const filename = `TLA-${tla.trip.origin.replace(/[^a-zA-Z0-9]/g, '')}-to-${tla.trip.destination.replace(/[^a-zA-Z0-9]/g, '')}-${tla.id.slice(0, 8)}.pdf`;
  doc.save(filename);
}