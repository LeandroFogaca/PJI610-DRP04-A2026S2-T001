# Arquitetura executável v1.0

O protótipo implementa as quatro camadas descritas no relatório parcial:

1. **Percepção:** ESP32 DevKit e potenciômetro no Wokwi; média de 16 leituras no ADC e conversão didática para volts.
2. **Transmissão:** Wi-Fi e MQTT QoS 1; cada mensagem segue `contracts/telemetry/v1/measurement.schema.json`.
3. **Processamento/armazenamento:** Fastify valida HTTP/MQTT, resolve as associações temporais, deduplica, registra alertas e persiste no PostgreSQL.
4. **Apresentação:** React consulta a API REST por HTTP e atualiza o painel periodicamente; não conecta direto ao broker ou banco.

O servidor é um monólito modular. O contrato HTTP está em `contracts/openapi/api.v1.yaml`; o schema inicial do banco está em `backend/src/db/schema.sql`. Migrações são idempotentes e a carga demonstrativa cria dois dispositivos, equipamentos e baterias, vinculados temporalmente.

## Limites e decisões da demonstração

- Dados gerados pelo potenciômetro são sempre marcados `simulated`. Não existe driver de medição física nem calibração elétrica.
- A associação é resolvida pela data/hora de aquisição, e leituras sem associação ficam persistidas com `equipment_id`/`battery_id` nulos.
- A API limita cada consulta histórica a 2.000 pontos. Alertas usam um limiar configurável por ambiente; os valores de demonstração não são recomendação operacional.
- Classificação `charging`/`discharging`/`unknown` é calculada a partir de inclinação da tensão, somente para exploração visual. Não equivale a SoC, SoH, confirmação de recarga nem ciclos completos.
- A fila do dispositivo mantém até 32 itens em RAM durante indisponibilidade da rede e reenvia após reconexão. Identificadores estáveis são alocados por blocos persistidos em NVS; o conteúdo pendente não sobrevive a desligamento/reset.
- O backend inicia um broker MQTT Aedes no próprio processo e assina o tópico de telemetria por um cliente interno. Por padrão, escuta apenas em `127.0.0.1`; não tem autenticação/TLS e não deve ser exposto à internet nem utilizado em campo. Wokwi não recebe um endereço de broker presumido; configure o bind do backend e o host no arquivo local de firmware após estabelecer conectividade.
- Os parâmetros nominais, proteção/condicionamento elétrico, instalação, rede e critérios de alerta do estudo de caso seguem pendentes de caracterização e autorização.

## Segurança física

Não conectar baterias reais ao circuito ou ao ADC. Instalação física não é coberta por este protótipo; requer projeto elétrico independente, condicionamento, proteção, validação técnica e autorização operacional.
