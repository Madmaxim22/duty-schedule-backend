/** «Иванов Иван Петрович» → «Иванов И.П.» */
export function formatSurnameWithInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  const [surname, ...rest] = parts;
  const initials = rest.map((part) => `${part[0]!.toUpperCase()}.`).join('');
  return `${surname} ${initials}`;
}

export function normalizeFio(fio: string): string {
  return fio.trim().replace(/\s+/g, ' ').toLowerCase();
}
