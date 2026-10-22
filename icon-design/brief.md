# Icon brief: BatteryMonitor IoT

Produto: plataforma de observação de tensão de baterias de equipamentos de movimentação de cargas (empilhadeiras) — ESP32 + MQTT + dashboard de ciclos de carga/descarga.
Público: operadores e engenheiros de logística industrial (uso: favicon, avatar, PWA, loja).
Vizinhos de categoria: Grafana, apps de "charging station", indicadores de bateria de SO, dashboards IoT genéricos.

**Clichês da categoria a evitar (silhueta, não estilo):** retângulo de bateria com terminal (barra de status do celular), raio/zap (energia), linha de pulso/EKG (monitoramento), velocímetro redondo (métrica), bateria+raio combinados = "carregando" (glyph universal de UI).

## Conceitos

### 1. Serra de ciclos  (eixo: horizontal)
Depicts: "uma lâmina de serra"
Metáfora: o dente da serra É o dente do gráfico tensão-tempo — descarga em rampa, recarga em subida, repetido para sempre como a frota trabalhando. Dente = ciclo.
Gestalt device: similarity-break (fileira de dentes repetidos; **um** dente em cor de destaque = o alerta detectado).
16px risk: fileira longa vira pente/zíper — usar 4 dentes grossos, break visível mesmo em 16px.
Distinct from: não é bateria, não é raio, não é pulso (linhas finas); é corpo sólido com dentes.
Not a UI glyph: chevron duplicado? Não — chevrons são 2 setas soltas; a lâmina é uma massa fechada com dentes integrados. Pente não é controle de sistema.

### 2. O farol  (eixo: vertical)
Depicts: "um farol"
Metáfora: o sistema é observacional por contrato — ele vê, ilumina e avisa; nunca toca no equipamento. Farol = vigilância sem intervenção.
Gestalt device: figure-ground (o feixe de luz recortado no vazio à direita da torre, na cor de destaque).
16px risk: o feixe morre primeiro — a torre sozinha ainda precisa ler como farol (base larga, galeria, topo afunilando).
Distinct from: escudo/cadeado (segurança) e pin (localização) — silhueta de torre com topo de lanterna não confunde com nenhum.
Not a UI glyph: testado contra location-pin e play — a lanterna horizontal no topo quebra a leitura de pin.

### 3. O garfo  (eixo: vertical)
Depicts: "um garfo de paleteira"
Metáfora: monitoramos a frota, não a pilha. O objeto mais industrial do domínio sem ser bateria — honesto sobre quem é o usuário.
Gestalt device: closure (dois dentes + dorso sugerem o H do garfo; o olho fecha a base).
16px risk: dentes colapsam e vira tridente/embalagem de comida — risco real com garfo doméstico; precisa de dentes largos e dorso pesado.
Distinct from: de tudo na categoria, mas exige teste cego (garfo = talher na cabeça das pessoas).
Not a UI glyph: nenhum controle de sistema tem dois dentes paralelos grossos.

### 4. Voltímetro de painel  (eixo: vertical)
Depicts: "um painel de ponteiro"
Metáfora: medição analógica honesta — o avô direto do dashboard. Um retângulo (painel) com ponteiro recortado do disco.
Gestalt device: figure-ground (ponteiro knockout no disco).
16px risk: ponteiro é detalhe fino — precisa ser cunha grossa, senão some e fica quadrado em branco.
Distinct from: velocímetro redondo (o clichê) — aqui o formato quadrado de painel industrial separa.
Not a UI glyph: testado contra settings-gear — sem dentes, sem confusão.

## Palette
Background #2A2A2E · Glyph #E8E8EA · Accent #22d3ee (ciano do Ops Center do próprio dashboard — um só tom, usado no dente-alerta/feixe/ponteiro)

Monocromático primeiro: se o conceito não ler só em #E8E8EA sobre #2A2A2E, descarta.

## Recommendation
**1. Serra de ciclos** — único conceito que codifica o que o produto *faz* (detecta ciclos e anomalias) em vez do que ele *monitora* (bateria = categoria benta). O dente em destaque conta a história do alerta sem texto.
Vice: **2. O farol**, se a persona preferir algo menos "industrial pesado" e mais guardião.
