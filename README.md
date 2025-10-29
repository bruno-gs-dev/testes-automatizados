# 🤖 Testes Automatizados - Validador Web

Sistema completo de testes automatizados para validação de aplicações web utilizando Puppeteer. Executa verificações de cores, textos, requisições HTTP, navegação e conformidade geral.

## 📋 Funcionalidades

- **🎨 Validação de Cores**: Verifica se as cores utilizadas estão dentro da paleta permitida
- **📝 Validação de Texto**: Busca por conteúdos inválidos como "null", "NaN" e tokens customizados
- **🌐 Validação de Requisições**: Monitora erros HTTP e falhas de rede
- **🧭 Teste de Navegação**: Mapeia e testa todas as rotas da aplicação
- **📊 Relatórios Completos**: Gera logs detalhados e abre automaticamente no Bloco de Notas
- **📸 Screenshots**: Captura telas dos problemas encontrados (opcional)

## 🚀 Instalação

```bash
# Instalar dependências
npm install

# Copiar arquivo de configuração
cp .env.example .env
```

## ⚙️ Configuração

Crie um arquivo `.env` na raiz do projeto com as seguintes configurações:

### 🌍 URLs
```env
# URL principal da aplicação a ser testada
URL_ALVO=https://exemplo.com/app/home
# URL base para login
BASE_URL=https://exemplo.com/
# Caminho esperado após login bem-sucedido
EXPECTED_PATH=/app/home
```

### 🔐 Credenciais de Login
```env
# Dados de acesso
LOGIN_USERNAME=seu.usuario
LOGIN_PASSWORD=suasenha123
LOGIN_ID_VERIFICACAO=40
LOGIN_ID_SISTEMA=11
LOGIN_ID_CONTRATO=7
LOGIN_NOME_SISTEMA=SISTEMA_EXEMPLO
LOGIN_CONTRATO_NOME=CONTRATO EXEMPLO
```

### 🎯 Seletores CSS
```env
# Seletores para os campos de login
LOGIN_SELECTOR_USERNAME=#email
LOGIN_SELECTOR_PASSWORD=#password
LOGIN_SELECTOR_SUBMIT=button:contains('Entrar')
```

### 🎨 Validação de Cores
```env
# Cores permitidas (hexadecimal, separadas por vírgula)
PALETA_CORES_PERMITIDAS=#ffffff,#000000,#f8f9fa,#1e293b,#1f3f6e
```

### 📝 Validação de Texto
```env
# Tokens adicionais para busca além de "null" e "NaN"
# Separe por vírgula ou nova linha
SEARCH_TEXTS=erro,indefinido,falha,exception
```

### 📸 Screenshots
```env
# Habilitar/desabilitar captura de telas
ENABLE_SCREENSHOTS=true
```

### 🤖 Configurações do Puppeteer
```env
# Executar com interface gráfica (false) ou em background (true)
HEADLESS=false
# Velocidade de execução (ms entre ações)
SLOWMO=50
# Maximizar janela do navegador
MAXIMIZE=true
# Resolução da janela (se MAXIMIZE=false)
VIEWPORT_WIDTH=1920
VIEWPORT_HEIGHT=1080
```

## 🎮 Como Usar

### Testes Individuais
```bash
# Teste de cores
npm run start colors

# Teste de textos
npm run text

# Teste de requisições HTTP
npm run requests

# Teste de navegação
npm run start navigation

# Teste de debug (focado)
npm run start debug
```

### Suítes Completas
```bash
# Todos os testes em uma única página
npm run start all

# Todos os testes em TODAS as páginas mapeadas (recomendado)
npm run start all-pages
```

## 📊 Tipos de Teste

### 🎨 Teste de Cores
- Coleta todas as cores visíveis na página (color, background-color, border-color)
- Compara com a paleta permitida definida no `.env`
- Destaca elementos não conformes
- Gera screenshots dos problemas

### 📝 Teste de Texto
- Busca por "null", "NaN" e tokens customizados
- Ignora elementos ocultos e overlays de sistema
- Destaca o texto problemático com badges contextuais
- Suporta busca em múltiplas páginas

### 🌐 Teste de Requisições
- Monitora requisições HTTP em tempo real
- Detecta erros 4xx, 5xx e falhas de rede
- Agrupa erros por URL e tipo
- Relatório consolidado com estatísticas

### 🧭 Teste de Navegação
- Mapeia automaticamente todas as rotas da aplicação
- Expande menus e submenus recursivamente
- Testa acesso a cada página individualmente
- Salva mapa de links em `links_map.json`

## 📁 Estrutura de Arquivos

```
├── index.js              # Arquivo principal
├── test_colors.js         # Validação de cores
├── test_text.js          # Validação de textos
├── test_requests.js      # Validação de requisições
├── test_navigation.js    # Teste de navegação
├── test_navigation_debug.js # Teste focado para debug
├── utils.js              # Utilitários e configurações
├── .env                  # Configurações (criar)
├── links_map.json        # Mapa de links (gerado automaticamente)
├── screenshots/          # Capturas de tela (gerado)
└── relatorio_logs.txt    # Logs completos (gerado)
```

## 🔧 Recursos Avançados

### Mapeamento Automático
O sistema descobre automaticamente todas as páginas da aplicação:
- Clica em menus e categorias
- Expande submenus recursivamente
- Salva o mapa em formato JSON/TypeScript
- Reutiliza o mapa em execuções subsequentes

### Sistema de Status
- Overlay visual no navegador mostra o progresso em tempo real
- Logs coloridos no terminal
- Arquivo de texto limpo para análise posterior

### Destaque Visual
- Elementos problemáticos são destacados com bordas coloridas
- Screenshots automáticos dos problemas encontrados
- Badges contextuais para identificar tipos de erro

## 🐛 Troubleshooting

### Problemas de Login
- Verifique se os seletores CSS estão corretos
- Confirme se o `EXPECTED_PATH` corresponde à rota pós-login
- Teste com `HEADLESS=false` para visualizar o processo

### Falhas de Navegação
- Use o teste `debug` para investigar seletores específicos
- Verifique se a aplicação usa SPA (Single Page Application)
- Confirme se os links estão sendo gerados corretamente

### Performance
- Aumente `SLOWMO` se a aplicação for lenta
- Use `HEADLESS=true` para execução mais rápida
- Desabilite screenshots com `ENABLE_SCREENSHOTS=false`

### Falsos Positivos
- Adicione elementos ao ignore com `data-qa-ignore="true"`
- Ajuste a paleta de cores permitidas
- Configure tokens de busca específicos

## 📈 Exemplo de Relatório

```
🚀 Executando suíte de testes COMPLETA (todas as páginas)...

🗺️ Mapeamento concluído. 41 páginas para testar.

--- 🧪 TESTANDO PÁGINA [1/41]: Home ---
✅ Nenhum problema de cor encontrado.
✅ Nenhum "null" ou "NaN" encontrado.
✅ Nenhuma requisição com erro.

--- 🧪 TESTANDO PÁGINA [2/41]: Dados de Tráfego ---
❌ 2 problemas encontrados:
  ✖ COR NÃO CONFORME: color: #ff0000 -> #ff0000
  ✖ REQUISIÇÃO: Status 404 - script.js

📊 RESUMO FINAL: 15 problemas encontrados em 41 páginas testadas
```

## 🤝 Contribuição

Para contribuir com melhorias:
1. Mantenha o padrão de código existente
2. Adicione logs informativos
3. Teste com diferentes tipos de aplicação
4. Documente novas funcionalidades

## 📄 Licença

Este projeto é de uso interno para testes de qualidade.
