import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Alert, type Battery, type Equipment, type Measurement, type Period } from "./api/client.js";

const colors = ["#087f8c", "#f08a4b", "#536dfe", "#aa6fca"];

function asInputDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value?: string): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function App() {
  const initialFrom = new Date(Date.now() - 24 * 60 * 60_000);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [from, setFrom] = useState(asInputDate(initialFrom));
  const [to, setTo] = useState("");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [comparison, setComparison] = useState<Record<string, Measurement[]>>({});
  const [periods, setPeriods] = useState<Period[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const selectedBattery = batteries.find((battery) => battery.equipment_id === selectedId);
  const reload = useCallback(async () => {
    if (!selectedId) return;
    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : undefined;
    if (!Number.isFinite(fromDate.getTime()) || (toDate && !Number.isFinite(toDate.getTime())) || (toDate && fromDate > toDate)) {
      throw new Error("Informe um intervalo de datas válido.");
    }
    const fromIso = fromDate.toISOString();
    const toIso = toDate?.toISOString();
    const activeCompareIds = [...new Set([selectedId, ...compareIds])];
    const results = await Promise.all([
      api.measurements(selectedId, fromIso, toIso),
      api.alerts(selectedId, fromIso, toIso),
      selectedBattery ? api.periods(selectedBattery.id, fromIso, toIso) : Promise.resolve([] as Period[]),
      ...activeCompareIds.map((id) => api.measurements(id, fromIso, toIso)),
    ]);
    setMeasurements(results[0] as Measurement[]);
    setAlerts(results[1] as Alert[]);
    setPeriods(results[2] as Period[]);
    setComparison(Object.fromEntries(activeCompareIds.map((id, index) => [id, results[index + 3] as Measurement[]])));
    setLastUpdated(new Date());
    setError("");
  }, [compareIds, from, selectedBattery, selectedId]);

  useEffect(() => {
    let active = true;
    void Promise.all([api.equipment(), api.batteries()])
      .then(([items, batteryItems]) => {
        if (!active) return;
        setEquipment(items);
        setBatteries(batteryItems);
        setSelectedId((current) => current || items[0]?.id || "");
        setCompareIds(items.slice(1, 2).map((item) => item.id));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os equipamentos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const defaultRefreshIntervalMs = 15_000;
  const rawRefreshInterval = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS);
  const refreshIntervalMs =
    Number.isFinite(rawRefreshInterval) && rawRefreshInterval >= 1000
      ? rawRefreshInterval
      : defaultRefreshIntervalMs;
  const refreshIntervalSec = refreshIntervalMs / 1000;

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const update = async () => {
      try {
        await reload();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao atualizar os dados.");
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), refreshIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshIntervalMs, reload, selectedId]);

  const latest = measurements.at(-1);
  const chartData = useMemo(() => {
    const points = new Map<string, Record<string, string | number>>();
    for (const [equipmentId, rows] of Object.entries(comparison)) {
      for (const row of rows) {
        const point = points.get(row.acquired_at) ?? { timestamp: row.acquired_at };
        point[equipmentId] = row.voltage;
        points.set(row.acquired_at, point);
      }
    }
    return [...points.values()].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }, [comparison]);

  function toggleComparison(id: string) {
    setCompareIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Battery Monitor, página inicial">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>Battery<span className="brand-light">Monitor</span></span>
        </a>
      </header>

      <main className="content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">MONITORAMENTO DE ENERGIA</p>
            <h1>Visão da operação</h1>
            <p className="subheading">Acompanhe as tendências de tensão e compare equipamentos.</p>
          </div>
          <div className="refresh-note" aria-live="polite">
            <span className="live-dot" aria-hidden="true" />
            Atualização a cada {refreshIntervalSec} s
          </div>
        </section>

        <section className="filters card" aria-label="Filtros de consulta">
          <label>
            Equipamento
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {equipment.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Início
            <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Fim (opcional; vazio = agora)
            <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="button" type="button" onClick={() => void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao atualizar os dados."))} disabled={!selectedId}>
            Atualizar agora
          </button>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <section className="summary-grid" aria-label="Resumo do equipamento selecionado">
          <article className="metric-card card">
            <div className="metric-heading"><span>Tensão atual</span><span className="metric-icon voltage" aria-hidden="true">↗</span></div>
            <strong className="metric-value">{loading ? "…" : latest ? `${latest.voltage.toFixed(2)} V` : "—"}</strong>
            <span className="metric-caption">{latest ? `Coletada ${formatDate(latest.acquired_at)}` : "Sem medições no período"}</span>
          </article>
          <article className="metric-card card">
            <div className="metric-heading"><span>Medições no período</span><span className="metric-icon history" aria-hidden="true">◷</span></div>
            <strong className="metric-value">{measurements.length}</strong>
            <span className="metric-caption">Registros preservados no histórico</span>
          </article>
          <article className="metric-card card">
            <div className="metric-heading"><span>Alertas de tensão baixa</span><span className="metric-icon warning" aria-hidden="true">!</span></div>
            <strong className="metric-value">{alerts.length}</strong>
            <span className="metric-caption">Abaixo do limite configurado</span>
          </article>
        </section>

        <section className="card chart-card">
          <div className="section-heading">
            <div>
              <h2>Histórico de tensão</h2>
              <p>Valores coletados ao longo do período selecionado.</p>
            </div>
          </div>
          {chartData.length ? (
            <div className="chart-wrap" role="img" aria-label="Gráfico de tensão em volts ao longo do tempo">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 14, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#e8edf0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="timestamp" tickFormatter={(value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))} minTickGap={28} />
                  <YAxis domain={["auto", "auto"]} width={54} unit=" V" />
                  <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value) => [`${Number(value).toFixed(2)} V`, "Tensão"]} />
                  <Legend />
                  {Object.keys(comparison).map((id, index) => {
                    const item = equipment.find((entry) => entry.id === id);
                    return <Line key={id} name={item?.name ?? id} type="monotone" dataKey={id} stroke={colors[index % colors.length]} strokeWidth={2.5} dot={false} connectNulls />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">{loading ? "Carregando medições…" : "Nenhuma medição encontrada para este período."}</div>
          )}
          <div className="chart-footer">
            <span>Última atualização: {lastUpdated ? formatDate(lastUpdated.toISOString()) : "—"}</span>
            <span>Máximo de 2.000 pontos por série</span>
          </div>
        </section>

        <div className="lower-grid">
          <section className="card compare-card">
            <div className="section-heading">
              <div><h2>Comparar equipamentos</h2><p>Selecione equipamentos para sobrepor as tendências.</p></div>
            </div>
            <div className="comparison-list">
              {equipment.map((item, index) => (
                <label className="comparison-option" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.id === selectedId || compareIds.includes(item.id)}
                    disabled={item.id === selectedId}
                    onChange={() => toggleComparison(item.id)}
                  />
                  <span className="legend-swatch" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
                  <span>{item.name}</span>
                  {item.id === selectedId && <span className="selected-tag">Selecionado</span>}
                </label>
              ))}
              {!equipment.length && <div className="empty-state compact">Nenhum equipamento cadastrado.</div>}
            </div>
          </section>

          <section className="card periods-card">
            <div className="section-heading">
              <div><h2>Tendências de carga e descarga</h2><p>Classificação baseada na variação da tensão.</p></div>
            </div>
            {periods.length ? (
              <ul className="period-list">
                {periods.slice(-5).reverse().map((period, index) => (
                  <li key={`${period.started_at}-${index}`}>
                    <span className={`period-icon ${period.state}`} aria-hidden="true">{period.state === "charging" ? "↗" : period.state === "discharging" ? "↘" : "–"}</span>
                    <span><strong>{period.state === "charging" ? "Possível carga" : period.state === "discharging" ? "Possível descarga" : "Indeterminado"}</strong><small>{formatDate(period.started_at)} – {formatDate(period.ended_at)}</small></span>
                  </li>
                ))}
              </ul>
            ) : <div className="empty-state compact">{selectedBattery ? "Ainda não há dados suficientes para inferir tendências." : "Sem bateria associada ao equipamento."}</div>}
          </section>
        </div>

        <section className="card alerts-card">
          <div className="section-heading">
            <div><h2>Alertas recentes</h2><p>Leituras abaixo do limite configurado.</p></div>
            <span className={`alert-count ${alerts.length ? "has-alerts" : ""}`}>{alerts.length} alerta{alerts.length === 1 ? "" : "s"}</span>
          </div>
          {alerts.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Ocorrência</th><th>Tensão observada</th><th>Limiar</th><th>Classificação</th></tr></thead>
                <tbody>{alerts.slice(0, 8).map((alert) => (
                  <tr key={alert.id}>
                    <td>{formatDate(alert.created_at ?? alert.measured_at)}</td>
                    <td>{alert.voltage === undefined ? "—" : `${alert.voltage.toFixed(2)} V`}</td>
                    <td>{alert.threshold.toFixed(2)} V</td>
                    <td><span className="status-pill">Tensão baixa</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="empty-state compact">Nenhum alerta para o equipamento e período consultados.</div>}
        </section>
      </main>
    </div>
  );
}

export default App;
