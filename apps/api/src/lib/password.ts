/**
 * Güçlü şifre üretici — set-password, forgot-password ve davet
 * akışlarında kullanılır.
 *
 * Karakter seti: harf+rakam+sembol; karışan karakterler (0,O,l,1,I) çıkarıldı.
 * Her gruptan en az bir karakter garanti edilir.
 *
 * SECURITY: crypto.randomInt kullanılır (Math.random brute-force'a karşı zayıf,
 * ~31 bit entropy verirdi; randomInt 256 bit cryptographic).
 */
import { randomInt } from 'node:crypto';

function pick(set: string): string {
  return set[randomInt(0, set.length)]!;
}

export function generateStrongPassword(length = 14): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digit = '23456789';
  const sym = '!@#$%&*?';
  const all = lower + upper + digit + sym;

  const must = [pick(lower), pick(upper), pick(digit), pick(sym)];
  const rest: string[] = [];
  for (let i = must.length; i < length; i++) {
    rest.push(pick(all));
  }
  const arr = [...must, ...rest];
  // Fisher-Yates shuffle — crypto random
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.join('');
}
