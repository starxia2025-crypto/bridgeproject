import { useMemo, useState } from "react";
import { 
  useGetDashboardStats, 
  useGetTicketsByStatus, 
  useGetTicketsOverTime, 
  useGetRecentActivity,
  useGetMe,
  useAssignTicket,
  useListTickets,
  useListUsers,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Ticket, Clock, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge } from "@/components/badges";
import { toast } from "@/hooks/use-toast";

const openStatuses = ["nuevo", "pendiente", "en_revision", "en_proceso", "esperando_cliente"];

export default function Dashboard() {
  const { data: user } = useGetMe();
  const tenantId = user?.role === 'superadmin' ? undefined : user?.tenantId;
  const [openTicketsDialog, setOpenTicketsDialog] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({});
  
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ tenantId });
  const { data: statusData } = useGetTicketsByStatus({ tenantId });
  const { data: timeData } = useGetTicketsOverTime({ tenantId, period: "day" });
  const { data: activity } = useGetRecentActivity({ tenantId, limit: 5 });
  const { data: openTicketsData, refetch: refetchOpenTickets } = useListTickets(
    { tenantId, limit: 100 },
    { query: { enabled: user?.role === "superadmin" && openTicketsDialog } },
  );
  const { data: techniciansData } = useListUsers(
    { role: "tecnico", active: true, limit: 100 },
    { query: { enabled: user?.role === "superadmin" && openTicketsDialog } },
  );

  const assignTicket = useAssignTicket({
    mutation: {
      onSuccess: async () => {
        toast({
          title: "Ticket asignado",
          description: "La asignacion al tecnico se ha guardado correctamente.",
        });
        await refetchOpenTickets();
      },
      onError: (error) => {
        toast({
          title: "No se pudo asignar el ticket",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    },
  });

  const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#ef4444', '#8b5cf6', '#64748b'];
  const openTickets = useMemo(
    () => (openTicketsData?.data ?? []).filter((ticket) => openStatuses.includes(ticket.status)),
    [openTicketsData?.data],
  );
  const technicians = techniciansData?.data ?? [];

  function handleAssignTicket(ticketId: number) {
    const selectedUserId = assignmentDrafts[ticketId];
    if (!selectedUserId) {
      toast({
        title: "Selecciona un tecnico",
        description: "Elige primero el tecnico al que quieres asignar este ticket.",
        variant: "destructive",
      });
      return;
    }

    assignTicket.mutate({
      ticketId,
      data: { userId: Number(selectedUserId) },
    });
  }

  if (statsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded"></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Estadísticas de soporte</h1>
        <p className="text-slate-500 mt-1">Visión agregada de incidencias, tiempos de resolución y carga operativa por colegio.</p>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className={user?.role === "superadmin" ? "cursor-pointer transition hover:border-primary/40 hover:shadow-md" : undefined}
          onClick={user?.role === "superadmin" ? () => setOpenTicketsDialog(true) : undefined}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Tickets Abiertos</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.openTickets || 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-red-500 font-medium">{stats?.urgentTickets || 0} urgentes</span> requieren atención
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Tiempo Medio de Resolución</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.avgResolutionHours ? `${stats.avgResolutionHours}h` : 'N/A'}</div>
            <p className="text-xs text-slate-500 mt-1">
              Basado en tickets resueltos recientemente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Resueltos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.resolvedTickets || 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              ¡Buen trabajo, equipo!
            </p>
          </CardContent>
        </Card>

        {user?.role === 'superadmin' ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total de Colegios</CardTitle>
              <Building2 className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalTenants || 0}</div>
              <p className="text-xs text-slate-500 mt-1">
                Organizaciones activas
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Tickets Nuevos</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.newTickets || 0}</div>
              <p className="text-xs text-slate-500 mt-1">
                Pendientes de primera respuesta
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Gráfico principal */}
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Volumen de Tickets</CardTitle>
            <CardDescription>Creados vs. Resueltos en el tiempo</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[300px] w-full">
              {timeData && timeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 12, fill: '#64748b'}} 
                      axisLine={false} 
                      tickLine={false} 
                      tickFormatter={(val) => format(new Date(val), 'd MMM', { locale: es })}
                    />
                    <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(val) => format(new Date(val), "d 'de' MMMM, yyyy", { locale: es })}
                    />
                    <Line type="monotone" dataKey="created" name="Creados" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={{r: 6}} />
                    <Line type="monotone" dataKey="resolved" name="Resueltos" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">No hay suficientes datos para mostrar</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Donut por estado */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Tickets por Estado</CardTitle>
            <CardDescription>Instantánea actual de todos los tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col items-center justify-center">
              {statusData && statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="label"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400">Sin tickets activos</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actividad reciente */}
      <Card>
        <CardHeader>
          <CardTitle>Actividad Reciente</CardTitle>
          <CardDescription>Últimas actualizaciones en tus operaciones</CardDescription>
        </CardHeader>
        <CardContent>
          {activity && activity.length > 0 ? (
            <div className="space-y-6">
              {activity.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="h-2 w-2 mt-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      <span className="font-bold">{item.userName}</span> {item.action} {item.entityType} 
                      {item.entityTitle && <span className="text-slate-600 dark:text-slate-400"> "{item.entityTitle}"</span>}
                    </p>
                    <div className="flex items-center text-xs text-slate-500 gap-2">
                      <span>{format(new Date(item.createdAt), "d MMM, HH:mm", { locale: es })}</span>
                      {item.tenantName && (
                        <>
                          <span>•</span>
                          <span>{item.tenantName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">Sin actividad reciente</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openTicketsDialog} onOpenChange={setOpenTicketsDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Tickets abiertos</DialogTitle>
            <DialogDescription>
              Revisa quien tiene cada ticket y asignalo rapidamente a un tecnico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {openTickets.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-slate-500">
                No hay tickets abiertos ahora mismo.
              </div>
            ) : (
              openTickets.map((ticket) => (
                <div key={ticket.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1.4fr_0.9fr_0.9fr_auto] lg:items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{ticket.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>#{ticket.ticketNumber}</span>
                      <span>·</span>
                      <span>{ticket.schoolName || ticket.tenantName}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Estado</p>
                    <div className="mt-1"><StatusBadge status={ticket.status} /></div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Asignado a</p>
                    <Select
                      value={assignmentDrafts[ticket.id] ?? (ticket.assignedToId ? String(ticket.assignedToId) : "unassigned")}
                      onValueChange={(value) => setAssignmentDrafts((current) => ({ ...current, [ticket.id]: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Sin asignar</SelectItem>
                        {technicians.map((tech) => (
                          <SelectItem key={tech.id} value={String(tech.id)}>
                            {tech.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => handleAssignTicket(ticket.id)}
                      disabled={assignTicket.isPending || (assignmentDrafts[ticket.id] ?? (ticket.assignedToId ? String(ticket.assignedToId) : "unassigned")) === "unassigned"}
                    >
                      Asignar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
