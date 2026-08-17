import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface FAQ {
  question: string;
  answer: string;
}

interface FoundersFAQProps {
  faqs: FAQ[];
}

export function FoundersFAQ({ faqs }: FoundersFAQProps) {
  const { t } = useTranslation('common');
  return (
    <section className="py-12">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="mb-3 text-2xl font-bold text-foreground md:text-3xl">Frequently Asked Questions</h2>
      </div>
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-lg border border-border bg-card px-5"
            >
              <AccordionTrigger className="text-left text-foreground hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
