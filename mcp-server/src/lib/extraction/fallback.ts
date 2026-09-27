import type { ExtractedFacts } from './types.js';

export function extractElectricityBill(
  content: string,
): ExtractedFacts | null {
  const amountMatch = content.match(/₹\s*([\d,]+)/);
  const dueMatch = content.match(/due[:\s]+([A-Za-z]+\s+\d{1,2})/i);

  if (!amountMatch || !dueMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ''));
  const dueRaw = dueMatch[1].trim();

  const year = new Date().getUTCFullYear();
  const parsed = new Date(Date.UTC(year, 0, 1));
  const monthDayMatch = dueRaw.match(/^([A-Za-z]+)\s+(\d{1,2})$/);

  let dueDate: string | null = null;
  if (monthDayMatch) {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const monthIndex = monthNames.indexOf(monthDayMatch[1].toLowerCase());
    const day = Number(monthDayMatch[2]);
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      parsed.setUTCMonth(monthIndex, day);
      dueDate = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    summary: `Your electricity bill is ₹${amount.toLocaleString('en-IN')} and payment is due ${dueRaw}.`,
    facts: [
      { label: 'Provider', value: 'Electricity Company' },
      { label: 'Amount', value: `₹${amount.toLocaleString('en-IN')}` },
      { label: 'Due date', value: dueRaw },
    ],
    entities: [
      {
        type: 'bill',
        key: 'electricity_bill',
        data: {
          provider: 'Electricity Company',
          amount,
          currency: 'INR',
          dueDate,
        },
      },
    ],
    questionsAnswerableFromSource: [
      'What is the amount?',
      'When is it due?',
      'Who is the provider?',
    ],
  };
}