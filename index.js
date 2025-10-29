// Salve este arquivo como: index.js
// (Atualizado com o runner 'all-pages')

import 'dotenv/config';
// Usando import em vez de require
import puppeteer from 'puppeteer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- NOVAS IMPORTAÇÕES ---
// Importa o default (runColorTest) E a função nomeada (checkColorsOnPage)
import runColorTest, { checkColorsOnPage } from './test_colors.js';
import runTextTest, { checkTextOnPage } from './test_text.js';
import runRequestsTest from './test_requests.js';
// Importa o default (runNavigationTest) E a função nomeada (discoverLinks)
import runNavigationTest, { discoverLinks } from './test_navigation.js';
import runDebugTest from './test_navigation_debug.js';

// Importamos prepareBrowserPage para o novo runner
import { 
  showStatus, 
  LOGIN_CONFIG, 
  URL_ALVO, 
  prepareBrowserPage, 
  SCREENSHOT_DIR // Import SCREENSHOT_DIR se takeScreenshot estiver aqui
} from './utils.js';
import { spawn } from 'child_process';

// --- CONFIGURAÇÃO ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- FIM DA CONFIGURAÇÃO ---

// NOVO: capturar logs e gerar .txt limpo (sem ANSI)
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const LOG_BUFFER = [];
const __origLog = console.log.bind(console);
const __origErr = console.error.bind(console);
console.log = (...args) => {
  const line = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  LOG_BUFFER.push(line.replace(ANSI_RE, ''));
  __origLog(...args);
};
console.error = (...args) => {
  const line = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  LOG_BUFFER.push(line.replace(ANSI_RE, ''));
  __origErr(...args);
};

// Substitui a execução monolítica por um runner simples de linha de comando.
const arg = process.argv[2] ? process.argv[2].toLowerCase() : 'all';

async function main() {
  console.log(chalk.bold(`Validador - comando: ${arg}\n`));
  const results = { totalErros: 0 };

  // --- NOVO RUNNER "ALL-PAGES" ---
  if (arg === 'all-pages') {
    console.log(chalk.blue.bold(`🚀 Executando suíte de testes COMPLETA (todas as páginas)...\n`));
    let browser;
    try {
      // 1. Lançar browser e logar UMA VEZ
      // Usamos URL_ALVO aqui, pois prepareBrowserPage faz o login e navega para a home
      const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
      browser = b;

      // 2. Descobrir todos os links
      const links = await discoverLinks(page);
      console.log(chalk.green.bold(`\n🗺️  Mapeamento concluído. ${links.length} páginas para testar.\n`));
      
      // 3. Loop de teste
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        console.log(chalk.cyan.bold.inverse(`\n--- 🧪 TESTANDO PÁGINA [${i+1}/${links.length}]: ${link.text} ---`));
        console.log(chalk.gray(`  ${link.href}\n`));
        
        // a. Set up listeners de requisição
        const requestErrors = [];
        const responseListener = (response) => {
          if (!response.ok()) {
            requestErrors.push({
              type: 'HTTP Error', status: response.status(), url: response.url(),
            });
          }
        };
        const requestFailedListener = (request) => {
          requestErrors.push({
            type: 'Network Failure', url: request.url(), error: request.failure() ? request.failure().errorText : 'unknown',
          });
        };
        page.on('response', responseListener);
        page.on('requestfailed', requestFailedListener);

        // b. Navegar para a página
        await showStatus(page, `Navegando para: ${link.text}...`);
        try {
          await page.goto(link.href, { waitUntil: 'networkidle2' });
        } catch (navErr) {
          console.log(chalk.red(`✖ FALHA ao navegar para ${link.text}: ${navErr.message.split('\n')[0]}`));
          results.totalErros++;
          // Limpa listeners antes de pular
          page.off('response', responseListener);
          page.off('requestfailed', requestFailedListener);
          continue; // Pula para o próximo link
        }

        // c. Rodar os testes na página atual
        
        // Teste de Requisições
        console.log(chalk.bold('\n--- Relatório de Requisições (Página) ---'));
        if (requestErrors.length > 0) {
          requestErrors.forEach(error => {
            console.log(`${chalk.red.bold(`✖ ERRO DE REQUISIÇÃO:`)} [${error.type}]`);
            if (error.status) console.log(`  Status: ${chalk.yellow(error.status)}`);
            console.log(`  URL: ${error.url}`);
            if (error.error) console.log(`  Motivo: ${error.error}`);
          });
          results.totalErros += requestErrors.length;
        } else {
          console.log(chalk.green('Nenhuma requisição com erro encontrada.'));
        }
        
        // Teste de Cores
        const colorResults = await checkColorsOnPage(page);
        results.totalErros += colorResults.totalErros;
        
        // Teste de Texto
        const textResults = await checkTextOnPage(page);
        results.totalErros += textResults.totalErros;
        
        console.log(chalk.cyan.bold('--- FIM DOS TESTES DA PÁGINA ---'));

        // d. Limpar listeners
        page.off('response', responseListener);
        page.off('requestfailed', requestFailedListener);
      }

    } catch (err) {
      console.log(chalk.red.bold(`✖ FALHA CRÍTICA na suíte 'all-pages':`), err.message);
      results.totalErros++;
    } finally {
      if (browser) await browser.close();
    }
  }
  // --- FIM DO NOVO RUNNER ---
  
  // Runners antigos (ainda funcionam individualmente)
  else {
    if (arg === 'colors' || arg === 'all') {
      const res = await runColorTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
    }
    if (arg === 'text' || arg === 'all') {
      const res = await runTextTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
    }
    if (arg === 'requests' || arg === 'request' || arg === 'all') {
      const res = await runRequestsTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
    }
    if (arg === 'navigation' || arg === 'all') {
      const res = await runNavigationTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
    }
    if (arg === 'debug') {
      const res = await runDebugTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
    }
  }

  // --- Resumo Final ---
  console.log('\n----------------------------------------------------');
  console.log(chalk.bold('Resumo Final da Execução:'));
  if (results.totalErros === 0) {
    console.log(chalk.green.bold.inverse(' ✅ SUCESSO TOTAL! '),'Nenhum erro encontrado em toda a suíte.');
  } else {
    console.log(chalk.red.bold.inverse(' ❌ FALHA! '),'Foram encontrados', results.totalErros, 'problemas no total.');
  }

  // NOVO: salvar logs em .txt e abrir no Bloco de Notas
  try {
    const logFile = path.join(__dirname, 'relatorio_logs.txt');
    fs.writeFileSync(logFile, LOG_BUFFER.join('\n'), 'utf8');
    console.log(chalk.gray(`\nLogs completos salvos em: ${logFile}`));
    // abre no Bloco de Notas (Windows)
    const child = spawn('notepad.exe', [logFile], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    console.error('Falha ao salvar/abrir o arquivo de logs:', e.message);
  }
}

main();