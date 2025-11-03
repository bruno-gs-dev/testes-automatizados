# 🤖 Testes Automatizados - Validador Web

Sistema completo de testes automatizados para validação de aplicações web utilizando Puppeteer. **Funciona com qualquer aplicação web** - Angular, React, Vue, Bootstrap ou aplicações customizadas.

## 📋 Funcionalidades

- **🎨 Validação de Cores**: Verifica se as cores utilizadas estão dentro da paleta permitida
- **📝 Validação de Texto**: Busca por conteúdos inválidos como "null", "NaN" e tokens customizados
- **🌐 Validação de Requisições**: Monitora erros HTTP e falhas de rede
- **🧭 Teste de Navegação**: Mapeia e testa todas as rotas da aplicação automaticamente
- **📊 Relatórios Profissionais**: Gera logs detalhados com estatísticas consolidadas
- **📸 Screenshots**: Captura telas dos problemas encontrados (opcional)
- **⚙️ Configuração Flexível**: Adapta-se automaticamente a diferentes tipos de aplicação

## 🚀 Instalação

```bash
# Clonar repositório
git clone <url-do-repositorio>
cd testes-automatizados

# Instalar dependências
npm install

# Copiar arquivo de configuração
cp .env.example .env
```

## ⚙️ Configuração

### 1. Configuração Básica (.env)

Edite o arquivo `.env` com os dados da sua aplicação:

```env
# URLs da sua aplicação
URL_ALVO=https://sua-aplicacao.com/app/home
BASE_URL=https://sua-aplicacao.com/
EXPECTED_PATH=/app/home

# Suas credenciais
LOGIN_USERNAME=seu.usuario
LOGIN_PASSWORD=suasenha123

# Seletores de login (o sistema tenta detectar automaticamente)
LOGIN_SELECTOR_USERNAME=#email
LOGIN_SELECTOR_PASSWORD=#password
LOGIN_SELECTOR_SUBMIT=button:contains('Entrar')
```

### 2. Configuração Automática

O sistema detecta automaticamente o tipo da sua aplicação:
- ✅ **Angular** (incluindo Fuse template)
- ✅ **React/Next.js**
- ✅ **Vue.js**
- ✅ **Bootstrap**
- ✅ **Aplicações genéricas**

### 3. Configuração Manual (Opcional)

Para aplicações específicas, você pode forçar um tipo:

```env
# Tipos disponíveis: generic, angular_fuse, bootstrap, react
NAV_TYPE=generic

# Ou definir seletores customizados:
NAV_MAIN_PANEL_SELECTOR=nav, .sidebar
NAV_MAIN_ITEMS_SELECTOR=a, .nav-item
```

## 🎮 Como Usar

### Primeiro Uso
```bash
# 1. Configure o .env com os dados da sua aplicação
# 2. Execute o teste de navegação para mapear as rotas
npm run start navigation

# 3. Execute a suíte completa em todas as páginas
npm run start all-pages
```

### Testes Individuais
```bash
# Teste de cores apenas
npm run start colors

# Teste de textos apenas
npm run start text

# Teste de requisições apenas
npm run start requests

# Teste de navegação (mapear rotas)
npm run start navigation
```

### Suítes Completas
```bash
# Todos os testes em uma única página
npm run start all

# Todos os testes em TODAS as páginas (recomendado)
npm run start all-pages
```

## 📊 Exemplos de Relatórios

### 🎉 Execução Bem-Sucedida
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     📊 RELATÓRIO FINAL DE EXECUÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Bootstrap/Material UI
```env
NAV_TYPE=bootstrap
LOGIN_SELECTOR_USERNAME=input[name="username"]
LOGIN_SELECTOR_PASSWORD=input[name="password"]
LOGIN_SELECTOR_SUBMIT=.btn-primary
```

### React/Next.js
```env
NAV_TYPE=react
LOGIN_SELECTOR_USERNAME=#username
LOGIN_SELECTOR_PASSWORD=#password
LOGIN_SELECTOR_SUBMIT=button[type="submit"]
```

### Aplicação Customizada
```env
NAV_TYPE=generic
NAV_MAIN_PANEL_SELECTOR=.meu-menu-principal
NAV_MAIN_ITEMS_SELECTOR=.item-menu
LOGIN_SELECTOR_USERNAME=#meu-campo-usuario
```

## 📊 Tipos de Teste

### 🎨 Teste de Cores
- Coleta automaticamente todas as cores da aplicação
- Compara com paleta permitida configurável
- Funciona em qualquer framework CSS

### 📝 Teste de Texto
- Busca tokens problemáticos configuráveis
- Detecta "null", "NaN" e termos customizados
- Ignora elementos ocultos automaticamente

### 🌐 Teste de Requisições
- Monitora todas as requisições HTTP
- Detecta erros 4xx, 5xx e falhas de rede
- Relatório consolidado por tipo de erro

### 🧭 Teste de Navegação
- **Mapeia automaticamente** todas as rotas
- Funciona com SPAs e aplicações tradicionais
- Expande menus recursivamente
- Testa acesso individual a cada página

## 🎯 Adaptação Automática

O sistema se adapta automaticamente a:

- **Diferentes estruturas de menu** (sidebar, navbar, dropdown)
- **Frameworks CSS** (Bootstrap, Material, Tailwind, custom)
- **Tipos de navegação** (links diretos, menus expansíveis, SPAs)
- **Formulários de login** (detecta campos automaticamente)
- **Diferentes seletores CSS** (por ID, classe, atributo, texto)

## 🐛 Troubleshooting

### Aplicação não detectada corretamente
```env
# Force o tipo manualmente
NAV_TYPE=generic
# Ou defina seletores específicos
NAV_MAIN_PANEL_SELECTOR=.seu-menu-customizado
```

### Login não funciona
```env
# Use seletores mais específicos
LOGIN_SELECTOR_USERNAME=input[type="email"]
LOGIN_SELECTOR_PASSWORD=input[type="password"]
LOGIN_SELECTOR_SUBMIT=button:contains('Login')
# Ou teste com interface visual
HEADLESS=false
```

### Navegação não mapeia todos os links
```env
# Ajuste os seletores de navegação
NAV_MAIN_ITEMS_SELECTOR=a, .menu-item, .nav-link
NAV_COLLAPSABLE_SELECTOR=.collapsed, [aria-expanded="false"]
```

## 🔒 Segurança

- ✅ Arquivo `.env` no .gitignore (credenciais não são commitadas)
- ✅ Screenshots podem ser desabilitados
- ✅ Logs limpos de dados sensíveis
- ✅ Links mapeados não são commitados

## 📦 Estrutura de Arquivos

```
├── index.js                   # Arquivo principal
├── test_*.js                  # Módulos de teste
├── utils.js                   # Utilitários genéricos
├── config/
│   └── navigation.config.js   # Configurações por tipo de app
├── .env.example              # Template de configuração
├── .env                      # Sua configuração (ignorado pelo git)
├── screenshots/              # Capturas (ignorado pelo git)
├── links_map.json           # Mapa de rotas (ignorado pelo git)
└── relatorio_logs.txt       # Logs (ignorado pelo git)
```

## 🤝 Uso em Qualquer Projeto

1. **Clone** este repositório
2. **Configure** o `.env` com os dados da sua aplicação
3. **Execute** - o sistema se adapta automaticamente
4. **Customize** seletores se necessário

Este validador funciona com **qualquer aplicação web moderna** sem modificações no código fonte.
