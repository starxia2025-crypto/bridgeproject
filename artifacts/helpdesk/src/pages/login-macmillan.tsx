import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { BookOpenText, Eye, GraduationCap, Loader2, Lock, Mail, PlugZap, Ticket, UserRoundCheck } from "lucide-react";
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

const featureItems = [
  {
    icon: Ticket,
    title: "Soporte",
    description: "Tickets de consultas,\natencion rapida.",
  },
  {
    icon: BookOpenText,
    title: "Recursos",
    description: "Acceso a guias,\ndocumentacion y mas",
  },
  {
    icon: UserRoundCheck,
    title: "Solicitud de\nasistencia",
    description: "Planificacion y gestion\nde intervenciones",
    accent: true,
  },
  {
    icon: GraduationCap,
    title: "Formacion",
    description: "Capacitacion y\ncontenidos formativos",
  },
  {
    icon: PlugZap,
    title: "API externa",
    description: "Conexion segura con\nnuestros sistemas",
    accent: true,
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

function BridgeWordmark() {
  return (
    <div className="flex items-center gap-4 lg:gap-5">
      <div className="relative h-[74px] w-[132px] shrink-0 lg:h-[86px] lg:w-[154px]">
        <div className="absolute left-[13px] top-0 h-[48px] w-[11px] rounded-full bg-[#082c63] lg:left-[16px] lg:h-[56px] lg:w-[12px]" />
        <div className="absolute left-[53px] top-0 h-[48px] w-[11px] rounded-full bg-[#ff544c] lg:left-[63px] lg:h-[56px] lg:w-[12px]" />
        <div className="absolute left-0 top-[25px] h-[43px] w-[80px] rounded-[999px] border-[8px] border-r-0 border-[#082c63] lg:top-[30px] lg:h-[49px] lg:w-[92px] lg:border-[9px]" />
        <div className="absolute left-[40px] top-[25px] h-[43px] w-[80px] rounded-[999px] border-[8px] border-l-0 border-[#ff6a56] lg:left-[48px] lg:top-[30px] lg:h-[49px] lg:w-[92px] lg:border-[9px]" />
      </div>
      <div>
        <div className="text-[56px] font-bold leading-none tracking-tight text-[#082c63] lg:text-[74px]">Bridge</div>
        <div className="mt-1 text-[22px] leading-tight text-slate-600 lg:text-[28px]">Plataforma de soporte y servicios</div>
      </div>
    </div>
  );
}

export default function MacmillanLogin() {
  const [, setLocation] = useLocation();
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
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
          writeRecentLoginEmails(form.getValues("email"));
        } else {
          window.localStorage.removeItem(RECENT_LOGIN_EMAILS_STORAGE_KEY);
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
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(242,246,252,0.92)_42%,_rgba(232,238,247,0.95)_100%)]">
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 lg:px-6 lg:py-5">
        <div className="absolute inset-x-0 top-0 h-full overflow-hidden pointer-events-none">
          <svg className="absolute right-0 top-0 h-[78%] w-[62%] opacity-55" viewBox="0 0 800 620" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M510 60L730 0L790 130L648 154L585 124L510 60Z" stroke="#8bb8de" strokeWidth="2" />
            <path d="M431 221L560 123L664 156L700 293L598 386L448 341L431 221Z" stroke="#81b9e5" strokeWidth="2" />
            <path d="M269 475L390 373L448 341L598 386L676 470L598 546L426 555L269 475Z" stroke="#7db7e2" strokeWidth="2" />
            <path d="M50 602L211 467L269 475L426 555L278 620H50V602Z" stroke="#b5d4ec" strokeWidth="2" />
            <circle cx="730" cy="0" r="7" fill="#8bb8de" />
            <circle cx="785" cy="131" r="7" fill="#8bb8de" />
            <circle cx="666" cy="156" r="7" fill="#8bb8de" />
            <circle cx="431" cy="221" r="7" fill="#8bb8de" />
            <circle cx="598" cy="386" r="7" fill="#8bb8de" />
            <circle cx="448" cy="341" r="7" fill="#8bb8de" />
            <circle cx="426" cy="555" r="7" fill="#8bb8de" />
          </svg>
          <div className="absolute -left-10 top-36 h-52 w-52 rounded-full border-[10px] border-[#c6dff2] opacity-45" />
          <div className="absolute left-4 top-44 h-10 w-20 rotate-[-38deg] rounded-full border-[4px] border-[#c6dff2] opacity-70" />
          <div className="absolute bottom-16 left-24 h-32 w-32 rounded-full border-[9px] border-[#d8e7f5] opacity-40" />
        </div>

        <div className="relative grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-8">
          <section className="flex min-h-0 flex-col justify-between py-2 lg:py-4">
            <div className="max-w-[760px]">
              <BridgeWordmark />

              <div className="mt-8 lg:mt-10">
                <h1 className="text-[42px] font-bold leading-[1.05] tracking-tight text-[#082c63] lg:text-[60px]">
                  Conectamos a las personas.
                  <span className="mt-1 block text-[#ff5c4d]">Impulsamos soluciones.</span>
                </h1>

                <p className="mt-5 max-w-[700px] text-[18px] leading-[1.45] text-slate-700 lg:text-[21px]">
                  Bridge es la plataforma que conecta a nuestros clientes estrategicos con los equipos, servicios y
                  soluciones de Macmillan Education, ofreciendo una experiencia unificada, agil y orientada al valor.
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {featureItems.map(({ icon: Icon, title, description, accent }) => (
                <div
                  key={title}
                  className={[
                    "rounded-[20px] border px-4 py-4 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]",
                    accent
                      ? "border-sky-200 bg-[linear-gradient(180deg,_rgba(241,249,255,0.96),_rgba(215,239,255,0.9))]"
                      : "border-slate-200 bg-white/92",
                  ].join(" ")}
                >
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-[#082c63] shadow-sm">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </div>
                  <h3 className="whitespace-pre-line text-[16px] font-semibold leading-[1.15] text-[#082c63] lg:text-[17px]">
                    {title}
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-[13px] leading-[1.45] text-slate-700 lg:text-[14px]">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="flex items-center justify-center">
            <div className="w-full rounded-[26px] border border-slate-200/80 bg-white/95 p-7 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] lg:p-8">
              <div className="text-center">
                <h2 className="text-[44px] font-bold tracking-tight text-[#082c63] lg:text-[56px]">Bienvenido</h2>
                <p className="mt-2 text-[16px] text-slate-600 lg:text-[18px]">Inicia sesion para continuar</p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5">
                  {loginMutation.isError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {getLoginErrorMessage()}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[15px] font-semibold text-[#082c63]">Correo Electronico</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <Input
                              placeholder="usuario@macmillan.com"
                              {...field}
                              className="h-12 rounded-xl border-slate-200 pl-12 text-[16px] text-slate-700 placeholder:text-slate-400"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[15px] font-semibold text-[#082c63]">Contrasena</FormLabel>
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
                              className="h-12 rounded-xl border-slate-200 pl-12 pr-12 text-[16px] text-slate-700 placeholder:text-slate-400"
                            />
                            <Eye className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
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
                          <FormLabel className="text-[15px] font-semibold text-[#082c63]">Verificacion de seguridad</FormLabel>
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="mb-2 text-sm font-medium text-amber-900">
                              Resuelve para continuar: <span className="font-bold">{captchaChallenge.question}</span>
                            </p>
                            <FormControl>
                              <Input inputMode="numeric" placeholder="Resultado" {...field} className="h-11 rounded-lg bg-white text-[15px]" />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <FormField
                      control={form.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                              className="h-5 w-5 rounded-md border-slate-300"
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-[14px] font-medium text-slate-700">Recordarme</FormLabel>
                        </FormItem>
                      )}
                    />

                    <Link href="/forgot-password">
                      <span className="cursor-pointer text-[14px] font-medium text-[#2563eb] hover:underline">
                        Olvidaste tu contrasena?
                      </span>
                    </Link>
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl bg-[#0a2d60] text-[18px] font-semibold text-white hover:bg-[#11356c]"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Iniciando sesion
                      </>
                    ) : (
                      "Iniciar sesion"
                    )}
                  </Button>

                  <p className="pt-2 text-center text-[14px] leading-6 text-slate-700">
                    Necesitas ayuda? Contacta con el <span className="font-medium text-[#2563eb]">equipo de soporte</span>
                  </p>
                </form>
              </Form>
            </div>
          </aside>
        </div>

        <footer className="relative mt-4 rounded-[18px] bg-[#082c63] px-5 py-4 text-white">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-[14px] lg:flex-row lg:text-left lg:text-[15px]">
            <div className="flex items-center gap-3">
              <img src={meeLogo} alt="Macmillan Education" className="h-7 w-auto brightness-0 invert" />
              <span className="font-medium">macmillan education</span>
            </div>
            <span className="font-medium">bridge.macmillan.es</span>
            <span>© 2024 Macmillan Education. Todos los derechos reservados.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
