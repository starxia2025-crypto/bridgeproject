import { useMemo, useState } from "react";
import { useGetMe, useListDocuments, useListTenants } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/lib/api-base-url";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Book,
  ChevronRight,
  Eye,
  FileDown,
  FileText,
  HelpCircle,
  Link as LinkIcon,
  Megaphone,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { z } from "zod";

const typeLabels: Record<string, string> = {
  video: "Video",
  faq: "Preguntas frecuentes",
  link: "Enlace",
  manual: "Manual",
  tutorial: "Guia rapida",
  other: "Otro",
};

const createDocumentSchema = z.object({
  title: z.string().min(2, "Indica un titulo"),
  description: z.string().optional(),
  type: z.enum(["manual", "tutorial", "video", "faq", "link", "other"]),
  category: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  tenantId: z.coerce.number().optional(),
  tags: z.string().optional(),
  published: z.boolean().default(true),
});

type CreateDocumentValues = z.infer<typeof createDocumentSchema>;

type UploadedFileResult = {
  fileName: string;
  storedFileName: string;
  size: number;
  mimeType: string;
  url: string;
  tenantId: number;
};

const quickAccess = [
  { key: "manual", label: "Manuales", icon: Book },
  { key: "video", label: "Videos", icon: Video },
  { key: "faq", label: "Preguntas frecuentes", icon: HelpCircle },
  { key: "tutorial", label: "Guias rapidas", icon: Sparkles },
  { key: "link", label: "Novedades", icon: Megaphone },
] as const;

const accentStyles: Record<string, string> = {
  manual: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  video: "bg-rose-50 text-rose-600 ring-rose-100",
  faq: "bg-amber-50 text-amber-700 ring-amber-100",
  tutorial: "bg-sky-50 text-sky-700 ring-sky-100",
  link: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  other: "bg-slate-100 text-slate-700 ring-slate-200",
};

function getIcon(type: string) {
  switch (type) {
    case "video":
      return <PlayCircle className="h-7 w-7 text-rose-500" />;
    case "faq":
      return <HelpCircle className="h-7 w-7 text-amber-500" />;
    case "link":
      return <LinkIcon className="h-7 w-7 text-sky-500" />;
    case "manual":
      return <Book className="h-7 w-7 text-indigo-500" />;
    case "tutorial":
      return <Sparkles className="h-7 w-7 text-emerald-500" />;
    default:
      return <FileText className="h-7 w-7 text-slate-500" />;
  }
}

export default function PortalAdmin() {
  const { data: user } = useGetMe();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeType, setActiveType] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);

  const { data: docsData, isLoading, refetch } = useListDocuments({
    tenantId: user?.role === "superadmin" ? undefined : user?.tenantId,
    search: search || undefined,
    category: activeCategory !== "all" ? activeCategory : undefined,
    limit: 50,
  });

  const { data: tenants } = useListTenants(
    { limit: 100 },
    { query: { enabled: user?.role === "superadmin" || user?.role === "tecnico" } },
  );

  const form = useForm<CreateDocumentValues>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "manual",
      category: "general",
      url: "",
      content: "",
      tenantId: user?.tenantId ?? undefined,
      tags: "",
      published: true,
    },
  });

  const canManageContent = ["superadmin", "admin_cliente", "tecnico", "manager"].includes(user?.role || "");
  const documents = docsData?.data ?? [];

  const filteredDocuments = useMemo(() => {
    if (activeType === "all") return documents;
    return documents.filter((doc) => doc.type === activeType);
  }, [activeType, documents]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      if (!doc.category) continue;
      counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
    }
    return [
      { key: "all", label: "Todos los contenidos", count: documents.length },
      ...Array.from(counts.entries()).map(([key, count]) => ({ key, label: key, count })),
    ];
  }, [documents]);

  function resetComposer() {
    setEditingDocumentId(null);
    setSelectedFile(null);
    form.reset({
      title: "",
      description: "",
      type: "manual",
      category: "general",
      url: "",
      content: "",
      tenantId: user?.tenantId ?? undefined,
      tags: "",
      published: true,
    });
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Archivo demasiado grande",
        description: "Sube archivos de hasta 10 MB para el portal.",
        variant: "destructive",
      });
      setSelectedFile(null);
      event.target.value = "";
      return;
    }
    if (!form.getValues("title")) {
      form.setValue("title", file.name.replace(/\.[^.]+$/, ""), { shouldValidate: true });
    }
    if (!form.getValues("description")) {
      form.setValue("description", `Archivo adjunto: ${file.name}`);
    }
    form.setValue("type", "manual");
  }

  async function uploadSelectedFile(tenantId: number): Promise<UploadedFileResult | null> {
    if (!selectedFile) return null;
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("tenantId", String(tenantId));
    const response = await fetch(buildApiUrl("/api/documents/upload"), {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.message || `No se pudo subir el archivo (${response.status}).`;
      throw new Error(message);
    }
    return payload as UploadedFileResult;
  }

  async function onSubmit(values: CreateDocumentValues) {
    const tenantId =
      user?.role === "superadmin" || user?.role === "tecnico"
        ? values.tenantId!
        : (user?.tenantId as number);

    try {
      const uploadedFile = await uploadSelectedFile(tenantId);
      const resolvedUrl = uploadedFile?.url || values.url || null;
      const resolvedContent = uploadedFile
        ? [values.content?.trim(), `Archivo adjunto: ${uploadedFile.fileName}`].filter(Boolean).join("\n\n")
        : (values.content || null);

      const response = await fetch(
        buildApiUrl(editingDocumentId ? `/api/documents/${editingDocumentId}` : "/api/documents"),
        {
          method: editingDocumentId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: values.title,
            description: values.description || (uploadedFile ? `Descarga disponible: ${uploadedFile.fileName}` : null),
            type: values.type,
            category: values.category || null,
            url: resolvedUrl,
            content: resolvedContent,
            tenantId,
            tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
            visibleToRoles: ["usuario_cliente", "visor_cliente", "manager", "tecnico", "admin_cliente", "superadmin"],
            published: values.published,
          }),
        },
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Se ha producido un error interno en el servidor.");
      }

      toast({
        title: editingDocumentId ? "Contenido actualizado" : "Contenido publicado",
        description: editingDocumentId ? "Los cambios ya estan guardados." : "El recurso ya esta disponible en el portal.",
      });
      setOpen(false);
      resetComposer();
      await refetch();
    } catch (error) {
      toast({
        title: "No se pudo publicar el contenido",
        description: error instanceof Error ? error.message : "Revisa el archivo e intentalo de nuevo.",
        variant: "destructive",
      });
    }
  }

  function openEditDialog(doc: any) {
    setEditingDocumentId(doc.id);
    setSelectedFile(null);
    form.reset({
      title: doc.title || "",
      description: doc.description || "",
      type: doc.type || "manual",
      category: doc.category || "general",
      url: doc.url || "",
      content: doc.content || "",
      tenantId: doc.tenantId ?? user?.tenantId ?? undefined,
      tags: Array.isArray(doc.tags) ? doc.tags.join(", ") : "",
      published: doc.published ?? true,
    });
    setOpen(true);
  }

  async function deleteDocument(documentId: number) {
    if (!window.confirm("¿Eliminar este contenido del centro de ayuda?")) return;
    try {
      const response = await fetch(buildApiUrl(`/api/documents/${documentId}`), {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "No se pudo eliminar el contenido.");
      }
      toast({
        title: "Contenido eliminado",
        description: "El recurso ya no aparece en el portal.",
      });
      await refetch();
    } catch (error) {
      toast({
        title: "No se pudo eliminar el contenido",
        description: error instanceof Error ? error.message : "Intentalo de nuevo.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[#dfe8ff] via-[#eef3ff] to-white shadow-inner ring-1 ring-[#d7e3ff]">
            <Book className="h-8 w-8 text-[#2952d6]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Centro de ayuda Macmillan</h1>
            <p className="max-w-4xl text-base leading-7 text-slate-600">
              Consulta manuales de uso, videos explicativos, enlaces utiles, preguntas frecuentes y requisitos de acceso en un solo lugar.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <CardContent className="space-y-6 p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base shadow-sm placeholder:text-slate-400"
                  placeholder="Buscar articulos, manuales, videos..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button className="h-14 rounded-2xl bg-[#2952d6] px-8 text-base font-semibold hover:bg-[#1f43bb]">Buscar</Button>
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold text-slate-600">Explorar contenido</p>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                {quickAccess.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeType === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveType(item.key)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-[#d7e3ff] bg-[#f4f7ff] text-[#2952d6]"
                          : "border-transparent text-slate-700 hover:border-[#d7e3ff] hover:bg-[#f7f9ff]"
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#2952d6]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {canManageContent && (
                <div className="flex justify-end">
                  <Dialog
                    open={open}
                    onOpenChange={(nextOpen) => {
                      setOpen(nextOpen);
                      if (!nextOpen) resetComposer();
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button className="h-12 rounded-2xl bg-[#2952d6] px-5 font-semibold hover:bg-[#1f43bb]">
                        <Plus className="mr-2 h-4 w-4" />
                        Subir contenido
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Nuevo contenido de ayuda</DialogTitle>
                        <DialogDescription>Publica manuales, videos, FAQs, enlaces utiles o adjunta un archivo desde tu equipo.</DialogDescription>
                      </DialogHeader>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                          {(user?.role === "superadmin" || user?.role === "tecnico") && (
                            <FormField
                              control={form.control}
                              name="tenantId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cliente</FormLabel>
                                  <Select onValueChange={(value) => field.onChange(parseInt(value, 10))} value={field.value?.toString()}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un cliente" />
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

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="title"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Titulo</FormLabel>
                                  <FormControl><Input placeholder="Ej. Guia de activacion" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="type"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tipo</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {Object.entries(typeLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="category"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Categoria</FormLabel>
                                  <FormControl><Input placeholder="general, plataforma, integraciones" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="url"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>URL externa</FormLabel>
                                  <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="rounded-xl border border-dashed p-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                              <Upload className="h-4 w-4" />
                              Subir archivo desde tu equipo
                            </div>
                            <Input type="file" onChange={handleFileSelection} />
                            <p className="mt-2 text-xs text-slate-500">Puedes adjuntar PDF, Word, Excel, imagenes u otros recursos de hasta 10 MB.</p>
                            {selectedFile && (
                              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                Archivo seleccionado: {selectedFile.name}
                              </div>
                            )}
                          </div>

                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Descripcion</FormLabel>
                                <FormControl><Textarea className="min-h-[90px]" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="content"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Contenido</FormLabel>
                                <FormControl><Textarea className="min-h-[120px]" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="tags"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tags</FormLabel>
                                <FormControl><Input placeholder="plataforma, activacion, acceso" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                            <Button type="submit">{editingDocumentId ? "Guardar cambios" : "Publicar"}</Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-slate-200 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl text-slate-950">Categorias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                  activeCategory === category.key
                    ? "bg-[#edf2ff] text-[#2952d6] shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-sm font-medium capitalize">{category.label}</span>
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-500">{category.count}</span>
              </button>
            ))}
            <div className="pt-4">
              <Button variant="outline" className="w-full justify-between rounded-2xl border-slate-200">
                Ver todas las categorias
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-xl text-slate-950">Contenido destacado</CardTitle>
            <Button variant="ghost" className="text-[#2952d6] hover:text-[#1f43bb]">Ver todo</Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {[1, 2, 3, 4].map((item) => <div key={item} className="h-52 animate-pulse rounded-[24px] bg-slate-100" />)}
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 px-6 py-16 text-center">
                <HelpCircle className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <h3 className="text-lg font-semibold text-slate-900">No se encontraron articulos</h3>
                <p className="mt-2 text-sm text-slate-500">No hay contenido disponible con los filtros actuales.</p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {filteredDocuments.map((doc) => {
                  const isDownloadableFile = !!doc.url?.includes("/uploads/documents/");
                  const accent = accentStyles[doc.type] ?? accentStyles.other;
                  return (
                    <div
                      key={doc.id}
                      className="flex h-full gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d9e4ff] hover:shadow-[0_18px_40px_rgba(41,82,214,0.12)]"
                    >
                      <a
                        href={doc.url || "#"}
                        target={doc.url && !isDownloadableFile ? "_blank" : undefined}
                        rel={doc.url && !isDownloadableFile ? "noopener noreferrer" : undefined}
                        download={isDownloadableFile ? doc.title : undefined}
                        className="flex min-w-0 flex-1 gap-4"
                      >
                        <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl ring-1 ${accent}`}>
                          {getIcon(doc.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge className={`rounded-full border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accent}`}>
                              {typeLabels[doc.type] || doc.type}
                            </Badge>
                            {doc.category && <span className="text-sm capitalize text-slate-400">{doc.category}</span>}
                            {isDownloadableFile && <span className="text-sm text-emerald-600">Descargable</span>}
                          </div>
                          <h3 className="line-clamp-2 text-2xl font-semibold tracking-tight text-slate-950">{doc.title}</h3>
                          <p className="mt-2 line-clamp-2 text-base leading-7 text-slate-500">
                            {doc.description || "Recurso disponible para consulta y descarga desde el centro de ayuda."}
                          </p>
                        </div>
                      </a>
                      <div className="flex shrink-0 flex-col gap-2">
                        <a
                          href={doc.url || "#"}
                          target={doc.url && !isDownloadableFile ? "_blank" : undefined}
                          rel={doc.url && !isDownloadableFile ? "noopener noreferrer" : undefined}
                          download={isDownloadableFile ? doc.title : undefined}
                        >
                          <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-2xl">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </a>
                        {isDownloadableFile ? (
                          <a href={doc.url || "#"} download={doc.title}>
                            <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-2xl">
                              <FileDown className="h-4 w-4" />
                            </Button>
                          </a>
                        ) : canManageContent ? (
                          <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-2xl" onClick={() => openEditDialog(doc)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canManageContent && (
                          <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-2xl" onClick={() => deleteDocument(doc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
        <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[#dfe8ff] to-[#edf3ff] text-[#2952d6]">
              <HelpCircle className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">¿No encuentras lo que buscas?</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Contacta con nuestro equipo de soporte tecnico y te ayudaremos a resolver cualquier duda sobre la plataforma o el acceso.
              </p>
            </div>
          </div>
          <Button className="h-14 rounded-2xl border border-[#d7e3ff] bg-white px-6 text-base font-semibold text-[#2952d6] shadow-sm hover:bg-[#f7f9ff] hover:text-[#1f43bb]">
            Abrir ticket de soporte
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
