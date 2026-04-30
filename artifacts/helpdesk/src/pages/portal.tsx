import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetMe, useListDocuments } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Book,
  ChevronRight,
  FileDown,
  FileText,
  HelpCircle,
  Link as LinkIcon,
  Megaphone,
  PlayCircle,
  Search,
  Sparkles,
  Video,
} from "lucide-react";

const typeLabels: Record<string, string> = {
  video: "Video",
  faq: "Preguntas frecuentes",
  link: "Enlace",
  manual: "Manual",
  tutorial: "Guia rapida",
  document: "Documento",
};

const typeIcons = {
  manual: Book,
  video: Video,
  faq: HelpCircle,
  tutorial: Sparkles,
  link: LinkIcon,
  document: FileText,
} as const;

const typeAccentStyles: Record<string, string> = {
  manual: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  video: "bg-rose-50 text-rose-600 ring-rose-100",
  faq: "bg-amber-50 text-amber-700 ring-amber-100",
  tutorial: "bg-sky-50 text-sky-700 ring-sky-100",
  link: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  document: "bg-slate-100 text-slate-700 ring-slate-200",
};

function formatDocType(type: string) {
  return typeLabels[type] ?? type;
}

function getDocIcon(type: string) {
  const Icon = typeIcons[type as keyof typeof typeIcons] ?? FileDown;
  return Icon;
}

export default function Portal() {
  const { data: user } = useGetMe();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: docsData, isLoading } = useListDocuments({
    tenantId: user?.role === "superadmin" ? undefined : user?.tenantId,
    search: search || undefined,
    category: activeCategory !== "all" ? activeCategory : undefined,
    limit: 50,
  });

  const documents = docsData?.data ?? [];
  const categories = useMemo(() => {
    const counts = new Map<string, number>();

    for (const doc of documents) {
      if (!doc.category) continue;
      counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
    }

    return [
      { key: "all", label: "Todos los contenidos", count: documents.length },
      ...Array.from(counts.entries()).map(([key, count]) => ({
        key,
        label: key,
        count,
      })),
    ];
  }, [documents]);

  const featuredDocuments = documents.slice(0, 4);
  const quickAccess = [
    { key: "manual", label: "Manuales", icon: Book },
    { key: "video", label: "Videos", icon: Video },
    { key: "faq", label: "Preguntas frecuentes", icon: HelpCircle },
    { key: "tutorial", label: "Guias rapidas", icon: Sparkles },
    { key: "link", label: "Novedades", icon: Megaphone },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:p-8">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[#dfe8ff] via-[#eef3ff] to-white shadow-inner ring-1 ring-[#d7e3ff]">
              <Book className="h-8 w-8 text-[#2952d6]" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
                Centro de ayuda Macmillan
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-600">
                Consulta manuales de uso, videos explicativos, enlaces utiles, preguntas frecuentes
                y requisitos de acceso en un solo lugar.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white via-[#fbfcff] to-[#f4f7ff] p-4 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-base shadow-sm placeholder:text-slate-400"
                    placeholder="Buscar articulos, manuales, videos..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Button className="h-14 rounded-2xl bg-[#2952d6] px-8 text-base font-semibold hover:bg-[#1f43bb]">
                  Buscar
                </Button>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center gap-4">
                  <p className="text-sm font-semibold text-slate-600">Explorar contenido</p>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="grid gap-2 md:grid-cols-5">
                  {quickAccess.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveCategory(item.key)}
                        className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-[#d7e3ff] hover:bg-[#f7f9ff]"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#2952d6]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium text-slate-800">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
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
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  {category.count}
                </span>
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
            <div>
              <CardTitle className="text-xl text-slate-950">Contenido destacado</CardTitle>
            </div>
            <Button variant="ghost" className="text-[#2952d6] hover:text-[#1f43bb]">
              Ver todo
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {[1, 2].map((item) => (
                  <div key={item} className="h-56 animate-pulse rounded-[24px] bg-slate-100" />
                ))}
              </div>
            ) : featuredDocuments.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 px-6 py-16 text-center">
                <HelpCircle className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <h3 className="text-lg font-semibold text-slate-900">No se encontraron articulos</h3>
                <p className="mt-2 text-sm text-slate-500">
                  No hay contenido disponible con los filtros actuales.
                </p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {featuredDocuments.map((doc) => {
                  const Icon = getDocIcon(doc.type);
                  const accent = typeAccentStyles[doc.type] ?? typeAccentStyles.document;

                  return (
                    <a
                      key={doc.id}
                      href={doc.url || "#"}
                      target={doc.url ? "_blank" : undefined}
                      rel={doc.url ? "noopener noreferrer" : undefined}
                      className="group block"
                    >
                      <div className="flex h-full flex-col justify-between rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d9e4ff] hover:shadow-[0_18px_40px_rgba(41,82,214,0.12)]">
                        <div className="flex gap-4">
                          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl ring-1 ${accent}`}>
                            <Icon className="h-8 w-8" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Badge className={`mb-3 rounded-full border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accent}`}>
                              {formatDocType(doc.type)}
                            </Badge>
                            <h3 className="line-clamp-2 text-2xl font-semibold tracking-tight text-slate-950">
                              {doc.title}
                            </h3>
                            <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
                              {doc.description || "Recurso disponible para consulta y descarga desde el centro de ayuda."}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 flex items-center justify-between gap-4">
                          <p className="text-xs font-medium text-slate-400">
                            {doc.category ? `Categoria: ${doc.category}` : "Contenido destacado"}
                          </p>
                          <div className="flex gap-2">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition group-hover:border-[#d7e3ff] group-hover:text-[#2952d6]">
                              <Search className="h-4 w-4" />
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition group-hover:border-[#d7e3ff] group-hover:text-[#2952d6]">
                              <FileDown className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </a>
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
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                ¿No encuentras lo que buscas?
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Contacta con nuestro equipo de soporte tecnico y te ayudaremos a resolver cualquier duda
                sobre la plataforma o el acceso.
              </p>
            </div>
          </div>

          <Link href="/tickets/new">
            <Button className="h-14 rounded-2xl border border-[#d7e3ff] bg-white px-6 text-base font-semibold text-[#2952d6] shadow-sm hover:bg-[#f7f9ff] hover:text-[#1f43bb]">
              Abrir ticket de soporte
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
