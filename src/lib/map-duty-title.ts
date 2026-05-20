import { DUTY_SECTIONS, isValidSlot } from './offices.js';
import type { DutySectionId } from './offices.js';

export function mapDutyTitle(
  title: number | string,
): { section: DutySectionId; office: string } | null {
  const digits = String(title).replace(/\D/g, '');
  if (digits.length < 2) return null;

  const office = digits.slice(-2);
  for (const section of DUTY_SECTIONS) {
    if (isValidSlot(section.id, office)) {
      return { section: section.id, office };
    }
  }
  return null;
}
