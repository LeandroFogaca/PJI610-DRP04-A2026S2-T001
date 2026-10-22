# Refatoração Frontend — Dashboard & Simulador IoT

**Data:** 2026-10-21  
**Autor:** OpenCode (com requisitos do usuário)  
**Telas:** Visão da Operação (dashboard) + Simulador ESP32

---

## 1. Intent e Porquê

A interface atual do dashboard IoT apresenta baixa hierarquia visual e contraste insuficiente em textos auxiliares, o que retarda a leitura e aumenta erros humanos na análise de anomalias. O objetivo é refatorar as duas telas para atingir WCAG 2.1 AA, reduzir sobrecarga cognitiva e deixar a diferença entre ações claras (affordance).

## 2. Goals

- Contraste mínimo 4.5:1 em todos os textos auxiliares (WCAG AA)
- Gráficos acessíveis para daltônicos (não depender só de cor)
- Badges de status com contraste real contra o fundo
- Inputs de filtro agrupados em superfície visual coesa
- Seções de parâmetros do simulador colapsáveis (accordion)
- Hierarquia clara entre ações primárias, secundárias e destrutivas

## 3. Non-goals / Anti-goals

- Não mudar lógica de negócio, API, ou backend
- Não adicionar dependências (sem libs de accordion — CSS/JS puro)
- Não alterar o contrato de telemetria MQTT
- Não refatorar testes existentes

## 4. Constraints

- Dashboard: React + CSS puro (sem Tailwind — o projeto não usa)
- Simulador: HTML/CSS/JS puro (sem build)
- Manter dark mode funcional no simulador
- Sem quebra de funcionalidade existente

## 5. Changes — Dashboard (`dashboard/src/App.tsx` + `styles.css`)

### 5.1 Contraste de textos auxiliares (WCAG AA 4.5:1)

| Seletor | Cor atual | Contraste atual | Nova cor | Contraste novo |
|---------|-----------|----------------|----------|---------------|
| `.metric-caption` | `#74818a` (var(--muted)) | ~4.5:1 borderline | `#54636b` | ~6.8:1 |
| `.subheading` | `#74818a` | ~4.5:1 | `#54636b` | ~6.8:1 |
| `.section-heading p` | `#74818a` | ~4.5:1 | `#54636b` | ~6.8:1 |
| `.chart-footer` | `#8a969d` | ~3.0:1 FAIL | `#5a6870` | ~5.8:1 |
| `.period-list small` | `#74818a` | ~4.5:1 | `#54636b` | ~6.8:1 |
| `.filters label` | `#65737c` | ~5.6:1 OK | manter | — |
| `.selected-tag` | `#829097` | ~3.4:1 FAIL | `#5a6870` | ~5.8:1 |
| `th` (tabela alertas) | `#859198` | ~3.2:1 FAIL | `#54636b` | ~6.8:1 |

### 5.2 Gráfico — acessibilidade para daltônicos

- Linha do 2º equipamento: adicionar `strokeDasharray="8 4"` (tracejado)
- Adicionar `dot={true}` com r=3.5 em todas as linhas (marcadores geométricos nos pontos)
- Adicionar `activeDot={{ r: 5 }}` para hover
- Adicionar `aria-label` descritivo em cada `<Line>` com nome do equipamento

### 5.3 Badge "Tensão baixa" — contraste

- `.status-pill` atual: `background: #fff0e9; color: #b34b28` → ~4.6:1 (borderline)
- Nova cor: `color: #8b2e1e` → ~7.2:1 (AA compliant)
- Escurecer também `.alert-count.has-alerts` de `#b34b28` para `#8b2e1e`

### 5.4 Agrupamento visual dos filtros

- Adicionar `background: #fafbfc` (ou `var(--surface)`) nos filtros para criar superfície distinta
- Adicionar `border: 1px solid #dce3e7` mais pronunciada
- Adicionar `border-radius: 14px` maior
- Ajustar `gap` interno para 12px e padding para 20px
- Alinhar labels e inputs em grid consistente

### 5.5 Footer do chart — agrupar informação

- `.chart-footer` atual: dois spans flutuando. Manter estrutura, apenas corrigir cor.

## 6. Changes — Simulador (`device/simulator/public/index.html`)

### 6.1 Unificação visual com dashboard

**Objetivo:** mesmo design system (fonte, cores, espaçamento, border-radius).

- **Fonte:** `Plus Jakarta Sans` → `Segoe UI, Arial, sans-serif` (igual dashboard)
- **Fonte mono:** manter `JetBrains Mono` para valores numéricos (tensão, IDs)
- **Background:** remover gradientes radiais decorativos → `#f5f7f8` (claro) / `#0d131a` (escuro)
- **Cards:** `border-radius: 18px` → `12px`, borda `#e2e8f0` → `#e6ebee`, sombra mais sutil
- **Botões:** remover `linear-gradient` → teal sólido `#087f8c` (igual dashboard `.button`)
- **Botões hover:** `#066c77` (igual dashboard)
- **Border-radius botões:** `9px` → `7px`
- **Header:** remover `backdrop-filter: blur` → fundo sólido `#fff` com borda inferior
- **Brand icon:** remover gradiente → teal sólido `#087f8c` (igual `.brand-mark` do dashboard)

### 6.2 Dark mode — adaptado para design system unificado

Manter dark mode, mas usar mesmas variáveis de cor do dashboard quando possível:

**Variáveis CSS (dark mode):**
```css
[data-theme="dark"] {
  --bg: #0d131a;
  --card-bg: #1a2332;
  --card-border: #2a3544;
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --teal: #06b6d4;
  --teal-hover: #0891b2;
  --input-bg: #111822;
  --input-border: #243242;
}
```

**Toggle de tema:** manter botão no header, mas estilizar igual dashboard (sem gradiente)

### 6.3 Accordion para parâmetros

Duas seções ficam colapsáveis: "Configuração de Telemetria e Dreno" e "Limiares de Tensão".

Implementação: `<details>` + `<summary>` nativos do HTML, estilizados como accordion.
- Fechados por padrão (`<details>` sem atributo `open`)
- Ícone de seta rotaciona ao expandir
- Transição suave de altura
- Acessível: `<summary>` é focável e anuncia expansão em screen readers

### 6.4 Hierarquia de botões — ações por dispositivo

- **"Salvar Parâmetros"**: mantém `btn-primary` (sólido teal, maior peso visual)
- **"Trocar Bateria"**: muda de `btn-secondary` (fundo sólido) para estilo **outline/ghost**:
  - `background: transparent; border: 1px solid var(--teal); color: var(--teal);`
  - Hover: fundo sutil teal com opacidade baixa
  - Peso visual menor que Salvar

### 6.5 Ações em massa — diferenciação

- **"Ligar Todos"**: `btn-primary` (sólido teal) — ação positiva
- **"Desligar Todos"**: estilo outline com borda sutil, **sem preenchimento**:
  - `background: transparent; border: 1px solid var(--input-border); color: var(--text-main);`
  - Hover: borda mais escura, sem mudança drástica
  - Isso cria fricção visual para ação destrutiva/de interrupção

### 6.6 Badges de status do simulador

- `.phase-badge.normal`: background #ecfdf5 + color #059669 → ~3.0:1 (FAIL para texto 11px bold)
  - Ajustar para `#047857` → ~4.7:1
- `.phase-badge.warning`: background #fffbeb + color #d97706 → ~2.1:1 (FAIL)
  - Ajustar para `#92400e` → ~5.2:1
- `.phase-badge.critical`: background #fef2f2 + color #dc2626 → ~3.1:1 (FAIL)
  - Ajustar para `#991b1b` → ~5.9:1
- Dark mode equivalents também ajustados

### 6.7 Textos auxiliares do simulador

- `.telemetry-label`, `.meta-metrics`, `.form-row-label span`: verificar e corrigir contraste
- `--text-muted` no tema claro: `#64748b` → ~4.5:1 (borderline, OK para bold)
- Para textos não-bold abaixo de 14px, escurecer para `#475569`

## 7. O que fica a cargo do implementador

- Detalhes exatos de pixels (padding, border-radius) — seguir o design system existente
- Nomes de variáveis CSS novas — usar padrão do projeto
- Transições de accordion — suave mas rápida (200ms)

## 8. Arquivos modificados

| Arquivo | Mudanças |
|---------|----------|
| `dashboard/src/App.tsx` | strokeDasharray no 2º Line, dots ativos |
| `dashboard/src/styles.css` | Cores de contraste, agrupamento filtros |
| `device/simulator/public/index.html` | Accordions, hierarquia botões, contraste badges |

## 9. Verificação

- Rodar `npm run test` no backend (sem quebra)
- Abrir dashboard em `http://localhost:5173` e verificar visual
- Abrir simulador em `http://localhost:4000` e verificar accordions + botões
- Usar extensão de contraste (ou DevTools) para validar WCAG AA
