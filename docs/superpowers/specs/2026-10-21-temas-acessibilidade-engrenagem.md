# Temas, Engrenagem e Alinhamento do Header

**Data:** 2026-10-21
**Autor:** OpenCode (com requisitos do usuário)
**Telas:** Visão da Operação (dashboard) + Simulador ESP32 (parcial)
**Status:** Implementado e verificado

---

## 1. Intent e Porquê

O tema padrão era dark fixo com toggle de dois estados, sem respeitar o sistema da pessoa, e o
header do dashboard ficava ~20px fora do eixo da coluna de conteúdo em telas largas (16:9/21:9).
Faltava um ponto único para preferências de acessibilidade. Esta entrega resolve os três pontos.

## 2. Escopo

### 2.1 Tema automático (duas páginas)

- Default sem escolha salva: segue `prefers-color-scheme` do SO e reage a mudanças ao vivo
  (`matchMedia` + listener `change`).
- Escolha manual persiste em `localStorage` (`dashboard_theme`: `auto|light|dark`;
  `simulator_theme`: idem) até voltar ao auto.
- Script inline no `<head>` aplica `data-theme`/`data-text-size`/`data-contrast` antes do
  primeiro paint — sem flash de tema errado.
- Valores antigos (`"dark"`/`"light"` gravados pelo comportamento anterior) continuam válidos
  como escolha manual.

### 2.2 Engrenagem de configurações (só dashboard)

- Botão `⚙️` no header substitui o antigo toggle `☀️/🌙` (um ponto de entrada só).
- Abre `<dialog>` nativo via `showModal()`: foco preso, Esc e anúncio para leitor de tela vêm
  do browser, sem lib.
- Conteúdo:
  - **Tema:** radio Automático (sistema) / Claro / Escuro.
  - **Tamanho do texto:** radio Normal / Grande / Maior → CSS `zoom` 1 / 1.15 / 1.3 no
    `html` (escala tudo, gráficos inclusos; evita reescrever `font-size` em `rem`).
  - **Alto contraste:** checkbox → atributo `data-contrast` no `html` sobrescreve variáveis
    de cor (texto, bordas, linhas) e engrossa o `:focus-visible` (anel amarelo), sobre claro
    e escuro.
- Persistência: `dashboard_theme`, `dashboard_text_size`, `dashboard_contrast`.

### 2.3 Simulador (sem engrenagem — página de debug/demo)

- Botão do header vira ciclo de 3 estados: `🌗 Auto → ☀️ Claro → 🌙 Escuro → Auto`, com o
  rótulo mostrando a escolha atual.
- Mesma resolução de auto + listener do SO + anti-flash.
- `prefers-reduced-motion: reduce` desativa transições/animações via media query.

### 2.4 Movimento reduzido no dashboard

- Sem toggle no painel; `matchMedia("(prefers-reduced-motion: reduce)")` desliga a animação
  de entrada das linhas do Recharts (`isAnimationActive={!reducedMotion}`).

### 2.5 Alinhamento do header (dashboard)

- Causa: `.topbar` centralizava com `calc((100vw - 1240px) / 2)` (borda da caixa, e `100vw`
  conta a barra de rolagem), enquanto `.content` tem 28px de padding interno → offset de
  ~20px, crescente na percepção em telas ultralargas.
- Fix: `padding-inline: max(28px, calc(50% - 592px))` (592 = 620 − 28), % relativo ao width
  real da topbar. Mobile: padding 17 → 16px casando com `.content`.
- Verificado no browser: gap ícone→h1 era 20,5px, passou a 0; borda direita da engrenagem =
  borda direita dos filtros.

## 3. Não-objetivos (anti-scope)

- Sem engrenagem/painel no simulador.
- Sem sincronizar preferências entre as páginas (origens `:5173` e `:4000` — localStorage não
  conversa entre si, e não foi criado mecanismo para isso).
- Sem toggle de redução de movimento, fonte "dislexia" ou modo daltônico no painel (daltonismo
  já é coberto pelo tracejado permanente dos gráficos).
- Sem libs novas, sem mudança de API/backend/contratos.

## 4. Arquivos modificados

| Arquivo | Mudanças |
|---------|----------|
| `dashboard/index.html` | Script inline anti-flash (tema/tamanho/contraste) |
| `dashboard/src/App.tsx` | Estado auto + `matchMedia` live; dialog de configurações; `isAnimationActive` |
| `dashboard/src/styles.css` | Alinhamento do header; `.header-btn`; dialog; `zoom`; bloco `[data-contrast]` |
| `device/simulator/public/index.html` | Ciclo auto/claro/escuro com listener do SO; anti-flash; `prefers-reduced-motion` |

## 5. Verificação executada

- `tsc -b` no dashboard: sem erros.
- `npm test` no device: 5/5.
- Browser (Chromium, viewport 1936px): alinhamento medido `gap: 0`; primeira visita com
  localStorage limpo resolve auto→tema do SO; engrenagem aplica light+grande+alto contraste
  (`data-theme`, `zoom: 1.15`, `data-contrast` confirmados); persistência sobrevive a F5;
  ciclo do simulador testado clique a clique (rótulo/atributo/storage em cada estado).
- Não testado: troca de tema do SO ao vivo (exigiria mudar o Windows) e proporção 21:9 real
  (a fórmula é percentual e vale para qualquer largura).
