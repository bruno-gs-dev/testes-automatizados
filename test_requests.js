import chalk from 'chalk';
import { URL_ALVO, prepareBrowserPage, showStatus, LOGIN_CONFIG, loadLinksMap, performLogin } from './utils.js';

// NOVO: flag para ignorar "Network Failure"
const IGNORE_NETWORK_FAILURE = String(process.env.IGNORE_NETWORK_FAILURE || '').toLowerCase() === 'true';

// CORRIGIDO: Declarar LOGIN_REQUIRED corretamente aqui também se necessário
const toBool = (v, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'new'].includes(s);
};
const LOGIN_REQUIRED = toBool(process.env.LOGIN_REQUIRED, false);

// NOVO: tempos configuráveis (com defaults)
const WAIT_AFTER_LOAD_MS = parseInt(process.env.REQ_WAIT_AFTER_LOAD_MS || process.env.CORS_DETECTION_WAIT || '2000', 10);
const WAIT_AFTER_TRIGGER_MS = parseInt(process.env.REQ_WAIT_AFTER_TRIGGER_MS || '1000', 10);
const MAX_PAGE_TEST_MS = parseInt(process.env.REQ_MAX_PAGE_TEST_MS || '8000', 10);

// NOVO: helper de espera com polling e early-exit
async function waitUntil(predicate, timeoutMs, pollMs = 150) {
  const start = Date.now();
  return new Promise(resolve => {
    const int = setInterval(() => {
      if (predicate()) {
        clearInterval(int);
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(int);
        resolve(false);
      }
    }, pollMs);
  });
}

// NOVO: Função otimizada para preparar browser apenas para requisições
async function prepareBrowserForRequests(url, loginConfig = null) {
  const puppeteer = (await import('puppeteer')).default;
  
  // NOVO: Configuração otimizada apenas para requisições
  const browser = await puppeteer.launch({
    headless: true, // SEMPRE headless para requisições
    defaultViewport: { width: 1024, height: 768 }, // Viewport mínimo
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-plugins',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      // NOVO: argumentos para manter sessão
      '--disable-session-crashed-bubble',
      '--disable-infobars'
    ]
  });
  
  const page = await browser.newPage();

  // Desabilitar timeouts
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);

  // NOVO: Configurar cookies e sessão
  await page.setExtraHTTPHeaders({
    'Cache-Control': 'no-cache'
  });

  // Array compartilhado de erros
  const requestErrors = [];

  // NOVO: Executar login robusto (mesmo do modo normal)
  if (loginConfig && loginConfig.username && loginConfig.password) {
    try {
      // Usa a rotina completa do utils (detecta iframes, espera, etc.)
      const loginSuccess = await performLogin(page, loginConfig);
      if (!loginSuccess) {
        console.log(chalk.yellow('Aviso: Login (performLogin) falhou, continuando...'));
      } else {
        // NOVO: Aguardar após login para estabilizar
        console.log(chalk.gray('Login bem-sucedido, aguardando estabilização da sessão...'));
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      console.log(chalk.yellow(`Aviso: Login falhou com erro: ${e.message}`));
    }
  }

  // NOVO: após login, garantir que estamos na URL alvo inicial
  try {
    if (url) {
      // NOVO: Verificar se não está em página de login antes de navegar
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/sessao/expirada')) {
        console.log(chalk.yellow(`Aviso: Ainda em página de login: ${currentUrl}`));
      }
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      // NOVO: Verificar se foi redirecionado para login após navegação
      const finalUrl = page.url();
      if (finalUrl.includes('/login') || finalUrl.includes('/sessao/expirada')) {
        console.log(chalk.yellow(`Aviso: Redirecionado para login após navegação: ${finalUrl}`));
      }
    }
  } catch (navError) {
    console.log(chalk.yellow(`Aviso: Erro na navegação inicial: ${navError.message}`));
  }

  // NOVO: Ativar interceptação e bloqueio LEVE somente após o login
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const resourceType = request.resourceType();
    // Bloquear apenas recursos pesados, manter scripts/stylesheet para funcionamento e CORS
    if (['image', 'font', 'media'].includes(resourceType)) {
      request.abort();
    } else {
      request.continue();
    }
  });

  // NOVO: listeners de rede após login
  page.on('response', response => {
    try {
      if (!response.ok()) {
        requestErrors.push({ 
          type: 'HTTP Error', 
          status: response.status(), 
          url: response.url(),
          method: response.request().method(),
          statusText: response.statusText()
        });
      }
    } catch { /* ignore */ }
  });
  
  page.on('requestfailed', request => {
    try {
      const resourceType = request.resourceType();
      if (!['image', 'font', 'media'].includes(resourceType)) {
        // NOVO: respeitar flag para ignorar "Network Failure"
        if (IGNORE_NETWORK_FAILURE) return;
        const failure = request.failure();
        requestErrors.push({ 
          type: 'Network Failure', 
          url: request.url(), 
          method: request.method(),
          error: failure ? failure.errorText : 'unknown',
          resourceType
        });
      }
    } catch { /* ignore */ }
  });

  // REMOVIDO: login simplificado local (passava só no frame principal e sem wait)
  // ...existing code...

  return { browser, page, requestErrors };
}

// NOVO: flags para captura de erros de console
const CAPTURE_JS_CONSOLE_ERRORS = toBool(process.env.CAPTURE_JS_CONSOLE_ERRORS, false);
const IGNORE_CONSOLE_PATTERNS = process.env.IGNORE_CONSOLE_PATTERNS 
  ? process.env.IGNORE_CONSOLE_PATTERNS.split(',').map(p => p.trim().toLowerCase())
  : [];

export default async function runRequestsTest() {
  console.log(chalk.blue(`🌐 Executando teste de REQUISIÇÕES (modo otimizado) para: ${URL_ALVO}\n`));
  let browser;
  
  try {
    // NOVO: usar loader unificado (TS/JS/JSON)
    const { links, source: linksSource } = await loadLinksMap();
    
    if (links && links.length) {
      console.log(chalk.gray(`Usando ${links.length} links de: ${linksSource}`));
      console.log(chalk.blue('⚡ Modo otimizado: recursos visuais desabilitados, foco em requisições HTTP\n'));
      
      const { browser: b, page } = await prepareBrowserForRequests(URL_ALVO, LOGIN_CONFIG);
      browser = b;
      
      let totalErros = 0;
      let requestErrorCount = 0;
      const allErrors = new Map(); // Agrupar erros por URL
      const requestErrors = []; // NOVO: array para relatório final

      console.log(chalk.cyan('📊 Iniciando análise de requisições...\n'));

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const progress = `${i+1}/${links.length}`;
        
        // Progresso visual melhorado
        process.stdout.write(chalk.gray(`[${progress}] ${link.text.substring(0, 40)}${link.text.length > 40 ? '...' : ''}`));

        const pageRequestErrors = [];
        
        // NOVO: Listeners temporários para esta página específica
        const responseListener = (response) => {
          try {
            if (!response.ok()) {
              pageRequestErrors.push({ 
                type: 'HTTP Error', 
                status: response.status(), 
                url: response.url(),
                method: response.request().method(),
                pageUrl: link.href,
                pageTitle: link.text,
                statusText: response.statusText()
              });
            }
          } catch { /* ignore */ }
        };
        
        const requestFailedListener = (request) => {
          try {
            const resourceType = request.resourceType();
            if (!['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
              // NOVO: respeitar flag para ignorar "Network Failure"
              if (IGNORE_NETWORK_FAILURE) return;
              pageRequestErrors.push({ 
                type: 'Network Failure', 
                url: request.url(), 
                method: request.method(),
                error: request.failure() ? request.failure().errorText : 'unknown',
                pageUrl: link.href,
                pageTitle: link.text,
                resourceType: resourceType
              });
            }
          } catch { /* ignore */ }
        };
        
        // CORRIGIDO: Listener de console aprimorado para capturar mais tipos de erro
        const consoleListener = (msg) => {
          try {
            const text = msg.text();
            const type = msg.type();
            
            // NOVO: Capturar erros de console JavaScript se habilitado
            if (CAPTURE_JS_CONSOLE_ERRORS && (type === 'error' || type === 'warning')) {
              // Verificar se deve ignorar baseado nos padrões
              const shouldIgnore = IGNORE_CONSOLE_PATTERNS.some(pattern => 
                text.toLowerCase().includes(pattern)
              );
              
              if (!shouldIgnore) {
                // NOVO: Detectar diferentes tipos de erro de console
                let errorType = 'Console Error';
                let errorUrl = 'Unknown';
                let errorDetails = text;

                // Detectar erros específicos do JavaScript
                if (text.includes('Uncaught TypeError') || text.includes('TypeError:')) {
                  errorType = 'JavaScript TypeError';
                } else if (text.includes('Uncaught ReferenceError') || text.includes('ReferenceError:')) {
                  errorType = 'JavaScript ReferenceError';
                } else if (text.includes('Uncaught SyntaxError') || text.includes('SyntaxError:')) {
                  errorType = 'JavaScript SyntaxError';
                } else if (text.includes('Cannot read properties') || text.includes('Cannot set properties')) {
                  errorType = 'JavaScript Property Error';
                } else if (text.includes('This site overrides Date.now()')) {
                  errorType = 'Google Maps API Warning';
                } else if (text.includes('Failed to load resource')) {
                  errorType = 'Resource Load Error';
                } else if (type === 'warning') {
                  errorType = 'Console Warning';
                }

                // Tentar extrair URL/arquivo do erro
                const fileMatch = text.match(/(\S+\.js)(\?\S+)?:(\d+):(\d+)/);
                if (fileMatch) {
                  errorUrl = `${fileMatch[1]} (linha ${fileMatch[3]})`;
                }

                pageRequestErrors.push({
                  type: errorType,
                  url: errorUrl,
                  method: 'Console',
                  error: errorDetails.length > 200 ? errorDetails.substring(0, 200) + '...' : errorDetails,
                  source: 'Console',
                  statusText: type === 'warning' ? 'Warning' : 'Error',
                  pageUrl: link.href,
                  pageTitle: link.text,
                  severity: type === 'warning' ? 'medium' : 'high'
                });

                // Log para debug se necessário
                if (process.env.DEBUG_CONSOLE_ERRORS === 'true') {
                  console.log(`[DEBUG] ✓ Console ${type} captured: ${errorType}`);
                }
              }
            }
            
            // NOVO: Detectar erros de CORS mais específicos - PADRÕES APRIMORADOS
            if (type === 'error') {
              // NOVO: Padrões mais específicos para CORS incluindo o erro específico que você mencionou
              const corsPatterns = [
                // Padrão específico do seu erro
                /Access to XMLHttpRequest at '([^']+)' from origin '[^']+' has been blocked by CORS policy/i,
                /Access to fetch at '([^']+)' from origin '[^']+' has been blocked by CORS policy/i,
                // Padrões mais genéricos
                /Access to XMLHttpRequest at '([^']+)'.*has been blocked by CORS policy/i,
                /Access to fetch at '([^']+)'.*has been blocked by CORS policy/i,
                /Cross-Origin Request Blocked:[^']*'([^']+)'/i,
                /CORS policy:[^']*'([^']+)'/i,
                // Padrão ainda mais genérico para casos edge
                /'([^']+)'.*blocked by CORS policy/i
              ];
              
              let corsMatch = null;
              let corsUrl = 'Unknown URL';
              
              for (const pattern of corsPatterns) {
                corsMatch = text.match(pattern);
                if (corsMatch) {
                  corsUrl = corsMatch[1];
                  console.log(`[DEBUG] ✓ CORS URL extracted: ${corsUrl}`);
                  break;
                }
              }
              
              // NOVO: Detectar padrão mais genérico de CORS se não encontrou com regex
              if (!corsMatch && (
                text.includes('has been blocked by CORS policy') ||
                text.includes('No \'Access-Control-Allow-Origin\' header is present') ||
                text.includes('Cross-Origin Request Blocked')
              )) {
                // Tentar extrair URL de qualquer parte do texto
                const urlMatch = text.match(/(https?:\/\/[^\s'",\)]+)/i);
                if (urlMatch) {
                  corsUrl = urlMatch[1];
                  corsMatch = true;
                  console.log(`[DEBUG] ✓ CORS URL extracted (generic): ${corsUrl}`);
                }
              }
              
              if (corsMatch) {
                pageRequestErrors.push({
                  type: 'CORS Error',
                  url: corsUrl,
                  method: 'XMLHttpRequest',
                  error: text,
                  source: 'Console',
                  statusText: 'CORS Policy Violation',
                  pageUrl: link.href,
                  pageTitle: link.text
                });
                console.log(`[DEBUG] ✓ CORS error added successfully`);
                return; // Não duplicar detecção
              }
              
              // NOVO: Detectar erros de rede específicos com MELHOR extração de URL
              const networkPatterns = [
                // Padrões que extraem URL do contexto
                /GET (https?:\/\/[^\s]+) net::ERR_FAILED/i,
                /POST (https?:\/\/[^\s]+) net::ERR_FAILED/i,
                /PUT (https?:\/\/[^\s]+) net::ERR_FAILED/i,
                /DELETE (https?:\/\/[^\s]+) net::ERR_FAILED/i,
                // Padrão mais genérico
                /(https?:\/\/[^\s'",\)]+).*net::ERR_FAILED/i,
                /Failed to load resource:.*?(https?:\/\/[^\s'",\)]+)/i,
              ];
              
              let networkMatch = null;
              let networkUrl = 'Unknown URL';
              
              for (const pattern of networkPatterns) {
                networkMatch = text.match(pattern);
                if (networkMatch) {
                  networkUrl = networkMatch[1];
                  // REMOVIDO: log excessivo console.log(`[DEBUG] ✓ Network error URL extracted: ${networkUrl}`);
                  break;
                }
              }
              
              // NOVO: Padrão genérico melhorado para net::ERR_FAILED
              if (!networkMatch && text.includes('net::ERR_FAILED')) {
                // Extrair qualquer URL do texto
                const urlMatch = text.match(/(https?:\/\/[^\s'",\)]+)/i);
                if (urlMatch) {
                  networkUrl = urlMatch[1];
                  networkMatch = true;
                  // REMOVIDO: log excessivo console.log(`[DEBUG] ✓ Network error URL extracted (fallback): ${networkUrl}`);
                } else {
                  // Se não conseguir extrair URL, pelo menos registra o erro
                  networkMatch = true;
                  // REMOVIDO: log excessivo console.log(`[DEBUG] ✓ Network error detected (no URL extracted)`);
                }
              }
              
              if (networkMatch) {
                // NOVO: respeitar flag para ignorar "Network Error (Console)"
                if (IGNORE_NETWORK_FAILURE) return;
                pageRequestErrors.push({
                  type: 'Network Error (Console)',
                  url: networkUrl,
                  method: 'Unknown',
                  error: text,
                  source: 'Console',
                  statusText: 'Network Failure',
                  pageUrl: link.href,
                  pageTitle: link.text
                });
              }
            }
          } catch (e) {
            if (process.env.DEBUG_CONSOLE_ERRORS === 'true') {
              console.log(`[DEBUG] ✖ Error in consoleListener: ${e.message}`);
            }
          }
        };
        
        // Adicionar listeners
        page.on('response', responseListener);
        page.on('requestfailed', requestFailedListener);
        page.on('console', consoleListener);

        try {
          // NOVO: Verificar sessão antes de cada navegação
          const preNavUrl = page.url();
          if (preNavUrl.includes('/login') || preNavUrl.includes('/sessao/expirada')) {
            process.stdout.write(chalk.yellow(` ⚠ Sessão perdida\n`));
            console.log(chalk.gray(`   └─ URL atual: ${preNavUrl}`));
            totalErros++;
            continue;
          }
          
          // Navegação rápida
          await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 });

          // NOVO: Verificar se foi redirecionado para login após navegação
          const postNavUrl = page.url();
          if (postNavUrl.includes('/login') || postNavUrl.includes('/sessao/expirada')) {
            process.stdout.write(chalk.red(` ✖ Redirecionado para login\n`));
            console.log(chalk.gray(`   └─ URL: ${link.href} → ${postNavUrl}`));
            totalErros++;
            
            // NOVO: Tentar fazer login novamente se possível
            if (LOGIN_CONFIG && LOGIN_CONFIG.username && LOGIN_CONFIG.password) {
              try {
                console.log(chalk.blue(`   Tentando relogar...`));
                const reloginSuccess = await performLogin(page, LOGIN_CONFIG);
                if (reloginSuccess) {
                  console.log(chalk.green(`   ✓ Relogin bem-sucedido`));
                  // Tentar navegar novamente
                  await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
                }
              } catch (reloginError) {
                console.log(chalk.red(`   ✖ Relogin falhou: ${reloginError.message}`));
              }
            }
            
            continue;
          }

          // NOVO: janela total de teste por página
          const pageStart = Date.now();
          const hasCors = () => pageRequestErrors.some(e => e.type === 'CORS Error');

          // NOVO: fase 1 — aguarda primeiro erro aparecer OU timeout curto
          await waitUntil(() => pageRequestErrors.length > 0, Math.min(WAIT_AFTER_LOAD_MS, MAX_PAGE_TEST_MS));

          // NOVO: dispara possíveis requisições da tela
          await page.evaluate(() => {
            try {
              const buttons = document.querySelectorAll('button, [role="button"], .btn');
              const links = document.querySelectorAll('a[href], [role="link"]');
              const inputs = document.querySelectorAll('input, select');
              [buttons[0], links[0], inputs[0]].forEach(el => {
                if (!el) return;
                try {
                  el.focus();
                  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                } catch {}
              });
            } catch {}
          });

          // NOVO: fase 2 — aguarda pouco OU sai antes se já pegou CORS
          if (!hasCors()) {
            const restante = Math.max(0, MAX_PAGE_TEST_MS - (Date.now() - pageStart));
            await waitUntil(() => hasCors(), Math.min(WAIT_AFTER_TRIGGER_MS, restante));
          }

          // NOVO: garante que não ultrapasse o tempo total por página
          if (Date.now() - pageStart > MAX_PAGE_TEST_MS) {
            // continua para o processamento sem atrasar mais
          }

          // Processar erros encontrados
          if (pageRequestErrors.length > 0) {
            process.stdout.write(chalk.red(` ✖ ${pageRequestErrors.length} erro(s)\n`));
            
            // NOVO: Agrupar erros por tipo para melhor visualização
            const errorsByType = {};
            pageRequestErrors.forEach(error => {
              if (!errorsByType[error.type]) {
                errorsByType[error.type] = [];
              }
              errorsByType[error.type].push(error);
            });
            
            // Mostrar resumo por tipo de erro com cores específicas
            Object.entries(errorsByType).forEach(([type, errors]) => {
              let color = chalk.gray;
              if (type.includes('JavaScript') || type.includes('TypeError') || type.includes('ReferenceError')) {
                color = chalk.red;
              } else if (type.includes('Warning') || type.includes('Google Maps')) {
                color = chalk.yellow;
              } else if (type.includes('CORS')) {
                color = chalk.magenta;
              }
              console.log(color(`     └─ ${type}: ${errors.length} erro(s)`));
            });
            
            pageRequestErrors.forEach(error => {
              const key = `${error.url}|${error.type}`;
              if (allErrors.has(key)) {
                allErrors.get(key).count++;
                allErrors.get(key).pages.push(link.text);
              } else {
                allErrors.set(key, {
                  ...error,
                  count: 1,
                  pages: [link.text]
                });
              }
              
              // NOVO: Adicionar ao array para relatório final
              requestErrors.push(error);
              
              totalErros++;
              requestErrorCount++;
            });
          } else {
            process.stdout.write(chalk.green(` ✓ OK\n`));
          }
        } catch (e) {
          if (e.message.includes('net::ERR_ABORTED')) {
            process.stdout.write(chalk.yellow(` ⚠ Navegação cancelada\n`));
          } else {
            process.stdout.write(chalk.yellow(` ⚠ Falha na navegação\n`));
            console.log(chalk.gray(`   └─ ${e.message.split('\n')[0]}`));
          }
          totalErros++;
        }

        // Limpar listeners
        page.off('response', responseListener);
        page.off('requestfailed', requestFailedListener);
        page.off('console', consoleListener);
      }

      // Relatório consolidado
      console.log(chalk.bold('\n\n📋 RELATÓRIO CONSOLIDADO DE REQUISIÇÕES'));
      console.log('━'.repeat(60));
      
      if (allErrors.size > 0) {
        console.log(chalk.red.bold(`\n❌ ${allErrors.size} tipo(s) de erro encontrados:\n`));
        
        let errorIndex = 1;
        for (const [key, errorData] of allErrors) {
          // NOVO: Colorir diferentes tipos de erro
          let errorColor = chalk.red;
          if (errorData.type.includes('Warning')) {
            errorColor = chalk.yellow;
          } else if (errorData.type.includes('CORS')) {
            errorColor = chalk.magenta;
          } else if (errorData.type.includes('JavaScript')) {
            errorColor = chalk.red.bold;
          }
          
          console.log(errorColor(`${errorIndex}. ${errorData.type}`));
          if (errorData.status) console.log(chalk.yellow(`   Status: ${errorData.status} ${errorData.statusText || ''}`));
          if (errorData.method) console.log(chalk.blue(`   Método: ${errorData.method}`));
          console.log(chalk.gray(`   URL/Arquivo: ${errorData.url}`));
          if (errorData.error) {
            const errorText = errorData.error.length > 150 
              ? errorData.error.substring(0, 150) + '...'
              : errorData.error;
            console.log(chalk.gray(`   Detalhes: ${errorText}`));
          }
          if (errorData.resourceType) console.log(chalk.cyan(`   Tipo: ${errorData.resourceType}`));
          if (errorData.source) console.log(chalk.magenta(`   Origem: ${errorData.source}`));
          if (errorData.severity) console.log(chalk.cyan(`   Severidade: ${errorData.severity}`));
          console.log(chalk.blue(`   Ocorrências: ${errorData.count}x`));
          
          if (errorData.pages.length <= 3) {
            console.log(chalk.gray(`   Páginas: ${errorData.pages.join(', ')}`));
          } else {
            console.log(chalk.gray(`   Páginas: ${errorData.pages.slice(0, 3).join(', ')} e mais ${errorData.pages.length - 3}...`));
          }
          console.log('');
          errorIndex++;
        }
        
        // NOVO: Resumo por categoria de erro
        const errorsByCategory = {};
        for (const [key, errorData] of allErrors) {
          const category = errorData.type.includes('JavaScript') ? 'JavaScript' :
                          errorData.type.includes('CORS') ? 'CORS' :
                          errorData.type.includes('HTTP') ? 'HTTP' :
                          errorData.type.includes('Network') ? 'Network' :
                          errorData.type.includes('Warning') ? 'Warnings' : 'Others';
          
          if (!errorsByCategory[category]) errorsByCategory[category] = 0;
          errorsByCategory[category] += errorData.count;
        }
        
        if (Object.keys(errorsByCategory).length > 1) {
          console.log(chalk.cyan.bold('📊 RESUMO POR CATEGORIA:'));
          Object.entries(errorsByCategory).forEach(([category, count]) => {
            const color = category === 'JavaScript' ? chalk.red :
                         category === 'CORS' ? chalk.magenta :
                         category === 'Warnings' ? chalk.yellow : chalk.gray;
            console.log(color(`   ${category}: ${count} erro(s)`));
          });
          console.log('');
        }
        
        console.log(chalk.red.bold(`📊 TOTAL: ${requestErrorCount} erros em ${allErrors.size} URLs diferentes`));
      } else {
        console.log(chalk.green.bold('\n✅ Nenhum erro de requisição encontrado!'));
      }

      console.log('━'.repeat(60));
      
      // NOVO: Retornar erros detalhados para o relatório final
      return { 
        totalErros, 
        requestErrorCount,
        requestErrors // NOVO: incluir array de erros para o relatório final
      };
    }

    // fallback: comportamento antigo (página única) - também otimizado
    console.log(chalk.blue('⚡ Modo otimizado: recursos visuais desabilitados, foco em requisições HTTP\n'));
    
    const { browser: b, page, requestErrors } = await prepareBrowserForRequests(URL_ALVO, LOGIN_CONFIG);
    browser = b;

    console.log(chalk.bold('\n--- Relatório de Requisições (Página Única) ---'));
    if (requestErrors.length > 0) {
      let totalErros = 0;
      const formattedErrors = [];
      
      requestErrors.forEach(error => {
        totalErros++;
        console.log(`${chalk.red.bold(`✖ ERRO DE REQUISIÇÃO:`)} [${error.type}]`);
        if (error.status) console.log(`  Status: ${chalk.yellow(error.status)}`);
        if (error.method) console.log(`  Método: ${chalk.blue(error.method)}`);
        console.log(`  URL: ${error.url}`);
        if (error.error) console.log(`  Motivo: ${error.error}`);
        
        // NOVO: Adicionar contexto para página única
        formattedErrors.push({
          ...error,
          pageUrl: URL_ALVO,
          pageTitle: 'Página Principal'
        });
      });
      
      console.log('\n----------------------------------------------------');
      return { 
        totalErros, 
        requestErrorCount: requestErrors.length,
        requestErrors: formattedErrors
      };
    } else {
      console.log(chalk.green('Nenhuma requisição com erro encontrada.'));
      console.log('\n----------------------------------------------------');
      return { 
        totalErros: 0, 
        requestErrorCount: 0,
        requestErrors: []
      };
    }
  } catch (err) {
    console.log(chalk.red.bold('✖ FALHA CRÍTICA:'), err.message);
    return { 
      totalErros: 1, 
      requestErrorCount: 1,
      requestErrors: []
    };
  } finally {
    if (browser) await browser.close();
  }
}
