'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Star } from 'lucide-react';

interface Testimonial {
  name: string;
  role: string;
  company: string;
  content: string;
  rating: number;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    name: 'Michael Rodriguez',
    role: 'Fleet Manager',
    company: 'Rodriguez Trucking LLC',
    content: 'XtraFleet cut our driver matching time from days to minutes. The compliance tracking alone saves us 10+ hours per week. Best investment we\'ve made.',
    rating: 5,
    initials: 'MR',
  },
  {
    name: 'Sarah Chen',
    role: 'Owner-Operator',
    company: 'Chen Logistics',
    content: 'Finally, a platform built for owner-operators. No more juggling spreadsheets and emails. Everything I need is in one place, and the AI matching actually works.',
    rating: 5,
    initials: 'SC',
  },
  {
    name: 'James Thompson',
    role: 'Operations Director',
    company: 'Thompson Freight Solutions',
    content: 'We reduced our load assignment errors by 90% with XtraFleet. The automated document tracking means our drivers are always compliant. Game changer.',
    rating: 5,
    initials: 'JT',
  },
];

export function TestimonialsSection() {
  return (
    <section className="w-full py-12 md:py-24 lg:py-32 bg-muted/50">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl font-headline">
              Trusted by Owner-Operators Nationwide
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              See how fleet owners are saving time and increasing efficiency with XtraFleet.
            </p>
          </div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="relative overflow-hidden">
              <CardContent className="pt-6">
                {/* Rating */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="text-sm leading-relaxed mb-6">
                  "{testimonial.content}"
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {testimonial.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-sm">{testimonial.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {testimonial.role}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {testimonial.company}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Bar */}
        <div className="mt-16 grid gap-8 md:grid-cols-3 text-center">
          <div>
            <div className="text-4xl font-bold text-primary">500+</div>
            <div className="text-sm text-muted-foreground mt-2">Active Fleet Owners</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary">50K+</div>
            <div className="text-sm text-muted-foreground mt-2">Matches Created</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary">98%</div>
            <div className="text-sm text-muted-foreground mt-2">Customer Satisfaction</div>
          </div>
        </div>
      </div>
    </section>
  );
}
