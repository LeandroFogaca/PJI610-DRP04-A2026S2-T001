# Dispositivo ESP32 — simulação v1.0

O circuito Wokwi usa um potenciômetro ligado exclusivamente ao ADC GPIO34 para **simular** tensão. A escala didática vai de 0 a 48 V; não representa calibração de bateria nem autoriza conexão a hardware real.

## Simulador executável no Windows

O simulador local publica dados sintéticos no mesmo broker e contrato usados pelo firmware ESP32. Ele não requer PlatformIO, Wokwi, Docker nem Mosquitto: o próprio backend inicia o broker MQTT local.

Na raiz do repositório, abra dois terminais PowerShell. No primeiro, inicie a API em modo demonstrativo e em memória:

```powershell
npm install
$env:DEMO_IN_MEMORY = "true"
npm run dev:backend
```

No segundo terminal, inicie o simulador:

```powershell
npm run device:simulate
```

O backend inicia a API em `http://127.0.0.1:3000` e o broker em `127.0.0.1:1883`. O simulador publica imediatamente e, por padrão, a cada 15 segundos em `telemetry/v1/esp32-001/measurements`. Os dados têm `quality: "simulated"` e uma tensão didática variável em torno de 24 V, limitada à escala de 0 a 48 V. Pressione `Ctrl+C` no terminal de cada processo para encerrar.

Para trocar a identidade, o broker ou o intervalo, configure as variáveis antes de iniciar:

```powershell
$env:DEVICE_ID = "esp32-002"
$env:SAMPLE_INTERVAL_MS = "5000"
npm run device:simulate
```

Para exibir as medições no dashboard, inicie-o em um terceiro terminal com `npm run dev:dashboard` e abra `http://localhost:5173`. A API ingere mensagens MQTT em tempo real enquanto estiver em execução. No modo demonstrativo, os dados são mantidos apenas em memória e se perdem quando a API é encerrada. Para a demonstração com persistência, configure o `.env` e siga as instruções de banco de dados da raiz do repositório; o broker MQTT continua sendo iniciado pelo backend.

## Preparar e compilar

1. Instale PlatformIO Core ou a extensão PlatformIO no VS Code.
2. Edite `src/config.h` com o endereço do broker MQTT iniciado pelo backend e alcançável pelo simulador. O host MQTT vem vazio de propósito: nenhum endereço da máquina ou da rede é presumido. Para usar o ESP32/Wokwi, configure `MQTT_BIND_HOST` no `.env` do backend com um endereço acessível pelo simulador; não exponha o broker sem autenticação a redes não confiáveis.
3. Compile no diretório `device/` com `pio run`.
4. Abra o projeto Wokwi usando `device/wokwi.toml`; o diagrama está em `wokwi/diagram.json`.

O firmware publica `telemetry/v1/{device_id}/measurements` com QoS 1. `Preferences` reserva identificadores em blocos na NVS para evitar reutilização entre reinicializações; uma fila circular em RAM (32 medições) conserva amostras durante quedas de Wi-Fi/MQTT e reenvia a mais antiga após reconectar. Ao atingir a capacidade, descarta a amostra pendente mais antiga e registra o ocorrido no Serial. A fila não sobrevive à perda de energia/reinicialização.

O relógio é sincronizado via NTP. Enquanto não houver horário confiável, o firmware registra a falha no Serial e não fabrica timestamps. O payload identifica a qualidade como `simulated`.

**Segurança:** este circuito, escala e firmware são apenas demonstrativos. Não ligar bateria, divisor ou outro sinal real ao ESP32. Qualquer aquisição física exigiria projeto elétrico, proteções, dimensionamento e autorização operacional próprios.
