# Testes e verificação

## Automatizados

```powershell
npm test
npm run build
```

Os testes atuais cobrem validação do contrato e unidade de tensão, rejeição de timestamps futuros, classificação experimental de tendências, respostas HTTP, rejeição de intervalos invertidos e deduplicação no adapter de memória.

## Fluxo demonstrativo local

Após subir PostgreSQL com Docker Compose, aplicar migração e gerar os dados de exemplo:

```powershell
docker compose -f infra/compose.yaml up -d
Copy-Item .env.example .env
npm run migrate --workspace backend
npm run seed --workspace backend
npm run dev:backend
```

Em outro terminal, executar `npm run dev:dashboard`. Abra `http://localhost:5173`; o dashboard consulta a API via proxy Vite. O script de seed é seguro para repetição e usa exclusivamente medições sintéticas.

Para visualizar sem Docker/PostgreSQL, defina temporariamente `DEMO_IN_MEMORY=true` no processo do backend. O backend também inicia o broker MQTT embutido nesse modo. A demonstração gera 48 medições artificiais e perde alterações ao reiniciar; não substitui a verificação de persistência em PostgreSQL.

Para publicar a partir do ESP32 no Wokwi, configure `device/src/config.h` com um endereço e porta do broker do backend que o simulador consiga alcançar. O broker escuta apenas em `127.0.0.1` por padrão; para acesso externo, configure `MQTT_BIND_HOST=0.0.0.0`. A topologia de rede Wokwi varia; endereço alcançável não é presumido nem incluído como valor padrão. O broker não tem autenticação/TLS, então limite-o a uma rede isolada.

Docker, PlatformIO e acesso ao Wokwi não estão disponíveis/validados automaticamente neste repositório. Testes de bancada e de campo, erro metrológico, continuidade após perda de energia e conectividade industrial requerem ensaios próprios e autorização.
