/**
 * Şifre üretici testleri — set-password ve forgot-password flow'larında kullanılıyor.
 */
import { describe, it, expect } from 'vitest';
import { generateStrongPassword } from '../src/lib/password';

describe('generateStrongPassword', () => {
  it('varsayılan 14 karakter uzunluğunda olmalı', () => {
    const pw = generateStrongPassword();
    expect(pw).toHaveLength(14);
  });

  it('özel uzunluk parametresine uymalı', () => {
    expect(generateStrongPassword(20)).toHaveLength(20);
    expect(generateStrongPassword(8)).toHaveLength(8);
  });

  it('her gruptan en az bir karakter içermeli (lower, upper, digit, sym)', () => {
    // 100 örnek üret ve hepsinde 4 grup garantisi
    for (let i = 0; i < 100; i++) {
      const pw = generateStrongPassword(14);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%&*?]/);
    }
  });

  it('karışan karakterleri içermemeli (0, O, l, 1, I)', () => {
    for (let i = 0; i < 100; i++) {
      const pw = generateStrongPassword(20);
      expect(pw).not.toMatch(/[0Ol1I]/);
    }
  });

  it('iki ardışık üretim aynı olmamalı (entropy kontrolü)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) set.add(generateStrongPassword(14));
    // 50 üretimde en az 49 benzersiz (1/100 milyar düşük olasılık)
    expect(set.size).toBeGreaterThanOrEqual(49);
  });
});
