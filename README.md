# account-workflows

Framework de **workflows de cadastro** em TypeScript sobre o [CloakBrowser](https://github.com/CloakHQ/CloakBrowser) (pacote npm `cloakbrowser`, API do Playwright). Cada workflow é uma lista declarativa de passos reutilizáveis (navegar, preencher formulário, enviar e capturar a resposta, extrair texto, asserções…), executada por um runner genérico que gera um relatório JSON por execução e salva screenshot em caso de falha.

O repositório inclui um formulário de cadastro local (`test-site/`) para desenvolver e testar workflows sem depender de sites externos.

## Requisitos

- Node.js 20+ (usa `fetch` nativo e ESM)
- ~200 MB livres para o binário do CloakBrowser

## Instalação

```bash
npm install
```

O binário do navegador (~200 MB) **não** vem no `npm install`: é baixado automaticamente no primeiro uso (primeira execução de um workflow ou do teste e2e).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run demo` | Sobe o formulário local numa porta livre e roda o workflow `local-signup` contra ele (headless). |
| `npm run serve` | Sobe só o formulário de teste em `http://127.0.0.1:3000` (porta via argumento ou `PORT`). |
| `npm run workflow -- list` | Lista os workflows registrados. |
| `npm run workflow -- run <nome> [opções]` | Executa um workflow. |
| `npm run typecheck` | `tsc` (sem emitir arquivos). |
| `npm test` | `vitest run` (o teste e2e só roda com `E2E=1`). |

Opções de `run`:

- `--serve` — sobe o formulário local numa porta livre e usa-o como `baseUrl`
- `--headed` — mostra a janela do navegador (padrão: headless)
- `--humanize` — mouse/teclado com ritmo humano (recurso nativo do CloakBrowser)
- `--slow-mo <ms>` — atraso entre ações, útil para depuração
- `--base-url <url>` — sobrescreve `defaults.baseUrl` do workflow
- `--set campo=valor` — sobrescreve campos do input (repetível; `true`/`false` viram booleanos)

Exemplo:

```bash
npm run workflow -- run local-signup --serve --headed --humanize --set country=PT --set newsletter=true
```

Cada execução grava `runs/<runId>.json` (senhas são substituídas por `[redacted]`) e, se falhar, `runs/<runId>.png`.

Teste ponta a ponta com navegador real:

```bash
E2E=1 npx vitest run tests/e2e.test.ts          # bash
$env:E2E="1"; npx vitest run tests/e2e.test.ts   # PowerShell
```

## Arquitetura

```
 src/cli.ts ──► workflows/index.ts (registry) ──► workflows/<nome>.ts
     │                                               │ defineWorkflow({ steps: [...] })
     ▼                                               ▼
 core/runner.ts ──► core/browser.ts (CloakBrowser)   core/steps.ts (passos reutilizáveis)
     │                                               core/data.ts  (dados falsos)
     ▼
 runs/<runId>.json (+ .png em falha)

 test-site/server.ts + public/index.html  ← formulário local p/ testes
```

- `src/core/types.ts` — tipos (`WorkflowDefinition`, `Step`, `WorkflowContext`, `RunResult`…)
- `src/core/registry.ts` — `defineWorkflow()` (valida a definição) e `WorkflowRegistry`
- `src/core/runner.ts` — `runWorkflow()`: monta o contexto, executa os passos, gera relatório
- `src/core/browser.ts` — abre/fecha a sessão do CloakBrowser
- `src/core/steps.ts` — biblioteca de passos
- `src/core/data.ts` — `fakePerson()` para gerar dados de cadastro
- `tests/` — testes vitest (servidor, registry e e2e opcional)

## Como adicionar um novo workflow

1. Crie `src/workflows/meu-site.ts` exportando `defineWorkflow({...})` por padrão:

```ts
import { fakePerson } from "../core/data.js";
import { defineWorkflow } from "../core/registry.js";
import { fillForm, goto, submitAndCapture, waitVisible } from "../core/steps.js";

interface MeuSiteInput {
  email: string;
  password: string;
}

export default defineWorkflow<MeuSiteInput, unknown>({
  name: "meu-site",
  description: "Cadastro em meu-site.example",
  defaults: { baseUrl: "https://meu-site.example" },

  buildInput(overrides) {
    const { email, password } = fakePerson();
    return { email, password, ...overrides };
  },

  steps: [
    goto("/signup", { waitFor: "form" }),
    fillForm({
      "#email": (ctx) => ctx.input.email,
      "#password": (ctx) => ctx.input.password,
    }),
    submitAndCapture("button[type=submit]", { urlPart: "/api/signup", saveAs: "signup" }),
    waitVisible(".welcome"),
  ],
});
```

2. Registre-o em `src/workflows/index.ts`:

```ts
import localSignup from "./local-signup.js";
import meuSite from "./meu-site.js";

export const registry = new WorkflowRegistry().register(localSignup, meuSite);
```

3. Rode: `npm run workflow -- run meu-site --headed`.

Sem `result`, a saída do workflow é `ctx.state`. Use `src/workflows/local-signup.ts` como modelo completo.

### Steps disponíveis (`src/core/steps.ts`)

Valores aceitam literal ou função `(ctx) => valor` (acesso a `ctx.input`, `ctx.config`, `ctx.state`).

| Step | Descrição |
| --- | --- |
| `goto(url, { waitFor? })` | Navega para URL absoluta ou relativa a `config.baseUrl`; opcionalmente espera um seletor ficar visível. |
| `fillForm({ seletor: valor })` | Preenche campos detectando o tipo (input, select, checkbox, radio); `undefined` é pulado. |
| `click(seletor)` | Clica num elemento. |
| `submitAndCapture(seletor, { urlPart, saveAs? })` | Clica e captura a resposta HTTP não-GET cuja URL contém `urlPart` em `ctx.state[saveAs]` (`{ status, body }`). |
| `waitVisible(seletor, timeout?)` | Espera o elemento ficar visível (padrão 10 s). |
| `extractText(seletor, saveAs)` | Lê o texto do elemento para `ctx.state[saveAs]`. |
| `collectErrors(seletor)` | Coleta mensagens visíveis em `ctx.state.formErrors`. |
| `assert(descrição, predicado)` | Falha se `predicado(ctx)` for falso. |
| `custom(nome, run)` | Passo livre para lógica específica. |
| `optional(step)` | Marca um passo como opcional: a falha é registrada mas não interrompe o workflow. |

## Pool de proxy com rotação do provedor

Cada execução abre um navegador novo conectado ao gateway configurado. O provedor
controla quando o IP de saída troca (por conexão, tempo ou sessão). O projeto não
chama APIs de rotação e não garante IP único por execução. Prefira manter o IP
estável durante um workflow se o provedor oferecer essa opção. Não há fallback
para conexão direta quando o proxy configurado falha.

No PowerShell, antes de executar o workflow:

```powershell
$env:WORKFLOW_PROXY_SERVER = "http://gateway.seu-provedor.com:8080"
$env:WORKFLOW_PROXY_USERNAME = "usuario-fornecido-pelo-provedor"
$env:WORKFLOW_PROXY_PASSWORD = "senha-fornecida-pelo-provedor"
npm run workflow -- run local-signup --base-url https://seu-formulario.example --headed
```

Também é possível passar apenas o gateway com `--proxy http://host:porta`.
Credenciais ficam nas variáveis de ambiente, fora do input e relatório do workflow.
Não publique credenciais no Git. HTTP/HTTPS autenticado é aceito; SOCKS5 autenticado
não é suportado pelo Chromium. Sem configuração, permanece a conexão direta.

## reCAPTCHA v2 no formulário genérico de teste

O `test-site` pode exigir reCAPTCHA v2 (checkbox) antes de criar uma conta.
Sem chaves, o formulário continua funcionando sem CAPTCHA. Configure as duas
chaves juntas; configuração incompleta impede iniciar o servidor.

```powershell
$env:RECAPTCHA_SITE_KEY = "sua-site-key-v2"
$env:RECAPTCHA_SECRET_KEY = "sua-secret-key"
$env:RECAPTCHA_ALLOWED_HOSTNAMES = "localhost,127.0.0.1"
npm run workflow -- run local-signup --serve --headed
```

Use chaves v2 compatíveis com a API `siteverify` e autorize o hostname usado no
console do reCAPTCHA. O navegador mostra o widget; você conclui a verificação e
o workflow aguarda até 120 segundos antes de enviar o formulário. O servidor
valida o token na API oficial e confere o hostname permitido. Token ausente,
recusado ou expirado bloqueia o cadastro; indisponibilidade retorna HTTP 503.
A secret key nunca é enviada ao navegador, e tokens não entram em logs/relatórios.
Após tentativa recusada, o widget reinicia para obter um novo token.

Isso se aplica ao formulário próprio `test-site` e `local-signup`. Não inclui
serviços de resolução de CAPTCHA. Testes de unidade/API usam respostas simuladas da verificação, sem
consultar Google ou depender de chaves reais.

Documentação: https://developers.google.com/recaptcha/docs/display e
https://docs.cloud.google.com/recaptcha/docs/verify

## API de módulos reutilizáveis

Importe `src/index.ts` em outro projeto TypeScript/tsx para usar o core sem carregar
a CLI, o registro do formulário local ou o servidor de teste:

```ts
import {
  defineWorkflow, runWorkflow, browserOptionsFromEnvironment,
  goto, fillForm, submitAndCapture, waitVisible,
} from "./src/index.js";

const workflow = defineWorkflow({
  name: "meu-site",
  description: "Fluxo no meu formulário",
  defaults: { baseUrl: "https://meu-site.example" },
  buildInput: (input: { name?: string }) => ({ name: input.name ?? "Teste" }),
  steps: [
    goto("/cadastro"),
    fillForm({ "#name": ctx => ctx.input.name }),
    submitAndCapture("button[type=submit]", { urlPart: "/api/register" }),
    waitVisible(".success"),
  ],
});
await runWorkflow(workflow, {
  browser: browserOptionsFromEnvironment(process.env, { headless: false }),
});
```

URLs, seletores, dados e regras pertencem ao workflow de cada site. Os módulos são
reutilizáveis, mas um workflow não passa a funcionar em qualquer site sem adaptar
essa configuração. Não é necessário modificar o core para registrar outro site.
`src/index.ts` é uma API de fonte TypeScript; não é um pacote JavaScript compilado.

| Módulo | Responsabilidade |
| --- | --- |
| `core/browser.ts` | Abrir/fechar navegador e contexto limpos |
| `core/session.ts` | Gerar identidade, seed e escolher proxy por execução |
| `core/config.ts` | Carregar configuração comum para CLI ou código |
| `core/proxy.ts` | Validar gateway e separar credenciais |
| `core/steps.ts` | Navegar, preencher, capturar, extrair, esperar e ramificar |
| `core/runner.ts` | Executar qualquer definição, logging e relatórios |
| `core/registry.ts` | Definir e registrar workflows |
| `integrations/recaptcha.ts` | Validar tokens no backend de sites próprios |
| `workflows/` | Somente seletores e regras específicas de cada site |
| `test-site/` | Aplicação de exemplo que consome os módulos |

### Identidade e rede por execução

Toda chamada de `openSession()` (usada por `runWorkflow()`) gera uma nova identidade
e uma seed aleatória de fingerprint para o CloakBrowser. A mesma configuração de
opções pode ser reutilizada: ela não é modificada. Seeds podem se repetir, e nem
todo atributo do navegador varia. Credenciais do proxy não ficam em `Session.identity`.

Para exigir proxy em toda execução:
```powershell
$env:WORKFLOW_REQUIRE_PROXY = "true"
$env:WORKFLOW_PROXY_SERVER = "http://gateway.seu-provedor.com:8080"
$env:WORKFLOW_PROXY_USERNAME = "usuario-session-{session}"
$env:WORKFLOW_PROXY_PASSWORD = "sua-senha"
```

O placeholder `{session}` no usuário é substituído por um identificador novo em
cada abertura. Use-o apenas no formato de usuário que seu provedor documentar;
ele não troca IP por conta própria. A configuração permanece estável durante o
workflow. Um gateway rotativo sem suporte a sessões continua sob as regras do provedor.

Se tiver vários gateways, pode escolher um aleatoriamente por execução:
```powershell
$env:WORKFLOW_PROXY_POOL = '["http://gateway1:8080","http://gateway2:8080"]'
```

A pool tem prioridade sobre `WORKFLOW_PROXY_SERVER`; `--proxy` sobrescreve ambos.
No código, use `proxy` ou `proxyPool` em `BrowserOptions`. Seleção aleatória pode
repetir gateways e IPs; a troca efetiva e a permanência do IP dependem do provedor.
O framework não promete IP único e não altera o IP local do computador.
Sem proxy, o modo direto continua disponível salvo quando `requireProxy` está ativo.

### Verificações reutilizáveis

`when(predicate, step)` executa um passo condicional. `waitForManualInput(selector,
timeout)` aguarda um campo preenchido pelo usuário sem extrair ou salvar seu valor.
Cada workflow fornece seu seletor e sua condição; o core não conhece o formulário
local. A validação reCAPTCHA pode ser importada de
`src/integrations/recaptcha.ts` em backends de sites próprios. Nenhum módulo resolve
desafios automaticamente. A exportação antiga em `test-site/recaptcha.ts` permanece
como compatibilidade.
