/**
 * Self-org-signup — kullanıcı kendi şirketini hızlıca açar.
 *
 * Mevcut "/apply-org → admin onay" akışına PARALEL: bu akışta admin onayı
 * beklenmez, kullanıcı anında owner olur. Ücretsiz dönem (trial yok).
 *
 * Akış:
 *  1) supabase.auth.signUp({ email, password, full_name })
 *  2) JWT ile POST /v1/auth/sign-up-org { org_name, full_name, accept_terms }
 *  3) authStore güncelle → ana sayfaya yönlendir
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  Building2,
  User as UserIcon,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

export function SignUpOrgPage() {
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [reveal, setReveal] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      if (orgName.trim().length < 2) throw new Error('Şirket adı en az 2 karakter olmalı');
      if (fullName.trim().length < 2) throw new Error('Ad-Soyad gerekli');
      if (!email.trim()) throw new Error('E-posta gerekli');
      if (password.length < 8) throw new Error('Şifre en az 8 karakter olmalı');
      if (!acceptTerms) throw new Error('KVKK ve Kullanım Şartları\'nı kabul etmelisin');

      const supabase = getSupabase();

      // 1) Supabase auth signup
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw new Error(error.message);
      if (!data.session) {
        throw new Error(
          'E-postana doğrulama linki gönderildi. Onayladıktan sonra tekrar dene.',
        );
      }

      // 2) Backend org + owner oluştur
      const { data: backend } = await api.post('/auth/sign-up-org', {
        org_name: orgName.trim(),
        full_name: fullName.trim(),
        accept_terms: true,
      });

      // 3) AuthStore güncelle
      const { setUser, setOrg, setSession } = useAuthStore.getState();
      setSession(data.session);
      setUser(backend.user);
      setOrg(backend.org);

      return backend;
    },
    onSuccess: () => {
      toast.success('🎉 Şirketin oluşturuldu — hoş geldin!');
      navigate('/', { replace: true });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md card space-y-4">
        <Link
          to="/auth/sign-in"
          className="text-xs text-muted hover:text-orange-600 inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" />
          Giriş'e dön
        </Link>

        <div className="text-center space-y-2">
          <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-white flex items-center justify-center font-display font-bold text-3xl shadow-lg shadow-orange-200">
            D
          </div>
          <h1 className="font-display text-2xl">Şirketini Damga'ya Aç</h1>
          <p className="text-sm text-muted">
            Hızlı self-signup · Anında owner olarak başla
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div>
            <label className="label">Şirket Adı</label>
            <div className="mt-1 relative">
              <Building2 className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input pl-9"
                placeholder="ACME LTD · MANORS HOLDING · ..."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={mut.isPending}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="label">Ad-Soyad</label>
            <div className="mt-1 relative">
              <UserIcon className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input pl-9"
                placeholder="Ahmet Yılmaz"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={mut.isPending}
              />
            </div>
          </div>

          <div>
            <label className="label">Kurumsal E-posta</label>
            <div className="mt-1 relative">
              <Mail className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                autoComplete="email"
                className="input pl-9"
                placeholder="ornek@firma.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mut.isPending}
              />
            </div>
          </div>

          <div>
            <label className="label">Şifre (en az 8 karakter)</label>
            <div className="mt-1 relative">
              <Lock className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={reveal ? 'text' : 'password'}
                autoComplete="new-password"
                className="input pl-9 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={mut.isPending}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost p-1 text-muted"
                tabIndex={-1}
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              disabled={mut.isPending}
              className="mt-0.5 size-4 accent-orange-600"
            />
            <span>
              <Link to="/legal/kvkk" target="_blank" className="text-orange-600 underline">
                KVKK Aydınlatma Metni
              </Link>
              'ni ve{' '}
              <Link to="/legal/terms" target="_blank" className="text-orange-600 underline">
                Kullanım Şartları
              </Link>
              'nı okudum, kabul ediyorum.
            </span>
          </label>

          <button
            type="submit"
            disabled={mut.isPending || !acceptTerms}
            className="btn-primary w-full"
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Şirketi Oluştur
          </button>
        </form>

        <div className="text-center text-xs text-muted">
          Zaten hesabın var mı?{' '}
          <Link to="/auth/sign-in" className="text-orange-600 font-medium hover:underline">
            Giriş yap
          </Link>
        </div>

        <div className="rounded-md bg-orange-50 border border-orange-100 px-3 py-2 text-[11px] text-ink/80 flex items-start gap-1.5">
          <Sparkles className="size-3.5 shrink-0 mt-0.5 text-orange-600" />
          <span>
            Kaydolduğun an: kendi şirket org'unun <strong>owner</strong>'ı olursun.
            Tüm özellikler ücretsiz açık. Daha sonra çalışanlarını davet edebilirsin.
          </span>
        </div>

        <div className="text-center text-[11px] text-muted">
          Kurumsal başvuru ile mi açmak istersin?{' '}
          <Link to="/apply-org" className="text-orange-600 hover:underline">
            Başvuru formu
          </Link>
        </div>
      </div>
    </div>
  );
}
