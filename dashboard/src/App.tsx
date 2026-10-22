import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* duas paletas porque as cores "seguras" do claro somem no fundo grafite.
   daltônico continua protegido: o tracejado vem junto em qualquer tema. */
const paletteDark = ["#22d3ee", "#fbbf24", "#a78bfa", "#f472b6"];
const paletteLight = ["#087f8c", "#f08a4b", "#536dfe", "#aa6fca"];
// cor sozinha NÃO conta história pra quem é daltônico. por isso a 2a linha é tracejada,
// a 3a pontilhada, etc. peguei a ideia daquele dashboard de usina que vi uma vez. bom demais.
const dashArrays = ["", "8 4", "4 4", "12 4"];

function asInputDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value?: string): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function App() {
  // default é auto: a página segue o tema do sistema enquanto ninguém escolher
  // outra coisa. escolha manual persiste até a pessoa voltar pro auto.
  const [choice, setChoice] = useState<string>(() => localStorage.getItem("dashboard_theme") ?? "auto");
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [textSize, setTextSize] = useState<string>(() => localStorage.getItem("dashboard_text_size") ?? "normal");
  const [contrast, setContrast] = useState<boolean>(() => localStorage.getItem("dashboard_contrast") === "high");
  const settingsRef = useRef<HTMLDialogElement>(null);
  const theme = choice === "auto" ? (systemDark ? "dark" : "light") : choice;
  // gráfico animando pra quem pediu menos movimento é tortura, não feedback
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // aplica tudo no <html> e persiste as escolhas, senão a pessoa perde no F5
  // e fica com raiva de nós. eu teria raiva.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.dataset.textSize = textSize;
    document.documentElement.toggleAttribute("data-contrast", contrast);
    localStorage.setItem("dashboard_theme", choice);
    localStorage.setItem("dashboard_text_size", textSize);
    if (contrast) localStorage.setItem("dashboard_contrast", "high");
    else localStorage.removeItem("dashboard_contrast");
    // UI do browser (barra de endereço etc) acompanha o tema da página
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f5f7f8" : "#0a0f14");
  }, [choice, contrast, textSize, theme]);

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
  // um único lugar decide o tema do desenho; nada de if/theme espalhado igual migalha
  const palette = theme === "light" ? paletteLight : paletteDark;
  const isDark = theme !== "light";
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
          <img className="brand-mark" src="/favicon.svg" alt="" width="32" height="32" />
          <span>Battery<span className="brand-light">Monitor</span></span>
        </a>
        <button className="header-btn" type="button" onClick={() => settingsRef.current?.showModal()} aria-label="Configurações de aparência e acessibilidade" title="Configurações">⚙️</button>
      </header>

      {/* dialog nativo: foco preso, Esc fecha e screen reader anuncia de graça */}
      <dialog className="settings-dialog" ref={settingsRef} aria-label="Configurações de aparência e acessibilidade">
        <div className="settings-head">
          <h2>Configurações</h2>
          <button className="settings-close" type="button" aria-label="Fechar configurações" onClick={() => settingsRef.current?.close()}>✕</button>
        </div>
        <fieldset>
          <legend>Tema</legend>
          <label className="settings-option"><input type="radio" name="theme-choice" value="auto" checked={choice === "auto"} onChange={() => setChoice("auto")} /> Automático (sistema)</label>
          <label className="settings-option"><input type="radio" name="theme-choice" value="light" checked={choice === "light"} onChange={() => setChoice("light")} /> Claro</label>
          <label className="settings-option"><input type="radio" name="theme-choice" value="dark" checked={choice === "dark"} onChange={() => setChoice("dark")} /> Escuro</label>
        </fieldset>
        <fieldset>
          <legend>Tamanho do texto</legend>
          <label className="settings-option"><input type="radio" name="text-size" value="normal" checked={textSize === "normal"} onChange={() => setTextSize("normal")} /> Normal</label>
          <label className="settings-option"><input type="radio" name="text-size" value="large" checked={textSize === "large"} onChange={() => setTextSize("large")} /> Grande</label>
          <label className="settings-option"><input type="radio" name="text-size" value="xlarge" checked={textSize === "xlarge"} onChange={() => setTextSize("xlarge")} /> Maior</label>
        </fieldset>
        <label className="settings-option"><input type="checkbox" checked={contrast} onChange={(event) => setContrast(event.target.checked)} /> Alto contraste</label>
      </dialog>

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
                  <CartesianGrid stroke={isDark ? "#182430" : "#e8edf0"} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="timestamp" tick={{ fill: isDark ? "#8b98a5" : "#54636b" }} stroke={isDark ? "#243140" : "#cbd5e1"} tickFormatter={(value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))} minTickGap={28} />
                  <YAxis domain={["auto", "auto"]} width={54} unit=" V" tick={{ fill: isDark ? "#8b98a5" : "#54636b" }} stroke={isDark ? "#243140" : "#cbd5e1"} />
                  <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value) => [`${Number(value).toFixed(2)} V`, "Tensão"]} contentStyle={isDark ? { background: "#10161e", border: "1px solid #1c2836", borderRadius: 8, color: "#e6edf3" } : undefined} />
                  <Legend />
                  {Object.keys(comparison).map((id, index) => {
                    const item = equipment.find((entry) => entry.id === id);
                    // ó, 2000 pontos com bolinha em cada = tapete de Natal. só mostra os dots
                    // quando a série cabe no olho (≤200). no hover o dot sempre aparece, pode confiar.
                    return <Line key={id} name={item?.name ?? id} type="monotone" dataKey={id} stroke={palette[index % palette.length]} strokeWidth={2.5} strokeDasharray={dashArrays[index % dashArrays.length]} dot={chartData.length <= 200 ? { r: 3.5 } : false} activeDot={{ r: 5 }} connectNulls isAnimationActive={!reducedMotion} aria-label={`${item?.name ?? id} - linha ${index === 0 ? "contínua" : "tracejada"}`} />;
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
                  <span className="legend-swatch" style={{ backgroundColor: palette[index % palette.length] }} aria-hidden="true" />
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
