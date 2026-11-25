import { useState } from 'react';
import { FAQ_ITEMS } from '../../faqItems';

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-100">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-7 md:mb-14">
          <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950">
            常見問題
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((faq, index) => (
            <div
              key={index}
              className="bg-background-50 border border-background-200/70 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between gap-4 p-4 md:p-5 text-left"
              >
                <span className="font-heading text-sm md:text-base font-medium text-foreground-950">
                  {faq.question}
                </span>
                <i
                  className={`ri-arrow-down-s-line text-xl text-primary-500 shrink-0 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <div className="px-4 md:px-5 pb-4 md:pb-5">
                  <p className="text-sm text-foreground-600 leading-relaxed border-t border-background-200/70 pt-3">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}