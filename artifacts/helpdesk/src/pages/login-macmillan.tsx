import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  BookOpenText,
  CheckCircle2,
  GraduationCap,
  Headphones,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { motion } from "framer-motion";
import { getDefaultRouteForRole } from "@/lib/default-route";
import meeLogo from "@/assets/mee-logo.svg";

const loginSchema = z.object({
  email: z.string().email("Introduce un correo electronico valido"),
  password: z.string().min(6, "La contrasena debe tener al menos 6 caracteres"),
  captchaAnswer: z.string().optional(),
  rememberMe: z.boolean(),
});

const RECENT_LOGIN_EMAILS_STORAGE_KEY = "helpdesk-recent-login-emails";
const MAX_RECENT_LOGIN_EMAILS = 5;

type LoginFormValues = z.infer<typeof loginSchema>;
type CaptchaChallenge = {
  question: string;
  token: string;
};

const valueCards = [
  {
    icon: Headphones,
    title: "Soporte",
    description: "Atencion agil y acompanamiento cercano para cada incidencia.",
  },
  {
    icon: Ticket,
    title: "Tickets",
    description: "Seguimiento claro de solicitudes, estados y prioridades.",
  },
  {
    icon: BookOpenText,
    title: "Recursos",
    description: "Guias, documentacion y conocimiento siempre a mano.",
  },
  {
    icon: GraduationCap,
    title: "Formacion",
    description: "Visitas, capacitacion y continuidad para los centros.",
  },
];

function readRecentLoginEmails() {
  try {
    const rawValue = window.localStorage.getItem(RECENT_LOGIN_EMAILS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === "string" && value.includes("@"))
      : [];
  } catch {
    return [];
  }
}

function writeRecentLoginEmails(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return readRecentLoginEmails();

  const nextEmails = [
    normalizedEmail,
    ...readRecentLoginEmails().filter((recentEmail) => recentEmail.toLowerCase() !== normalizedEmail),
  ].slice(0, MAX_RECENT_LOGIN_EMAILS);

  window.localStorage.setItem(RECENT_LOGIN_EMAILS_STORAGE_KEY, JSON.stringify(nextEmails));
  return nextEmails;
}

export default function MacmillanLogin() {
  const [, setLocation] = useLocation();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [recentLoginEmails, setRecentLoginEmails] = useState<string[]>([]);
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", captchaAnswer: "", rememberMe: true },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (response) => {
        setCaptchaChallenge(null);
        form.setValue("captchaAnswer", "");

        if (form.getValues("rememberMe")) {
          setRecentLoginEmails(writeRecentLoginEmails(form.getValues("email")));
        } else {
          window.localStorage.removeItem(RECENT_LOGIN_EMAILS_STORAGE_KEY);
          setRecentLoginEmails([]);
        }

        setLocation(response.mustChangePassword ? "/change-password" : getDefaultRouteForRole(response.role));
      },
      onError: (error) => {
        const data = (error as any)?.data;
        if (data?.captchaRequired && data?.captcha?.question && data?.captcha?.token) {
          setCaptchaChallenge(data.captcha);
          form.setValue("captchaAnswer", "");
        }
      },
    },
  });

  useEffect(() => {
    const emails = readRecentLoginEmails();
    setRecentLoginEmails(emails);
    if (emails[0] && !form.getValues("email")) {
      form.setValue("email", emails[0], { shouldValidate: false });
    }
  }, [form]);

  function onSubmit(data: LoginFormValues) {
    if (captchaChallenge && !data.captchaAnswer?.trim()) {
      form.setError("captchaAnswer", { message: "Resuelve el captcha para continuar" });
      return;
    }

    loginMutation.mutate({
      data: {
        email: data.email,
        password: data.password,
        captchaAnswer: data.captchaAnswer,
        captchaToken: captchaChallenge?.token,
      },
    });
  }

  function selectRecentLoginEmail(email: string) {
    form.setValue("email", email, { shouldDirty: true, shouldValidate: true });
    passwordInputRef.current?.focus();
  }

  function clearRecentLoginEmails() {
    window.localStorage.removeItem(RECENT_LOGIN_EMAILS_STORAGE_KEY);
    setRecentLoginEmails([]);
  }

  function getLoginErrorMessage() {
    const rawMessage = loginMutation.error?.message || "";

    if (
      rawMessage.includes("401") ||
      rawMessage.includes("429") ||
      rawMessage.toLowerCase().includes("credenciales")
    ) {
      return "Credenciales no validas";
    }

    if (rawMessage.toLowerCase().includes("failed to fetch")) {
      return "No se pudo conectar con el servidor. Intentalo de nuevo en unos segundos.";
    }

    return "No se pudo iniciar sesion. Revisa tus datos e intentalo de nuevo.";
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef3f9_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.025)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-6 lg:px-10 lg:py-8">
        <div className="grid min-h-[calc(100vh-3rem)] gap-8 lg:grid-cols-[minmax(0,1.08fr)_480px]">
          <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/76 p-7 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.35)] backdrop-blur xl:p-10">
            <div className="absolute -left-24 top-8 h-56 w-56 rounded-full bg-[#ef4444]/12 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#0f274d]/10 blur-3xl" />

            <div className="relative flex h-full flex-col">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-white shadow-[0_20px_45px_-28px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/80">
                  <img src={meeLogo} alt="Macmillan Education" className="h-10 w-auto object-contain" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-400">Bridge</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Plataforma de soporte y servicios</p>
                </div>
              </div>

              <div className="mt-12 max-w-3xl">
                <motion.h1
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  className="text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl xl:text-6xl"
                >
                  Conectamos a las personas.
                  <span className="mt-2 block text-[#ef4444]">Impulsamos soluciones.</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.08 }}
                  className="mt-6 max-w-2xl text-lg leading-8 text-slate-600"
                >
                  Bridge centraliza el soporte de Macmillan Education para clientes, colegios y equipos internos en
                  un espacio claro, agil y preparado para el seguimiento diario.
                </motion.p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/88 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <ShieldCheck className="h-4 w-4 text-[#0f274d]" />
                  Acceso seguro
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/88 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <CheckCircle2 className="h-4 w-4 text-[#ef4444]" />
                  Soporte centralizado
                </div>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {valueCards.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.45)] backdrop-blur"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-auto hidden pt-10 text-sm text-slate-500 lg:block">
                <div className="flex items-center justify-between gap-4 border-t border-slate-200/80 pt-6">
                  <span>Macmillan Education</span>
                  <span>bridge.macmillan.es</span>
                  <span>© {new Date().getFullYear()} Todos los derechos reservados.</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="flex items-center justify-center">
            <div className="w-full rounded-[32px] border border-white/80 bg-white/88 p-7 shadow-[0_32px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur sm:p-9">
              <div className="mb-8 flex items-center gap-4 lg:hidden">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-50 ring-1 ring-slate-200">
                  <img src={meeLogo} alt="Macmillan Education" className="h-8 w-auto object-contain" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Bridge</p>
                  <p className="text-lg font-semibold text-slate-950">Plataforma de soporte</p>
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-4xl font-semibold tracking-tight text-slate-950">Bienvenido</h2>
                <p className="mt-3 text-base text-slate-500">Inicia sesion para continuar</p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
                  {loginMutation.isError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {getLoginErrorMessage()}
                    </div>
                  )}

                  <div className="space-y-5">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold text-slate-700">Correo electronico</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                              <Input
                                placeholder="usuario@macmillan.com"
                                {...field}
                                className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base shadow-none"
                              />
                            </div>
                          </FormControl>
                          {recentLoginEmails.length > 0 && (
                            <div className="pt-2">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                  Usuarios recientes
                                </p>
                                <button
                                  type="button"
                                  onClick={clearRecentLoginEmails}
                                  className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-700"
                                >
                                  Limpiar
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {recentLoginEmails.map((email) => (
                                  <button
                                    key={email}
                                    type="button"
                                    onClick={() => selectRecentLoginEmail(email)}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
                                  >
                                    {email}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-4">
                            <FormLabel className="text-sm font-semibold text-slate-700">Contrasena</FormLabel>
                            <Link href="/forgot-password">
                              <span className="cursor-pointer text-sm font-medium text-[#2563eb] hover:underline">
                                Has olvidado tu contrasena?
                              </span>
                            </Link>
                          </div>
                          <FormControl>
                            <div className="relative">
                              <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                              <Input
                                type="password"
                                placeholder="••••••••••"
                                {...field}
                                ref={(element) => {
                                  field.ref(element);
                                  passwordInputRef.current = element;
                                }}
                                className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base shadow-none"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {captchaChallenge && (
                      <FormField
                        control={form.control}
                        name="captchaAnswer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold text-slate-700">Verificacion de seguridad</FormLabel>
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                              <p className="mb-3 text-sm font-medium text-amber-900">
                                Resuelve para continuar: <span className="font-bold">{captchaChallenge.question}</span>
                              </p>
                              <FormControl>
                                <Input
                                  inputMode="numeric"
                                  placeholder="Resultado"
                                  {...field}
                                  className="h-12 rounded-xl border-amber-200 bg-white"
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 text-sm">
                    <FormField
                      control={form.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                          </FormControl>
                          <FormLabel className="cursor-pointer font-medium text-slate-600">Recordarme</FormLabel>
                        </FormItem>
                      )}
                    />
                    <span className="text-slate-400">Acceso para usuarios autorizados</span>
                  </div>

                  <Button
                    type="submit"
                    className="h-14 w-full rounded-2xl bg-[#0f274d] text-base font-semibold text-white transition hover:bg-[#102f5d]"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Iniciando sesion...
                      </>
                    ) : (
                      "Iniciar sesion"
                    )}
                  </Button>

                  <div className="space-y-4 pt-1">
                    <Separator className="bg-slate-200" />
                    <p className="text-center text-sm leading-6 text-slate-500">
                      Necesitas ayuda? Contacta con el <span className="font-medium text-[#2563eb]">equipo de soporte</span>.
                    </p>
                  </div>
                </form>
              </Form>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
