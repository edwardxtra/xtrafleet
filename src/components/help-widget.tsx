'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HelpCircle, Mail, MessageSquare, Book, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const faqs = [
  {
    question: 'How do I add my first driver?',
    answer: 'Click "Add Driver" in the Quick Actions widget or navigate to the Drivers page. You\'ll need to enter their name, contact info, and upload their CDL, medical card, and insurance documents.',
  },
  {
    question: 'How does AI matching work?',
    answer: 'Our AI analyzes your driver qualifications, location, equipment, and load requirements to suggest the best matches. It considers compliance, profitability, and route efficiency.',
  },
  {
    question: 'What documents do I need?',
    answer: 'For drivers: CDL, medical card, and insurance. For loads: origin, destination, rate, and any special requirements. All documents are stored securely and tracked for expiry.',
  },
  {
    question: 'How do I create a TLA?',
    answer: 'Once you accept a match, a Transportation Lease Agreement is automatically generated. Both you and the driver can review and sign it digitally within the platform.',
  },
  {
    question: 'What happens when a document expires?',
    answer: 'XtraFleet automatically sends email warnings 30 days before expiry. The driver will show as "non-compliant" in your dashboard until the document is renewed.',
  },
  {
    question: 'How do I track my revenue?',
    answer: 'Your dashboard shows total revenue, and you can view detailed reports in the Agreements section. All TLAs are tracked with payment status and dates.',
  },
];

const helpResources = [
  {
    title: 'Documentation',
    description: 'Complete guides and tutorials',
    icon: Book,
    href: '#', // Could link to actual docs
  },
  {
    title: 'Contact Support',
    description: 'Get help from our team',
    icon: Mail,
    href: '/dashboard/contact',
  },
  {
    title: 'Live Chat',
    description: 'Chat with support (Mon-Fri 9-5 EST)',
    icon: MessageSquare,
    href: '#', // Could integrate live chat
  },
];

export function HelpWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating Help Button */}
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 hover:scale-110 transition-transform"
      >
        <HelpCircle className="h-6 w-6" />
        <span className="sr-only">Open help</span>
      </Button>

      {/* Help Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">How can we help?</DialogTitle>
            <DialogDescription>
              Find answers to common questions or get in touch with our support team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Quick Resources */}
            <div>
              <h3 className="font-semibold mb-3">Quick Resources</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {helpResources.map((resource) => {
                  const Icon = resource.icon;
                  return (
                    <Link
                      key={resource.title}
                      href={resource.href}
                      className="flex flex-col items-center p-4 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-sm font-medium text-center">{resource.title}</div>
                      <div className="text-xs text-muted-foreground text-center mt-1">
                        {resource.description}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* FAQs */}
            <div>
              <h3 className="font-semibold mb-3">Frequently Asked Questions</h3>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Additional Help */}
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Can't find what you're looking for?{' '}
                <Link 
                  href="/dashboard/contact" 
                  className="text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setOpen(false)}
                >
                  Contact our support team
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
