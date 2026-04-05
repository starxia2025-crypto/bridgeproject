import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ApiError,
  customFetch,
  useCreateTicket,
  useGetTenant,
  useListTenants,
  useGetMe,
  TicketPriority,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, RefreshCcw, TriangleAlert, Building2, Undo2, BookX } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const educationTicketSchema = z.object({
  studentEmail: z.string().trim().email("Indica el correo del alumno"),
  schoolId: z.coerce.number().optional(),
  reporterEmail: z.union([z.literal(""), z.string().trim().email("Indica un correo valido")]).optional(),
  subjectType: z.enum(["Alumno", "Docente", "SobreMiCuenta"]).optional(),
  studentEnrollment: z.string().optional(),
  stage: z.string().optional(),
  course: z.string().optional(),
  subject: z.enum(["Inglés", "Alemán", "Francés", "Todas"]).optional(),
  inquiryType: z.enum(["Alumno sin libros", "No puede acceder", "Problemas de activación", "No funciona el libro", "Otro"]).optional(),
  description: z.string().optional(),
  observations: z.string().optional(),
  priority: z.enum(["baja", "media", "alta", "urgente"] as const).optional(),
  tenantId: z.coerce.number().optional(),
}).superRefine((values, ctx) => {
  if (!values.subjectType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subjectType"],
      message: "Selecciona si la consulta es sobre un alumno, un docente o sobre tu cuenta",
    });
  }
  if (!values.schoolId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["schoolId"],
      message: "Selecciona el colegio",
    });
  }
  if (values.subjectType === "Alumno" && !values.studentEnrollment?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["studentEnrollment"],
      message: "La matrícula es obligatoria cuando la consulta es sobre un alumno",
    });
  }
  if (values.subjectType === "Alumno" && !values.stage?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stage"],
      message: "Indica la etapa educativa",
    });
  }
  if (values.subjectType === "Alumno" && !values.course?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["course"],
      message: "Indica el curso",
    });
  }
});

type EducationTicketFormValues = z.infer<typeof educationTicketSchema>;

type MochilaLookupResult = {
  studentEmail: string;
  studentName: string | null;
  studentSurname: string | null;
  studentUser: string | null;
  studentPassword: string | null;
  token: string | null;
  schools: string[];
  records: Array<{
    schoolName: string | null;
    studentName: string | null;
    studentSurname: string | null;
    studentEmail: string | null;
    studentUser: string | null;
    studentPassword: string | null;
    token: string | null;
    description: string | null;
    ean: string | null;
    idOrder: string | null;
    idConsignaOrder: number;
    esGoogle: boolean | null;
  }>;
};

type ReturnCandidate = {
  key: string;
  description: string;
  isbn: string;
  orderId: string;
  google: string;
  bookCode: string;
};
type StudentLineAction = "return" | "missing_book";

const FORGOT_PASSWORD_URL = "https://identity.macmillaneducationeverywhere.com/forgot-password?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3D21%26redirect_uri%3Dhttps%253A%252F%252Fliveapi.macmillaneducationeverywhere.com%252Fapi%252Foidcintegration%252Fcode%26response_type%3Dcode%26scope%3Dopenid%2520profile%2520offline_access%26code_challenge_method%3DS256%26code_challenge%3Dno-81rQrMJwoLhRrryqaEx7ZBNWokrmhhAD98uIz5fo%26state%3Daf32b1c7-a894-47d9-842f-73d9fff373f7";
const BLINK_PASSWORD_URL = "https://www.blinklearning.com/v/1774948299/themes/tmpux/launch.php";

function inferMochilaDescription(record: MochilaLookupResult["records"][number]) {
  if (record.description?.trim()) return record.description.trim();
  return (record.token?.trim().length ?? 0) > 15 ? "Inglés" : "Francés/Alemán";
}

function getInitials(name: string | null, surname: string | null, fallbackEmail: string | null) {
  const fullName = [name, surname].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  const fallback = fallbackEmail?.trim() || "";
  return fallback.slice(0, 2).toUpperCase() || "AL";
}

export default function NewEducationTicket() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const [mochilaLookup, setMochilaLookup] = useState<MochilaLookupResult | null>(null);
  const [mochilaLookupError, setMochilaLookupError] = useState<string | null>(null);
  const [isLookingUpMochila, setIsLookingUpMochila] = useState(false);
  const [mochilaActivationSuggested, setMochilaActivationSuggested] = useState(false);
  const [, setMochilaLookupMode] = useState<"email" | "order">("email");
  const [mochilaOrderId, setMochilaOrderId] = useState("");
  const [showTeacherRegistrationRequest, setShowTeacherRegistrationRequest] = useState(false);
  const [teacherRegistrationNotes, setTeacherRegistrationNotes] = useState("");
  const [selectedLineActions, setSelectedLineActions] = useState<Record<string, StudentLineAction[]>>({});

  const { data: tenants } = useListTenants(
    { limit: 100 },
    { query: { enabled: user?.role === "superadmin" || user?.role === "tecnico" } },
  );
  const { data: currentTenant } = useGetTenant(user?.tenantId ?? 0, {
    query: { enabled: !!user?.tenantId && user?.role !== "superadmin" && user?.role !== "tecnico" },
  });

  const availableTenants = user?.role === "superadmin" || user?.role === "tecnico"
    ? tenants?.data ?? []
    : currentTenant ? [currentTenant] : [];

  const form = useForm<EducationTicketFormValues>({
    resolver: zodResolver(educationTicketSchema),
    defaultValues: {
      studentEmail: "",
      schoolId: user?.schoolId ?? undefined,
      reporterEmail: "",
      subjectType: undefined,
      studentEnrollment: "",
      stage: "",
      course: "",
      subject: "Inglés",
      inquiryType: "Alumno sin libros",
      description: "",
      observations: "",
      priority: "media",
      tenantId: user?.tenantId ?? undefined,
    },
  });

  const selectedTenantId = form.watch("tenantId");
  const selectedSchoolId = form.watch("schoolId");
  const studentEmail = form.watch("studentEmail");
  const subjectType = form.watch("subjectType");
  const supportsTeacherSubject = ["visor_cliente", "admin_cliente", "manager"].includes(user?.role || "");
  const isTeacherSubject = subjectType === "Docente";
  const isOwnAccountSubject = subjectType === "SobreMiCuenta";
  const hasSelectedSubjectType =
    subjectType === "Alumno" || isTeacherSubject || isOwnAccountSubject;
  const usesSchoolReporterFlow = user?.role === "usuario_cliente" || user?.role === "visor_cliente";
  const useSessionSchool = user?.scopeType === "school" || usesSchoolReporterFlow;
  const hideReporterEmailField = usesSchoolReporterFlow;
  const selectedTenant =
    availableTenants.find((tenant) => tenant.id === selectedTenantId) ??
    availableTenants.find((tenant) => tenant.id === user?.tenantId) ??
    currentTenant;
  const tenantPanelBackground = (user as any)?.tenantSidebarBackgroundColor || selectedTenant?.sidebarBackgroundColor || "#0f172a";
  const tenantPanelText = (user as any)?.tenantSidebarTextColor || selectedTenant?.sidebarTextColor || "#ffffff";
  const tenantPanelMuted = tenantPanelText === "#ffffff" || tenantPanelText === "#f8fafc" ? "rgba(255,255,255,0.78)" : "rgba(15,23,42,0.72)";
  const tenantPanelBorder = tenantPanelText === "#ffffff" || tenantPanelText === "#f8fafc" ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.1)";
    const panelInputStyle = {
      backgroundColor: "#ffffff",
      borderColor: "rgba(255,255,255,0.92)",
      color: "#0f172a",
      caretColor: "#0f172a",
      ["--autofill-bg" as string]: "#ffffff",
      ["--autofill-color" as string]: "#0f172a",
    } as const;
  const mochilasPanelBackground = tenantPanelBackground;
  const mochilasPanelBorder = tenantPanelBorder;
  const mochilasEnabled = Boolean(selectedTenant?.hasMochilasAccess ?? (user as any)?.tenantHasMochilasAccess);
  const orderLookupEnabled = Boolean(selectedTenant?.hasOrderLookup ?? (user as any)?.tenantHasOrderLookup);
  const returnsEnabled = Boolean(
    selectedTenant?.hasReturnsAccess ??
      (selectedTenant as any)?.has_returns_access ??
      (user as any)?.tenantHasReturnsAccess ??
      (user as any)?.tenant_has_returns_access
  );
  const shouldShowMochilasLookup = hasSelectedSubjectType && subjectType === "Alumno" && (mochilasEnabled || orderLookupEnabled || useSessionSchool);
  const tenantSchools = (selectedTenant?.schools ?? []).filter((school) => school.active);
  const selectedSchool = tenantSchools.find((school) => school.id === selectedSchoolId);
  const shouldUseSimplifiedAlumnoFlow = subjectType === "Alumno" && shouldShowMochilasLookup && !!mochilaLookup;
  const shouldHideExtendedFields =
    !hasSelectedSubjectType ||
    isTeacherSubject ||
    isOwnAccountSubject ||
    shouldUseSimplifiedAlumnoFlow ||
    (subjectType === "Alumno" && shouldShowMochilasLookup && !mochilaLookup);
  const shouldShowTeacherTicketFields = isTeacherSubject;
  const canSubmitForm = shouldShowTeacherTicketFields || !shouldHideExtendedFields || shouldUseSimplifiedAlumnoFlow;
  const summarizedMochilaRecords = useMemo(() => {
    if (!mochilaLookup) return [];

    return mochilaLookup.records.map((record, index) => ({
      key: `${record.idConsignaOrder}-${record.ean?.trim() || "-"}-${record.token?.trim() || "-"}-${index}`,
      description: inferMochilaDescription(record),
      isbn: record.ean?.trim() || "-",
      orderId: record.idOrder?.trim() || String(record.idConsignaOrder),
      google: record.esGoogle === null ? "-" : record.esGoogle ? "Si" : "No",
      bookCode: record.token?.trim() || "-",
    }));
  }, [mochilaLookup]);
  const selectedActionItems = useMemo(
    () =>
      summarizedMochilaRecords
        .filter((record) => (selectedLineActions[record.key] ?? []).length > 0)
        .map((record) => ({
          ...record,
          actions: selectedLineActions[record.key] ?? [],
        })),
    [selectedLineActions, summarizedMochilaRecords]
  );
  const selectedReturnItems = useMemo(
    () => selectedActionItems.filter((record) => record.actions.includes("return")),
    [selectedActionItems]
  );
  const studentEnglishCredential = useMemo(() => {
    if (!mochilaLookup) return null;

    const record = mochilaLookup.records.find((item) => (item.token?.trim().length ?? 0) > 15);
    if (!record) return null;

    return {
      user: record.studentUser?.trim() || mochilaLookup.studentUser || null,
      password: record.studentPassword?.trim() || null,
    };
  }, [mochilaLookup]);
  const studentBlinkCredential = useMemo(() => {
    if (!mochilaLookup) return null;

    const record = mochilaLookup.records.find((item) => (item.token?.trim().length ?? 0) <= 15);
    if (!record) return null;

    return {
      user: record.studentUser?.trim() || mochilaLookup.studentUser || null,
      password: record.studentPassword?.trim() || null,
    };
  }, [mochilaLookup]);

  useEffect(() => {
    if (!user) return;

    if (user.tenantId) {
      form.setValue("tenantId", user.tenantId);
    }

    if (useSessionSchool && user.schoolId) {
      form.setValue("schoolId", user.schoolId);
    }

    if (hideReporterEmailField && user.email) {
      form.setValue("reporterEmail", user.email);
    }

    if (subjectType === "SobreMiCuenta" && user.email) {
      form.setValue("studentEmail", user.email);
    }
  }, [form, hideReporterEmailField, subjectType, useSessionSchool, user]);

  useEffect(() => {
    if (subjectType !== "Alumno") {
      setMochilaLookupMode("email");
      setMochilaOrderId("");
    }
  }, [subjectType]);

  useEffect(() => {
    if (subjectType !== "Alumno") return;
    if (!(mochilasEnabled || useSessionSchool) && orderLookupEnabled) {
      setMochilaLookupMode("order");
    }
  }, [mochilasEnabled, orderLookupEnabled, subjectType, useSessionSchool]);

  const createMutation = useCreateTicket({
    mutation: {
      onSuccess: (data) => {
        setLocation(`/tickets/${data.id}`);
      },
    },
  });

  const quickAccessIssueMutation = useCreateTicket({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Consulta creada",
          description: "Hemos registrado la incidencia de acceso y te llevamos al listado de tickets.",
        });
        setLocation("/tickets");
      },
      onError: (error) => {
        toast({
          title: "No se pudo crear la consulta",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    },
  });

  async function lookupStudentInMochilas() {
    const normalizedEmail = studentEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      form.setError("studentEmail", {
        type: "manual",
        message: "Indica el correo del alumno",
      });
      return;
    }

    setIsLookingUpMochila(true);
    setMochilaLookup(null);
    setMochilaLookupError(null);
    setMochilaActivationSuggested(false);
    setSelectedLineActions({});

    try {
      const params = new URLSearchParams({ email: normalizedEmail });
      const effectiveTenantId = selectedTenantId || user?.tenantId;
      if (effectiveTenantId) {
        params.set("tenantId", String(effectiveTenantId));
      }

      const result = await customFetch<MochilaLookupResult>(`/api/tickets/mochilas/student?${params.toString()}`);
      setMochilaLookup(result);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 404
          ? "No existe informacion del alumno en Mochilas o su compra aun no ha sido activada."
          : error instanceof Error
            ? error.message
            : "No se pudo consultar la informacion de Mochilas.";

      if (error instanceof ApiError && error.status === 404) {
        setMochilaActivationSuggested(true);
      }

      setMochilaLookupError(message);
      toast({
        title: "No se pudo consultar Mochilas",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLookingUpMochila(false);
    }
  }

  async function lookupStudentByOrderInMochilas() {
    const normalizedOrderId = mochilaOrderId.trim();
    if (!normalizedOrderId) {
      setMochilaLookupError("Indica un pedido valido.");
      return;
    }

    setIsLookingUpMochila(true);
    setMochilaLookup(null);
    setMochilaLookupError(null);
    setMochilaActivationSuggested(false);
    setSelectedLineActions({});

    try {
      const params = new URLSearchParams({ orderId: normalizedOrderId });
      const effectiveTenantId = selectedTenantId || user?.tenantId;
      if (effectiveTenantId) {
        params.set("tenantId", String(effectiveTenantId));
      }

      const result = await customFetch<MochilaLookupResult>(`/api/tickets/mochilas/order?${params.toString()}`);
      setMochilaLookup(result);
      if (result.studentEmail) {
        form.setValue("studentEmail", result.studentEmail);
      }
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 404
          ? "Pedido no encontrado. No es mochila, o no ha sido procesado aun."
          : "No se pudo consultar la informacion del pedido en Mochilas.";

      setMochilaLookupError(message);
      toast({
        title: "No se pudo consultar el pedido",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLookingUpMochila(false);
    }
  }

  async function openRecoveryUrl(url: string, email: string, successTitle: string, successDescription: string) {
    if (!email) {
      form.setError("studentEmail", {
        type: "manual",
        message: subjectType === "Docente" ? "Indica primero el email de acceso del docente" : "Indica primero el correo del alumno",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      toast({
        title: successTitle,
        description: successDescription,
      });
    } catch {
      toast({
        title: "Abriendo recuperación de contraseña",
        description: "Si no se copia automáticamente, pégalo manualmente en la página externa.",
      });
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleForgotTeacherEnglishPassword() {
    await openRecoveryUrl(
      FORGOT_PASSWORD_URL,
      studentEmail.trim(),
      "Correo del docente copiado",
      "Se ha copiado el email de acceso del docente para que puedas pegarlo en la pantalla de recuperación."
    );
  }

  async function handleForgotTeacherBlinkPassword() {
    await openRecoveryUrl(
      BLINK_PASSWORD_URL,
      studentEmail.trim(),
      "Correo del docente copiado",
      "Se ha copiado el email de acceso del docente para que puedas pegarlo en BlinkLearning."
    );
  }

  async function handleForgotStudentEnglishPassword() {
    await openRecoveryUrl(
      FORGOT_PASSWORD_URL,
      mochilaLookup?.studentEmail?.trim() || studentEmail.trim(),
      "Correo del alumno copiado",
      "Se ha copiado el email del alumno para que puedas pegarlo en la recuperación de contraseña de Inglés."
    );
  }

  async function handleForgotStudentBlinkPassword() {
    await openRecoveryUrl(
      BLINK_PASSWORD_URL,
      mochilaLookup?.studentEmail?.trim() || studentEmail.trim(),
      "Correo del alumno copiado",
      "Se ha copiado el email del alumno para que puedas pegarlo en BlinkLearning."
    );
  }

  function handleChangeStudentEmail() {
    toast({
      title: "Cambio de email pendiente",
      description: "La funcionalidad para cambiar el email del alumno la configuraremos en el siguiente paso.",
    });
  }

  function createTeacherRegistrationTicket() {
    const teacherEmail = (user?.email || studentEmail).trim().toLowerCase();
    if (!teacherEmail) {
      toast({
        title: "No se pudo crear la solicitud",
        description: "No hemos podido identificar el correo del docente que solicita el alta.",
        variant: "destructive",
      });
      return;
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? (selectedTenantId as number)
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (selectedSchoolId as number);

    quickAccessIssueMutation.mutate({
      data: {
        title: `${schoolName} - Solicitud de alta docente`,
        description: [
          `Colegio: ${schoolName}`,
          `Docente: ${teacherEmail}`,
          `Informador: ${user?.email ?? "-"}`,
          "Motivo: El docente solicita alta o activacion inicial de acceso.",
          teacherRegistrationNotes.trim() ? `Datos facilitados: ${teacherRegistrationNotes.trim()}` : null,
        ].filter(Boolean).join("\n"),
        priority: TicketPriority.media,
        category: "alta_docente",
        customFields: {
          school: schoolName,
          teacherEmail,
          affectedEmail: teacherEmail,
          reporterEmail: user?.email ?? null,
          subjectType: "Docente",
          inquiryType: "Solicitud de alta",
          teacherRegistrationRequested: true,
          teacherRegistrationNotes: teacherRegistrationNotes.trim() || null,
        },
        tenantId,
        schoolId,
      },
    });
  }

  function createAccessIssueTicket() {
    const normalizedStudentEmail = (mochilaLookup?.studentEmail || form.getValues("studentEmail")).trim().toLowerCase();
    if (!normalizedStudentEmail) {
      form.setError("studentEmail", {
        type: "manual",
        message: subjectType === "Docente" ? "Indica primero el email de acceso del docente" : "Indica primero el correo del alumno",
      });
      return;
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? (selectedTenantId as number)
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (selectedSchoolId as number);

    quickAccessIssueMutation.mutate({
      data: {
        title: `${schoolName} - ${subjectType === "Docente" ? "El docente" : subjectType === "SobreMiCuenta" ? "El usuario" : "El alumno"} aun continua sin poder acceder`,
        description: [
          `Colegio: ${schoolName}`,
          `${subjectType}: ${normalizedStudentEmail}`,
          `Informador: ${user?.email ?? "-"}`,
          `Motivo: Tras la revision inicial y la recuperacion de contrasena, ${subjectType === "Docente" ? "el docente" : subjectType === "SobreMiCuenta" ? "el usuario" : "el alumno"} aun no puede acceder.`,
          "Accion solicitada: Revision tecnica prioritaria del acceso en Mochilas.",
        ].join("\n"),
        priority: TicketPriority.alta,
        category: "seguimiento_acceso_mochilas",
        customFields: {
          school: schoolName,
          studentEmail: subjectType === "Alumno" ? normalizedStudentEmail : null,
          teacherEmail: subjectType === "Docente" ? normalizedStudentEmail : null,
          affectedEmail: normalizedStudentEmail,
          reporterEmail: user?.email ?? null,
          subjectType,
          inquiryType: "No puede acceder",
          mochilaLookup,
          accessFollowUpRequested: true,
        },
        tenantId,
        schoolId,
      },
    });
  }

  function createUrgentActivationTicket() {
    const normalizedStudentEmail = form.getValues("studentEmail").trim().toLowerCase();
    if (!normalizedStudentEmail) {
      form.setError("studentEmail", {
        type: "manual",
        message: "Indica el correo del alumno",
      });
      return;
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? (selectedTenantId as number)
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (selectedSchoolId as number);

    createMutation.mutate({
      data: {
        title: `${schoolName} - Solicitud de activacion urgente`,
        description: [
          `Colegio: ${schoolName}`,
          `Alumno: ${normalizedStudentEmail}`,
          `Informador: ${user?.email ?? "-"}`,
          "Motivo: El alumno no aparece aun en Mochilas o su compra todavia no ha sido activada.",
          "Accion solicitada: Revision y activacion urgente del acceso.",
        ].join("\n"),
        priority: TicketPriority.urgente,
        category: "activacion_mochilas",
        customFields: {
          school: schoolName,
          studentEmail: normalizedStudentEmail,
          reporterEmail: user?.email ?? null,
          inquiryType: "Problemas de activación",
          mochilaLookup: null,
          activationRequested: true,
        },
        tenantId,
        schoolId,
      },
    });
  }

  function toggleLineAction(itemKey: string, action: StudentLineAction) {
    setSelectedLineActions((current) => {
      const activeActions = current[itemKey] ?? [];
      const nextActions = activeActions.includes(action)
        ? activeActions.filter((item) => item !== action)
        : [...activeActions, action];

      if (nextActions.length === 0) {
        const { [itemKey]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [itemKey]: nextActions,
      };
    });
  }

  function resetMochilasLookupState() {
    setMochilaLookup(null);
    setMochilaLookupError(null);
    setMochilaActivationSuggested(false);
    setSelectedLineActions({});
    setMochilaOrderId("");
  }

  function onSubmit(data: EducationTicketFormValues) {
    if (data.subjectType === "Docente" && !data.description?.trim()) {
      form.setError("description", {
        type: "manual",
        message: "Describe brevemente lo que le sucede al docente",
      });
      return;
    }

    if (subjectType === "Alumno" && shouldShowMochilasLookup) {
      const normalizedStudentEmail = data.studentEmail.trim().toLowerCase();
      if (!mochilaLookup || mochilaLookup.studentEmail !== normalizedStudentEmail) {
        toast({
          title: "Consulta Mochilas pendiente",
          description: "Busca primero el alumno por su correo para cargar los datos de Mochilas antes de crear el ticket.",
          variant: "destructive",
        });
        return;
      }
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? data.tenantId!
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (data.schoolId as number);

    const reporterEmail = hideReporterEmailField
      ? (user?.email ?? null)
      : (data.reporterEmail?.trim().toLowerCase() || null);

    const normalizedAffectedEmail = data.studentEmail.trim().toLowerCase();
    const selectedIssueLabels = selectedActionItems.flatMap((item) =>
      item.actions.map((action) => (action === "return" ? "Devolución" : "No ve el libro"))
    );
    const primaryIssueLabel = selectedIssueLabels[0] || data.inquiryType || "Consulta sobre libros";
    const title =
      data.subjectType === "Docente"
        ? `${schoolName} - El docente no puede acceder`
        : `${schoolName} - ${primaryIssueLabel}`;
    const description = data.subjectType === "Docente"
      ? [
          `Colegio: ${schoolName}`,
          `Docente: ${normalizedAffectedEmail}`,
          reporterEmail ? `Informador: ${reporterEmail}` : null,
          "Consulta sobre: Docente",
          `Prioridad: ${data.priority ?? TicketPriority.media}`,
          `Descripción: ${data.description}`,
        ].filter(Boolean).join("\n")
      : shouldUseSimplifiedAlumnoFlow
      ? [
          `Colegio: ${schoolName}`,
          `Alumno: ${normalizedAffectedEmail}`,
          reporterEmail ? `Informador: ${reporterEmail}` : null,
          "Consulta sobre: Alumno",
          selectedActionItems.length > 0
            ? `Acciones seleccionadas: ${selectedActionItems
                .map((item) => `${item.description} (${item.actions.map((action) => (action === "return" ? "Devolución" : "No ve el libro")).join(", ")})`)
                .join(" | ")}`
            : `Motivo principal: ${primaryIssueLabel}`,
          data.observations?.trim() ? `Observaciones: ${data.observations.trim()}` : null,
        ].filter(Boolean).join("\n")
      : [
          `Colegio: ${schoolName}`,
          `${data.subjectType}: ${normalizedAffectedEmail}`,
          reporterEmail ? `Informador: ${reporterEmail}` : null,
          `Consulta sobre: ${data.subjectType}`,
          data.studentEnrollment ? `Matrícula: ${data.studentEnrollment}` : null,
          `Etapa: ${data.stage}`,
          `Curso: ${data.course}`,
          `Asignatura: ${data.subject}`,
          `Tipo de consulta: ${data.inquiryType}`,
          `Descripción: ${data.description}`,
          data.observations ? `Observaciones: ${data.observations}` : null,
        ].filter(Boolean).join("\n");

    createMutation.mutate({
      data: {
        title,
        description,
        priority: data.priority,
        category: data.subjectType === "Docente" ? "acceso_docente" : "consulta_educativa",
        customFields: {
          school: schoolName,
          studentEmail: data.subjectType === "Alumno" ? normalizedAffectedEmail : null,
          teacherEmail: data.subjectType === "Docente" ? normalizedAffectedEmail : null,
          affectedEmail: normalizedAffectedEmail,
          reporterEmail,
          subjectType: data.subjectType,
          studentEnrollment: data.studentEnrollment || null,
          stage: data.stage || null,
          course: data.course || null,
          subject: data.subject || null,
          inquiryType: data.subjectType === "Docente" ? "No puede acceder" : data.inquiryType,
          observations: data.observations || null,
          mochilaLookup,
          lineActions: subjectType === "Alumno" && selectedActionItems.length > 0 ? selectedActionItems : null,
          returnItems: subjectType === "Alumno" && selectedReturnItems.length > 0 ? selectedReturnItems : null,
          returnRequested: subjectType === "Alumno" && selectedReturnItems.length > 0,
        },
        tenantId,
        schoolId,
      },
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => setLocation("/tickets")} className="gap-2 -ml-4 text-slate-500">
        <ArrowLeft className="h-4 w-4" />
        Volver a Tickets
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Nueva consulta educativa</h1>
        <p className="text-slate-500 mt-1">Registra una consulta de forma guiada para que el equipo técnico pueda atenderla con rapidez.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Datos de la consulta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(user?.role === "superadmin" || user?.role === "tecnico") && (
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Red educativa *</FormLabel>
                      <Select onValueChange={(v) => {
                        field.onChange(parseInt(v, 10));
                        form.setValue("schoolId", undefined);
                        setMochilaLookup(null);
                        setMochilaLookupError(null);
                      }} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una red educativa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tenants?.data.map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id.toString()}>{tenant.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {!useSessionSchool && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="schoolId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Colegio *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v, 10))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un colegio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tenantSchools.map((school) => (
                              <SelectItem key={school.id} value={school.id.toString()}>{school.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!hideReporterEmailField && (
                    <FormField
                      control={form.control}
                      name="reporterEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Correo de contacto</FormLabel>
                          <FormControl>
                            <Input placeholder="Opcional: correo del docente o del informador" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {useSessionSchool && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colegio activo</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{user?.schoolName || user?.tenantName || "Colegio asignado"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta que registra la consulta</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{user?.email || "-"}</p>
                    </div>
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="subjectType"
                render={({ field }) => (
                  <FormItem className="w-full md:w-[20rem]">
                    <FormLabel>La consulta es sobre *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("studentEmail", value === "SobreMiCuenta" ? (user?.email ?? "") : "");
                            setMochilaLookup(null);
                            setMochilaLookupError(null);
                            setMochilaActivationSuggested(false);
                            setMochilaLookupMode("email");
                            setMochilaOrderId("");
                            setShowTeacherRegistrationRequest(false);
                          }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona una opción" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Alumno">Alumno</SelectItem>
                        {supportsTeacherSubject && <SelectItem value="Docente">Docente</SelectItem>}
                        <SelectItem value="SobreMiCuenta">Sobre mi cuenta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {subjectType === "SobreMiCuenta" && (
                <div
                  className="space-y-4 rounded-2xl border p-4"
                  style={{ backgroundColor: tenantPanelBackground, borderColor: tenantPanelBorder, color: tenantPanelText }}
                >
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: tenantPanelText }}>Recuperación de acceso docente</h3>
                    <p className="mt-1 text-xs" style={{ color: tenantPanelMuted }}>
                      La consulta es sobre mi cuenta. Usa los accesos directos para recuperar el acceso o registrar una incidencia.
                    </p>
                  </div>

                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: tenantPanelBorder, backgroundColor: "rgba(255,255,255,0.12)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tenantPanelMuted }}>Sobre mi cuenta</p>
                    <p className="mt-1 text-sm font-medium" style={{ color: tenantPanelText }}>{user?.email || "-"}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button type="button" onClick={handleForgotTeacherEnglishPassword}>
                      He olvidado mi contraseña de Inglés
                    </Button>
                    <Button type="button" onClick={handleForgotTeacherBlinkPassword}>
                      He olvidado mi contraseña de Francés/Alemán
                    </Button>
                    <Button
                      type="button"
                      onClick={createAccessIssueTicket}
                      disabled={quickAccessIssueMutation.isPending}
                    >
                      {quickAccessIssueMutation.isPending ? "Creando consulta..." : "Aún continúo sin poder acceder"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowTeacherRegistrationRequest((current) => !current)}
                    >
                      Solicitar alta
                    </Button>
                  </div>

                  {showTeacherRegistrationRequest && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Solicitud de alta docente</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Añade algún dato útil para el equipo técnico y registraremos la solicitud directamente.
                        </p>
                      </div>
                      <Textarea
                        value={teacherRegistrationNotes}
                        onChange={(event) => setTeacherRegistrationNotes(event.target.value)}
                        placeholder="Ejemplo: etapa, asignatura, plataforma afectada, si es alta nueva o reactivación..."
                        className="min-h-[120px] resize-y"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={createTeacherRegistrationTicket}
                          disabled={quickAccessIssueMutation.isPending}
                        >
                          {quickAccessIssueMutation.isPending ? "Creando solicitud..." : "Crear solicitud de alta"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {subjectType === "Docente" && (
                <div className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Incidencia de acceso para docente</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Indica el correo del docente, la prioridad y una breve descripcion de lo que le sucede para enviar la solicitud.
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="studentEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email del docente *</FormLabel>
                        <FormControl>
                          <Input placeholder="docente@centro.es" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prioridad</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona prioridad" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={TicketPriority.baja}>Baja</SelectItem>
                            <SelectItem value={TicketPriority.media}>Media</SelectItem>
                            <SelectItem value={TicketPriority.alta}>Alta</SelectItem>
                            <SelectItem value={TicketPriority.urgente}>Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripcion de lo que le sucede *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe brevemente el problema de acceso del docente..."
                            className="min-h-[140px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {shouldShowMochilasLookup && (
                <div
                  className="space-y-5 rounded-[28px] border p-5 md:p-6"
                  style={{ backgroundColor: mochilasPanelBackground, borderColor: mochilasPanelBorder }}
                >
                  <div>
                    <h3 className="text-2xl font-semibold tracking-tight" style={{ color: tenantPanelText }}>Búsqueda de Mochilas</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: tenantPanelMuted }}>
                      Busca usando el correo electrónico del alumno o el número de pedido para consultar su información de acceso.
                    </p>
                  </div>

                  {(mochilasEnabled || useSessionSchool) && (
                    <div className="grid gap-3 md:grid-cols-[minmax(17rem,20rem)_auto_auto] md:items-end">
                      <FormField
                        control={form.control}
                        name="studentEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel style={{ color: tenantPanelText }}>Email del alumno *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="alumno@centro.es"
                                className="font-normal text-slate-900 placeholder:font-normal placeholder:!text-slate-400"
                                style={panelInputStyle}
                                autoComplete="off"
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void lookupStudentInMochilas();
                                  }
                                }}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="w-full md:w-auto"
                          onClick={lookupStudentInMochilas}
                          disabled={isLookingUpMochila || !(selectedTenantId || user?.tenantId)}
                        >
                          {isLookingUpMochila ? "Buscando..." : "Buscar en mochilas"}
                        </Button>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full md:w-auto"
                          onClick={resetMochilasLookupState}
                        >
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Limpiar
                        </Button>
                      </div>
                    </div>
                  )}

                  {orderLookupEnabled && (
                    <div className="grid gap-3 md:grid-cols-[minmax(10rem,12rem)_auto] md:items-end">
                      <div className="w-full max-w-[12rem] space-y-2">
                        <label className="text-sm font-medium leading-none" style={{ color: tenantPanelText }}>
                          Pedido *
                        </label>
                        <Input
                          placeholder="Ej. 2068466760"
                          className="font-normal text-slate-900 placeholder:font-normal placeholder:!text-slate-400"
                          style={panelInputStyle}
                          autoComplete="off"
                          value={mochilaOrderId}
                          onChange={(event) => setMochilaOrderId(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void lookupStudentByOrderInMochilas();
                            }
                          }}
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="w-full md:w-auto"
                          onClick={lookupStudentByOrderInMochilas}
                          disabled={isLookingUpMochila || !(selectedTenantId || user?.tenantId)}
                        >
                          {isLookingUpMochila ? "Buscando..." : "Buscar por pedido"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {mochilaLookupError && (
                    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      <p>{mochilaLookupError}</p>
                      {mochilaActivationSuggested && (
                        <Button type="button" onClick={createUrgentActivationTicket} disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Creando solicitud..." : "Solicitar activacion urgente"}
                        </Button>
                      )}
                    </div>
                  )}

                  {mochilaLookup && (
                    <div className="space-y-4 rounded-[24px] border border-white/60 bg-white/95 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                      <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
                        <div className="overflow-hidden rounded-[20px] border border-slate-200">
                          <div className="flex items-start gap-4 border-b border-slate-200 p-4">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-2xl font-semibold text-indigo-600">
                              {getInitials(mochilaLookup.studentName, mochilaLookup.studentSurname, mochilaLookup.studentEmail)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-lg font-semibold text-slate-900">
                                {[mochilaLookup.studentName, mochilaLookup.studentSurname].filter(Boolean).join(" ") || "Sin nombre"}
                              </p>
                              <p className="mt-1 truncate text-sm text-slate-500">{mochilaLookup.studentEmail}</p>
                            </div>
                          </div>
                          <div className="p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Colegios detectados</p>
                            <div className="mt-3 space-y-3">
                              {mochilaLookup.schools.map((school) => (
                                <div key={school} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Desde</p>
                                  <div className="mt-2 flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                                      <Building2 className="h-5 w-5" />
                                    </div>
                                    <p className="text-base font-semibold leading-tight text-indigo-700">{school}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-slate-200 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credenciales</p>
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm text-slate-500">Email del alumno:</p>
                                <p className="truncate text-sm font-medium text-slate-900">{mochilaLookup.studentEmail || "-"}</p>
                              </div>
                              <Button type="button" size="sm" variant="outline" onClick={handleChangeStudentEmail}>
                                Cambiar email
                              </Button>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500">Usuario:</p>
                              <p className="break-all text-sm font-medium text-slate-900">{mochilaLookup.studentUser || "-"}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm text-slate-500">Contraseña inglés:</p>
                                  <p className="text-sm font-medium text-slate-900">{studentEnglishCredential?.password || "-"}</p>
                                </div>
                                <Button type="button" size="sm" onClick={handleForgotStudentEnglishPassword}>
                                  Cambiar contraseña
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm text-slate-500">Contraseña francés/alemán:</p>
                                  <p className="text-sm font-medium text-slate-900">{studentBlinkCredential?.password || "-"}</p>
                                </div>
                                <Button type="button" size="sm" onClick={handleForgotStudentBlinkPassword}>
                                  Cambiar contraseña
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3">
                              <div className="flex items-start gap-2">
                                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-700">¿Aún continúas sin poder acceder?</p>
                                  <p className="text-xs text-slate-500">Contacta con soporte técnico</p>
                                </div>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={createAccessIssueTicket}
                                  disabled={quickAccessIssueMutation.isPending}
                                >
                                  {quickAccessIssueMutation.isPending ? "Creando consulta..." : "Contactar soporte"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-600">Colegios detectados</p>
                        <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-3 font-semibold">Descripción</th>
                              <th className="px-3 py-3 font-semibold">ISBN</th>
                              <th className="px-3 py-3 font-semibold">Pedido</th>
                              <th className="px-3 py-3 font-semibold">Código</th>
                              <th className="px-3 py-3 font-semibold">Goog</th>
                              <th className="px-3 py-3 font-semibold text-right">Acciones</th>
                            </tr>
                            </thead>
                            <tbody>
                              {summarizedMochilaRecords.map((record) => {
                                const activeActions = selectedLineActions[record.key] ?? [];
                                const isSelectedForReturn = activeActions.includes("return");
                                const isSelectedMissingBook = activeActions.includes("missing_book");
                                const hasSelectedActions = activeActions.length > 0;

                                return (
                                  <tr
                                    key={record.key}
                                    className={`border-t border-slate-200 align-top ${hasSelectedActions ? "bg-amber-50" : ""}`}
                                  >
                                    <td className="px-3 py-3 text-slate-900">{record.description}</td>
                                    <td className="px-3 py-3 text-slate-900">{record.isbn}</td>
                                    <td className="px-3 py-3 text-slate-900">{record.orderId}</td>
                                    <td className="whitespace-nowrap px-3 py-3 text-slate-900">{record.bookCode}</td>
                                    <td className="px-3 py-3 text-slate-900">{record.google}</td>
                                    <td className="px-3 py-3 text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant={isSelectedMissingBook ? "default" : "outline"}
                                          className="h-9 w-9"
                                          onClick={() => toggleLineAction(record.key, "missing_book")}
                                          title="No ve el libro"
                                        >
                                          <BookX className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant={isSelectedForReturn ? "default" : "outline"}
                                          className="h-9 w-9"
                                          onClick={() => toggleLineAction(record.key, "return")}
                                          title="Devolución"
                                        >
                                          <Undo2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-slate-500">• Mostrando {summarizedMochilaRecords.length} libro(s)</p>
                      </div>
                      {selectedActionItems.length > 0 && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                          Se guardarán {selectedActionItems.length} línea(s) con acciones marcadas en esta consulta.
                        </div>
                      )}
                      {returnsEnabled && selectedReturnItems.length > 0 && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                          Se guardarán {selectedReturnItems.length} línea(s) marcadas para devolución al crear el ticket.
                        </div>
                      )}
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <FormField
                          control={form.control}
                          name="observations"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Descripción / observaciones adicionales</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Si quieres, añade algún detalle adicional para el equipo técnico..."
                                  className="min-h-[120px] resize-y bg-white"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {subjectType === "Alumno" && !shouldShowMochilasLookup && (
                <FormField
                  control={form.control}
                  name="studentEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email del alumno *</FormLabel>
                      <FormControl>
                        <Input placeholder="alumno@centro.es" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {shouldShowTeacherTicketFields && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="subjectType"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormLabel>La consulta es sobre *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona una opción" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Alumno">Alumno</SelectItem>
                            {supportsTeacherSubject && <SelectItem value="Docente">Docente</SelectItem>}
                            <SelectItem value="SobreMiCuenta">Sobre mi cuenta</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {!shouldHideExtendedFields && (
                <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="subjectType"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormLabel>La consulta es sobre *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una opción" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alumno">Alumno</SelectItem>
                          {supportsTeacherSubject && <SelectItem value="Docente">Docente</SelectItem>}
                          <SelectItem value="SobreMiCuenta">Sobre mi cuenta</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridad</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona prioridad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={TicketPriority.baja}>Baja</SelectItem>
                          <SelectItem value={TicketPriority.media}>Media</SelectItem>
                          <SelectItem value={TicketPriority.alta}>Alta</SelectItem>
                          <SelectItem value={TicketPriority.urgente}>Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="studentEnrollment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matrícula alumno</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. 2153" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etapa *</FormLabel>
                      <FormControl>
                        <Input placeholder="Primaria, Secundaria..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="course"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Curso *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. 2Âº ESO" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asignatura *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona asignatura" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Inglés">Inglés</SelectItem>
                          <SelectItem value="Alemán">Alemán</SelectItem>
                          <SelectItem value="Francés">Francés</SelectItem>
                          <SelectItem value="Todas">Todas</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="inquiryType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de consulta *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alumno sin libros">Alumno sin libros</SelectItem>
                          <SelectItem value="No puede acceder">No puede acceder</SelectItem>
                          <SelectItem value="Problemas de activación">Problemas de activación</SelectItem>
                          <SelectItem value="No funciona el libro">No funciona el libro</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción de la consulta/incidencia *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Cuéntanos qué ocurre, en qué plataforma y cómo reproducirlo..."
                        className="min-h-[160px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Detalles adicionales, contexto pedagógico o notas para el equipo técnico..."
                        className="min-h-[120px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  )}
                />
                </>
              )}
            </CardContent>
            <CardFooter className="bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 px-6 py-4 rounded-b-xl border-t">
              <Button type="button" variant="outline" onClick={() => setLocation("/tickets")}>
                Cancelar
              </Button>
              {canSubmitForm && (
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {subjectType === "Docente" ? "Enviar solicitud" : "Enviar consulta"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}

