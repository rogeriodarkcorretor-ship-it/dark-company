# Dark Shark — Etapa 1 e 2: Diagnóstico e Arquitetura de Integração

> Status: **aguardando validação** (nenhum código ou banco foi alterado nesta etapa).
> Data da análise: 01/10/2026.

## 1. O que foi analisado

| Fonte | O que existe |
|---|---|
| GitHub `dark-company` | 16 ferramentas HTML estáticas (sem build), PWA mínimo (`sw.js`), ícones |
| GitHub `darkpropostaia` | Apenas `dark-proposta.html` — **cópia idêntica** do arquivo no repo `dark-company` |
| Supabase `dark-company-crm` (sa-east-1, Postgres 17) | Banco real do CRM: 45 tabelas, RLS em todas, 44 migrations, 1 Edge Function |
| Vercel | Projetos estáticos (`dark-company`, `vercel-project`, `laudo-vistoria`, `admin-licencas`…) — **nenhum Next.js** |

**Achado principal:** o banco do Dark Company CRM existe e é bem estruturado, mas **o código-fonte do frontend do CRM não está em nenhum repositório acessível** (as tabelas `copilot_*`, `score_regras`, `pesquisa_*` indicam que um frontend as usa — ele não foi localizado).

## 2. Diagnóstico — repositório `dark-company`

**Stack:** HTML + CSS + JavaScript vanilla, um arquivo por ferramenta, bibliotecas via CDN (jsPDF, html2canvas, Chart.js), Google Fonts. Sem package.json, sem testes, sem backend.

| Ferramenta | Persistência | Observação |
|---|---|---|
| `dark-proposta.html` (5 MB) | — | Imagens em base64 embutidas; duplicada em `darkpropostaia` |
| `central-certidoes.html` (1,7 MB) | — | base64 embutido |
| `laudo-vistoria.html` | localStorage | PWA |
| `admin-licencas.html` | localStorage | PWA, login no cliente |
| `equipe-ia.html` | localStorage | Chat com Claude direto do navegador |
| `radar-mercado.html` | — | Chama `api.anthropic.com` sem chave |
| `imovelflow (2).html` | localStorage | Mini-kanban de negócios — **duplica** o pipeline do CRM |
| `visitasegura (4).html` | localStorage | — |
| Landings (`captacao-imoveis`, `venda-seu-imovel`, `simulacao-imovel`, `landing-dark-company`) | — | Captam lead só por link `wa.me` (não gravam no CRM) |
| `simulador-financiamento`, `avaliacao-imoveis`, `bot-captacao` | — | Ferramentas de cálculo/roteiro |

### Problemas técnicos encontrados

**Segurança (prioridade alta)**
1. `admin-licencas.html`: senha de admin fixa no código (`adminPass: 'dark2025'`, usuário `admin`/`darkcompany`) e base de licenças no localStorage. Qualquer pessoa vê a senha pelo "ver código-fonte", e as licenças podem ser editadas no navegador.
2. `equipe-ia.html`: guarda a chave da API Anthropic no localStorage e usa `anthropic-dangerous-direct-browser-access`. A chave fica exposta no navegador, o que contraria a regra "não expor credenciais no frontend".
3. `radar-mercado.html`: chama a API sem chave e só funciona dentro do ambiente de artifacts do claude.ai. **Publicado no Vercel, está quebrado.**
4. Modelos de IA desatualizados (`claude-sonnet-4-20250514`, `claude-sonnet-4-6`).

**Qualidade/manutenção**
5. Os dados ficam no navegador (localStorage) e não chegam ao Supabase: se o cache for limpo, os dados somem e cada aparelho vê dados diferentes.
6. Não há design system compartilhado. Cada arquivo usa uma fonte (Syne, DM Sans, DM Serif, Cormorant, Montserrat) e uma paleta diferente (há telas no tema escuro do GitHub, `#0d1117`/`#21262d`). Nenhuma segue `#102A43 / #F4F1EA / #C6A15B`.
7. Nomes de arquivo com espaço/parênteses (`imovelflow (2).html`, `visitasegura (4).html`) quebram URLs.
8. Arquivos de vários MB com base64 tornam o carregamento lento, sobretudo no mobile.
9. As landings não gravam lead no CRM, então o funil é perdido na origem.

## 3. Diagnóstico — banco `dark-company-crm`

### Domínios existentes (reaproveitáveis)

| Domínio | Tabelas | Volume atual |
|---|---|---|
| Usuários | `profiles` (role: `corretor, admin, correspondente, parceiro`) | 2 (1 admin, 1 parceiro) |
| Leads | `leads` (já tem `score`, `temperatura`, `etapa_kanban`, `faixa_valor_min/max`, `prazo_compra`, `renda_familiar`, `fgts_disponivel`, `valor_entrada_disponivel`, `possui_imovel_para_vender`, `tipo_imovel_interesse`, `bairro`, `origem`), `lead_timeline`, `lead_tags`, `lead_documentos` | 0 leads |
| **Score** | `score_regras`, `score_faixas`, `lead_score_historico`, funções `recalcular_score_lead()` / `recalcular_score_todos_leads()` + triggers em leads/agenda/documentos/timeline | regras: 0 |
| **IA** | `lead_ia_insights` (resumo, classificação, próxima ação, probabilidade, `imoveis_recomendados`), `copilot_conversas`, `copilot_mensagens`, `copilot_prompts`, `copilot_configuracoes`, `copilot_logs_interacao` | vazias |
| Imóveis | `imoveis`, `imovel_fotos`, `imovel_documentos`, `imovel_tags`, `empreendimentos` | 9 imóveis |
| Proprietários | `proprietarios`, `proprietario_timeline`, `proprietario_documentos` | 9 |
| Agenda/Tarefas | `agenda_eventos` (visita/compromisso), `tarefas` | 0 |
| Comercial | `vendas`, `comissoes`, `pastas`, `pasta_documentos`, `checklist_modelos` | 6 vendas |
| Locação | `contratos_locacao`, `locacao_pagamentos` | 8 contratos |
| Marketing | `lead_meta_ads` (campaign/adset/ad por lead) | 0 |
| Configuração | `configuracoes_*`, `captacao_configuracoes`, `integracoes_configuracoes`, `configuracoes_auditoria` | — |
| Financeiro | `despesas`, `despesas_categorias` | 24 |

Extensões: `pgcrypto`, `pg_trgm`, `pg_cron`, `supabase_vault`, `uuid-ossp`.
Edge Functions: apenas `admin-create-user`.
Storage: buckets de imóveis, leads, proprietários e pastas.

### Problemas encontrados no banco

1. **`gerar_cobrancas_mensais()` (SECURITY DEFINER) pode ser executada por `anon`** via `/rest/v1/rpc/...`: qualquer pessoa com a URL pública consegue disparar a geração de cobranças. Também `is_comissionado()`.
2. `score_regras` tem política `ALL` para qualquer usuário autenticado: um corretor pode alterar as regras de score de toda a empresa (deveria ser só admin).
3. `recalcular_score_todos_leads()` pode ser chamada por qualquer autenticado (custo e abuso).
4. Proteção contra senhas vazadas está desativada no Supabase Auth.
5. Não existem os papéis `gestor`, `marketing` e `investidor` exigidos pelo Dark Shark.
6. Não existem estruturas para: alertas, oportunidades/captação prospectada, recomendações normalizadas, dados de mercado, investimento, campanhas (custo/CPL/ROI), auditoria de acesso e base legal (LGPD).
7. O schema de copilot existe, mas **não há Edge Function de IA**: hoje a IA não tem backend seguro.

## 4. Arquitetura recomendada

```
┌───────────────────────────── FRONTEND ─────────────────────────────┐
│  Dark Shark (Next.js App Router + TS + Tailwind + shadcn/ui)        │
│  /shark  /shark/leads  /shark/ai  /shark/hunter  /shark/intelligence│
│  /shark/investor  /shark/campanhas  /shark/admin                    │
│  Server Components + Server Actions (sem chaves no cliente)         │
└───────────────┬───────────────────────────────┬────────────────────┘
                │ supabase-js (JWT do usuário)  │ fetch (JWT)
┌───────────────▼───────────────┐   ┌───────────▼────────────────────┐
│ Supabase Postgres (MESMO banco│   │ Edge Functions                  │
│ do CRM) — RLS em tudo         │   │  shark-ai      (chat/copilot)   │
│  tabelas CRM (reuso)          │◄──┤  shark-score-explain            │
│  + tabelas shark_* (novas)    │   │  shark-match   (recomendações)  │
│  + views shark_v_* (KPIs)     │   │  shark-alerts  (pg_cron)        │
│  pg_cron → jobs periódicos    │   │  [futuro] meta-ads-sync,        │
└───────────────────────────────┘   │  whatsapp-webhook (só pontos de │
                                    │  conexão, sem integração fake)  │
                                    └───────────┬────────────────────┘
                                                │ chave no Supabase Secrets
                                         ┌──────▼──────┐
                                         │ API Claude  │
                                         └─────────────┘
```

### Princípios
- **Um só banco e uma só autenticação.** O Dark Shark usa o mesmo projeto Supabase e o mesmo Supabase Auth do CRM, então o corretor tem um único login.
- **Reutilizar antes de criar.** As tabelas novas usam prefixo `shark_` e chaves estrangeiras para `leads`, `imoveis`, `proprietarios` e `profiles`, sem copiar dados.
- **KPIs como views**, e não como tabelas duplicadas: funil, conversão e valor potencial são calculados a partir de `leads`, `agenda_eventos` e `vendas`.
- **IA só no servidor.** Edge Functions com a chave em Supabase Secrets. A IA consulta os dados com o JWT do usuário, então o RLS se aplica também a ela: um corretor nunca recebe dados de outro corretor via chat.
- **IA não inventa nada.** O prompt de sistema obriga a citar os fatores usados e a responder "Não tenho dados suficientes para afirmar isso." quando faltar dado. Cada interação é registrada em `copilot_logs_interacao`.
- **O score é determinístico e a IA só explica.** O número vem do motor SQL que já existe (`score_regras` + `recalcular_score_lead`), que é auditável. A IA gera apenas o texto da explicação a partir dos fatores, sem "chutar" o número.

### Mapeamento do briefing → banco (reuso × novo)

| Briefing | Decisão | Detalhe |
|---|---|---|
| `shark_scores` | **Reusar** `leads.score` + `lead_score_historico` + `score_regras`/`score_faixas` | Adicionar `fatores jsonb` e `explicacao text` em `lead_ia_insights`; semear faixas 0–30 / 31–60 / 61–80 / 81–100 e regras iniciais |
| `shark_tasks` | **Reusar** `tarefas` | Adicionar `imovel_id`, `categoria` (ligar, enviar_imovel, confirmar_visita…), `origem` (`manual`/`shark`), `status` |
| Visitas | **Reusar** `agenda_eventos` (tipo `visita`) | — |
| Copilot / chat | **Reusar** `copilot_*` | Criar Edge Function `shark-ai` |
| `shark_recommendations` | **Novo** `shark_recomendacoes` | lead × imóvel × `match_score` × `motivos jsonb` (normalizado, permite "imóvel compatível com 8 leads") |
| `shark_alerts` | **Novo** `shark_alertas` | tipo, severidade, destinatário, lead/imóvel, mensagem, lido |
| `shark_opportunities` | **Novo** `shark_oportunidades` | tipos: captação, reativação, investidor, match; status Novo→…→Captado/Descartado; **`fonte` e `base_legal` obrigatórios** |
| `shark_market_data` | **Novo** `shark_dados_mercado` | sempre com `fonte`, `amostra` e `data_referencia` |
| `shark_investments` | **Novo** `shark_investimentos` | premissas em jsonb e flag `estimativa = true` |
| Campanhas | **Novo** `shark_campanhas` + `shark_campanhas_metricas_diarias` | liga com `lead_meta_ads.campaign_id`; sem sync real até haver credencial Meta |
| Perfis | **Estender** enum `profile_role` | + `gestor`, `marketing`, `investidor`; função `has_role()` |
| LGPD | **Novo** `shark_auditoria_acesso` + colunas em `leads` | `base_legal`, `consentimento_em`, `origem_dado`; função `anonimizar_lead()` |
| Integrações | **Reusar** `integracoes_configuracoes` | Registro de conectores (Meta, WhatsApp, Google) com status `nao_configurado` |

### Correções de segurança que entram na primeira migration
- `REVOKE EXECUTE` de `anon` em `gerar_cobrancas_mensais` e `is_comissionado`; `gerar_cobrancas_mensais` fica só para `pg_cron`/service role.
- `score_regras`/`score_faixas`: escrita só para admin.
- `recalcular_score_todos_leads`: só admin.
- Ativar proteção contra senhas vazadas (painel do Supabase Auth, ação manual).

## 5. Decisões que dependem do Rogério

1. **Onde está o frontend do CRM?** (Lovable, Bolt, outro GitHub, outro computador?) Se existir, o Dark Shark pode ser um módulo dentro dele. Se não existir, a recomendação é criar o app Next.js do Dark Shark que já nasce como o novo frontend do CRM.
2. **Repositório do app:** um repo novo `dark-shark` (recomendado: deploy no Vercel separado do site estático) ou uma pasta `apps/dark-shark` dentro de `dark-company`.
3. **Migrations no banco de produção:** aplicar direto em `dark-company-crm` ou criar antes um *branch* do Supabase para testar (recomendado: branch, pois o banco já tem vendas e locações reais).
4. **Papéis novos** (`gestor`, `marketing`, `investidor`): confirmar.
5. **Chave da API Claude:** será configurada como Secret no Supabase (nunca no código).

## 6. Próximos passos (após validação)

- **Etapa 3:** migrations (`shark_*`, extensão de roles, correções de segurança, views de KPI), aplicadas no branch e testadas com RLS por papel.
- **Etapa 4:** Design System Dark Shark (tokens, tipografia Droid Serif + Poppins, componentes shadcn).
- **Etapa 5:** Dashboard.
- Correções sugeridas fora do Dark Shark: remover a senha fixa do `admin-licencas`, tirar a chave da API do `equipe-ia` (passar para a Edge Function), corrigir `radar-mercado`, renomear arquivos com espaço e remover o repo duplicado `darkpropostaia`.
