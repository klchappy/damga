/**
 * Güçlü şifre üretici — set-password ve forgot-password (yeni şifre üret + ilet)
 * akışlarında kullanılır.
 *
 * Karakter seti: harf+rakam+sembol; karışan karakterler (0,O,l,1,I) çıkarıldı.
 * Her gruptan en az bir karakter garanti edilir.
 */
export function generateStrongPassword(length = 14): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digit = '23456789';
  const sym = '!@#$%&*?';
  const all = lower + upper + digit + sym;

  const must = [
    lower[Math.floor(Math.random() * lower.length)]!,
    upper[Math.floor(Math.random() * upper.length)]!,
    digit[Math.floor(Math.random() * digit.length)]!,
    sym[Math.floor(Math.random() * sym.length)]!,
  ];
  const rest: string[] = [];
  for (let i = must.length; i < length; i++) {
    rest.push(all[Math.floor(Math.random() * all.length)]!);
  }
  const arr = [...must, ...rest];
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.join('');
}
