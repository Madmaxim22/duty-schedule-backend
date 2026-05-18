export type DutySectionId = 'A' | 'B';

export type OfficeCode =
  | '51'
  | '52'
  | '53'
  | '54'
  | '31'
  | '32'
  | '33'
  | '34';

export const DUTY_SECTIONS = [
  {
    id: 'A' as const,
    label: 'Секция 1',
    offices: [
      { code: '51' as const, mandatory: true },
      { code: '52' as const, mandatory: true },
      { code: '53' as const, mandatory: false },
      { code: '54' as const, mandatory: false },
    ],
  },
  {
    id: 'B' as const,
    label: 'Секция 2',
    offices: [
      { code: '31' as const, mandatory: true },
      { code: '32' as const, mandatory: true },
      { code: '33' as const, mandatory: false },
      { code: '34' as const, mandatory: false },
    ],
  },
] as const;

const officeMeta = new Map<string, { section: DutySectionId; mandatory: boolean }>();

for (const section of DUTY_SECTIONS) {
  for (const office of section.offices) {
    officeMeta.set(office.code, { section: section.id, mandatory: office.mandatory });
  }
}

export function isValidSlot(section: string, office: string): boolean {
  const meta = officeMeta.get(office);
  return meta !== undefined && meta.section === section;
}

export function isMandatoryOffice(office: string): boolean {
  return officeMeta.get(office)?.mandatory ?? false;
}

export function getAllSlots(): Array<{ section: DutySectionId; office: OfficeCode }> {
  return DUTY_SECTIONS.flatMap((s) =>
    s.offices.map((o) => ({ section: s.id, office: o.code })),
  );
}
