# Dispositivo ESP32 — simulação v1.0

O circuito Wokwi usa um potenciômetro ligado exclusivamente ao ADC GPIO34 para **simular** tensão. A escala didática vai de 0 a 48 V; não representa calibração de bateria nem autoriza conexão a hardware real.

## 1. Painel Web de Simulação Multi-Dispositivos (Recomendado)

O módulo conta com um **gerenciador web nativo** para instanciar e controlar múltiplos dispositivos ESP32 simulados de forma independente e visual, conectado diretamente ao broker MQTT.

### Como executar:

A partir da raiz do monorepositório:
```bash
npm run device:simulate:ui
```
Ou dentro do diretório `device/`:
```bash
npm run simulate:ui
```

Abra no navegador: **`http://localhost:4000`**

### Recursos da Interface Web:
- **Múltiplos Dispositivos**: Inicia com `esp32-001` (ativo) e `esp32-002` (em standby).
- **Controle Liga/Desliga**: Chaves individuais de ativação por dispositivo e botões globais *"Ligar Todos"* e *"Desligar Todos"*.
- **Criação Dinâmica**: Botão *"+ Novo Dispositivo"* para instanciar novos ESP32 com seus respectivos equipamentos associados (`eq-003`, etc.) sem reiniciar o servidor.
- **Ajuste de Parâmetros em Tempo Real**:
  - **Dreno Normal**: Faixa configurável de consumo por amostra (padrão aleatório entre 0,00 V e 0,05 V).
  - **Dreno Acelerado**: Faixa configurável em subtensão (padrão aleatório entre 0,05 V e 0,10 V).
  - **Intervalo de Envio**: Em milissegundos, com atalhos rápidos de 1s, 2s e 5s.
  - **Limiares de Tensão**: Tensão de bateria nova, alerta de subtensão e corte crítico.
- **Troca de Bateria 🔄**: Botão para simular a substituição imediata da bateria por uma 100% recarregada, facilitando testes de ciclos e alertas no dashboard.
- **Tema Visual**: Suporte a Tema Claro (padrão) e Tema Escuro, com alternância no botão *"🌙 Escuro"* / *"☀️ Claro"*.

---

## 2. Simulador em Linha de Comando (CLI)

O simulador em linha de comando publica dados sintéticos de um único dispositivo no mesmo broker e contrato usados pelo firmware ESP32. Ele não requer PlatformIO, Wokwi, Docker nem Mosquitto: o próprio backend inicia o broker MQTT local.

Na raiz do repositório, abra dois terminais (PowerShell, Bash ou Zsh). No primeiro, inicie a API em modo demonstrativo e em memória:

```bash
npm install
npm run dev:backend
```

No segundo terminal, inicie o simulador CLI:

```bash
npm run device:simulate
```

O backend inicia a API em `http://127.0.0.1:3000` e o broker em `127.0.0.1:1883`. O simulador publica imediatamente e, por padrão, a cada 15 segundos em `telemetry/v1/esp32-001/measurements`. Os dados têm `quality: "simulated"` e uma tensão didática variável em torno de 24 V, limitada à escala de 0 a 48 V. Pressione `Ctrl+C` no terminal de cada processo para encerrar.

Para trocar a identidade, o broker ou o intervalo na CLI, configure as variáveis de ambiente antes de iniciar:

```bash
DEVICE_ID="esp32-002" SAMPLE_INTERVAL_MS="5000" npm run device:simulate
```

Para exibir as medições no dashboard, inicie-o em outro terminal com `npm run dev:dashboard` e abra `http://localhost:5173`. A API ingere mensagens MQTT em tempo real enquanto estiver em execução.

---

## 3. Variáveis de Ambiente do Simulador (`device/.env`)

As configurações padrão do simulador podem ser personalizadas no arquivo `device/.env`:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | URL do broker MQTT |
| `WEB_PORT` | `4000` | Porta do servidor HTTP do Painel de Simulação |
| `DEVICE_ID` | `esp32-001` | Identificador padrão do primeiro dispositivo |
| `EQUIPMENT_ID` | `eq-001` | Identificador do equipamento associado |
| `SAMPLE_INTERVAL_MS` | `1500` | Intervalo padrão entre amostras (ms) |
| `BATTERY_DRAIN_NORMAL_MIN` | `0.00` | Dreno mínimo normal por amostra (V) |
| `BATTERY_DRAIN_NORMAL_MAX` | `0.05` | Dreno máximo normal por amostra (V) |
| `BATTERY_DRAIN_ACCELERATED_MIN` | `0.05` | Dreno mínimo acelerado por amostra (V) |
| `BATTERY_DRAIN_ACCELERATED_MAX` | `0.10` | Dreno máximo acelerado por amostra (V) |

---

## 4. Preparar e compilar Firmware Real (ESP32)

1. Instale PlatformIO Core ou a extensão PlatformIO no VS Code.
2. Edite `src/config.h` com o endereço do broker MQTT iniciado pelo backend e alcançável pelo simulador. O host MQTT vem vazio de propósito: nenhum endereço da máquina ou da rede é presumido. Para usar o ESP32/Wokwi, configure `MQTT_BIND_HOST` no `.env` do backend com um endereço acessível pelo simulador; não exponha o broker sem autenticação a redes não confiáveis.
3. Compile no diretório `device/` com `pio run`.
4. Abra o projeto Wokwi usando `device/wokwi.toml`; o diagrama está em `wokwi/diagram.json`.

O firmware publica `telemetry/v1/{device_id}/measurements` com QoS 1. `Preferences` reserva identificadores em blocos na NVS para evitar reutilização entre reinicializações; uma fila circular em RAM (32 medições) conserva amostras durante quedas de Wi-Fi/MQTT e reenvia a mais antiga após reconectar. Ao atingir a capacidade, descarta a amostra pendente mais antiga e registra o ocorrido no Serial. A fila não sobrevive à perda de energia/reinicialização.

O relógio é sincronizado via NTP. Enquanto não houver horário confiável, o firmware registra a falha no Serial e não fabrica timestamps. O payload identifica a qualidade como `simulated`.

**Segurança:** este circuito, escala e firmware são apenas demonstrativos. Não ligar bateria, divisor ou outro sinal real ao ESP32. Qualquer aquisição física exigiria projeto elétrico, proteções, dimensionamento e autorização operacional próprios.
