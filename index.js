import 'dotenv/config';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import runColorTest, { checkColorsOnPage } from './test_colors.js';
import runTextTest, { checkTextOnPage } from './test_text.js';
import runRequestsTest from './test_requests.js';
import runNavigationTest, { discoverLinks } from './test_navigation.js';
import runDebugTest from './test_navigation_debug.js';

import { 
  showStatus, 
  LOGIN_CONFIG, 
  URL_ALVO, 
  prepareBrowserPage, 
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const arg = process.argv[2] ? process.argv[2].toLowerCase() : 'all';

// NOVO: flag para ignorar "Network Failure"
const IGNORE_NETWORK_FAILURE = String(process.env.IGNORE_NETWORK_FAILURE || '').toLowerCase() === 'true';

async function generateFinalReport(results, arg, startTime) {
  const duration = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  console.log('\n' + '━'.repeat(80));
  console.log(chalk.bold.cyan('                     📊 RELATÓRIO FINAL DE EXECUÇÃO'));
  console.log('━'.repeat(80));
  
  // Header com informações básicas
  console.log(chalk.gray(`🎯 Tipo de Teste: ${arg.toUpperCase()}`));
  console.log(chalk.gray(`⏱️  Duração: ${timeStr}`));
  console.log(chalk.gray(`🌐 URL Base: ${URL_ALVO.replace(/^https?:\/\//, '')}`));
  if (results.linksTestados) {
    console.log(chalk.gray(`📄 Páginas Testadas: ${results.linksTestados}`));
  }
  console.log('');

  // Estatísticas por categoria
  const stats = [
    { name: 'Cores Inválidas', count: results.colorErrorCount || 0, icon: '🎨' },
    { name: 'Textos Problemáticos', count: results.textErrorCount || 0, icon: '📝' },
    { name: 'Erros de Requisição', count: results.requestErrorCount || 0, icon: '🌐' },
    { name: 'Falhas de Navegação', count: results.navigationErrors || 0, icon: '🧭' }
  ].filter(stat => stat.count !== undefined);

  if (stats.length > 0) {
    console.log(chalk.bold('📋 ESTATÍSTICAS DETALHADAS'));
    console.log('┌─' + '─'.repeat(35) + '┬─' + '─'.repeat(10) + '┐');
    console.log('│ ' + chalk.bold('Categoria').padEnd(34) + '│ ' + chalk.bold('Qtd').padStart(9) + ' │');
    console.log('├─' + '─'.repeat(35) + '┼─' + '─'.repeat(10) + '┤');
    
    stats.forEach(stat => {
      const color = stat.count > 0 ? chalk.red : chalk.green;
      const countStr = stat.count.toString().padStart(9);
      console.log(`│ ${stat.icon} ${stat.name.padEnd(31)} │ ${color(countStr)} │`);
    });
    
    console.log('└─' + '─'.repeat(35) + '┴─' + '─'.repeat(10) + '┘');
    console.log('');
  }

  // Status final
  const totalErrors = results.totalErros || 0;
  if (totalErrors === 0) {
    console.log(chalk.green.bold('🎉 EXECUÇÃO CONCLUÍDA COM SUCESSO!'));
    console.log(chalk.green('   ✓ Nenhum problema encontrado'));
    if (results.linksEncontrados) {
      console.log(chalk.green(`   ✓ ${results.linksEncontrados} páginas mapeadas`));
    }
  } else {
    console.log(chalk.red.bold('⚠️  PROBLEMAS ENCONTRADOS'));
    console.log(chalk.red(`   ✗ ${totalErrors} ${totalErrors === 1 ? 'problema' : 'problemas'} detectados`));
    console.log(chalk.yellow('   💡 Consulte os detalhes acima para correções'));
  }

  // Links úteis
  console.log('');
  console.log(chalk.bold('📄 ARQUIVOS GERADOS'));
  const logFile = path.join(__dirname, 'relatorio_logs.txt');
  const linksFile = path.join(__dirname, 'links_map.json');
  const screenshotsDir = path.join(__dirname, 'screenshots');
  
  console.log(chalk.gray(`   📝 Logs completos: ${path.basename(logFile)}`));
  if (fs.existsSync(linksFile)) {
    console.log(chalk.gray(`   🗺️  Mapa de links: ${path.basename(linksFile)}`));
  }
  if (fs.existsSync(screenshotsDir) && fs.readdirSync(screenshotsDir).length > 0) {
    const screenshotCount = fs.readdirSync(screenshotsDir).length;
    console.log(chalk.gray(`   📸 Screenshots: ${screenshotCount} arquivos em ${path.basename(screenshotsDir)}/`));
  }

  console.log('━'.repeat(80));
  
  return totalErrors === 0 ? 0 : 1; // Exit code
}

async function main() {
  const startTime = Date.now();
  console.log(chalk.bold(`🤖 Validador Web - Comando: ${arg}\n`));
  const results = { totalErros: 0 };

  if (arg === 'discover') {
    console.log(chalk.blue.bold(`🗺️  Executando APENAS descoberta de links...\n`));
    let browser;
    try {
      const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
      browser = b;

      // Descobrir todos os links
      const links = await discoverLinks(page);
      console.log(chalk.green.bold(`\n🎯 Descoberta concluída! ${links.length} páginas mapeadas.`));
      
      // Relatório resumido
      console.log(chalk.bold('\n--- Links Descobertos ---'));
      links.forEach((link, index) => {
        console.log(`${chalk.cyan(`${index + 1}.`)} ${link.text} ${chalk.gray(`(${link.href})`)}`);
      });

      return { totalErros: 0, linksEncontrados: links.length };
    } catch (err) {
      console.log(chalk.red.bold(`✖ FALHA na descoberta de links:`), err.message);
      results.totalErros++;
    } finally {
      if (browser) await browser.close();
    }
  }

  else if (arg === 'all-pages') {
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
      
      // 3. Perguntar se o usuário quer continuar com os testes
      console.log(chalk.yellow.bold('❓ Deseja executar os testes em todas as páginas? (isso pode demorar)'));
      console.log(chalk.gray('   Use Ctrl+C para cancelar e executar apenas "npm start discover" para mapear links.'));
      console.log(chalk.blue('   Continuando em 5 segundos...\n'));
      
      // Pausa de 5 segundos para dar chance de cancelar
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 4. Loop de teste
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
          // NOVO: respeitar flag para ignorar "Network Failure"
          if (IGNORE_NETWORK_FAILURE) return;
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
        console.log(chalk.bold('\n🌐 Verificando Requisições...'));
        if (requestErrors.length > 0) {
          requestErrors.forEach(error => {
            console.log(`${chalk.red.bold(`✖`)} ${error.type} - ${chalk.gray(error.url.substring(0, 60))}${error.url.length > 60 ? '...' : ''}`);
            if (error.status) console.log(`   Status: ${chalk.yellow(error.status)}`);
          });
          results.totalErros += requestErrors.length;
          results.requestErrorCount += requestErrors.length;
        } else {
          console.log(chalk.green('✓ Requisições OK'));
        }
        
        // Teste de Cores
        console.log(chalk.bold('\n🎨 Verificando Cores...'));
        const colorResults = await checkColorsOnPage(page);
        results.totalErros += colorResults.totalErros;
        results.colorErrorCount += colorResults.colorErrorCount || 0;
        if ((colorResults.colorErrorCount || 0) === 0) {
          console.log(chalk.green('✓ Cores OK'));
        }
        
        // Teste de Texto
        console.log(chalk.bold('\n📝 Verificando Textos...'));
        const textResults = await checkTextOnPage(page);
        results.totalErros += textResults.totalErros;
        results.textErrorCount += textResults.textErrorCount || 0;
        if ((textResults.textErrorCount || 0) === 0) {
          console.log(chalk.green('✓ Textos OK'));
        }
        
        console.log(chalk.cyan.bold(`\n✅ Página [${i+1}/${links.length}] concluída`));

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
  
  else {
    if (arg === 'colors' || arg === 'all') {
      const res = await runColorTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
      results.colorErrorCount = (res && res.colorErrorCount) ? res.colorErrorCount : 0;
    }
    if (arg === 'text' || arg === 'all') {
      const res = await runTextTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
      results.textErrorCount = (res && res.textErrorCount) ? res.textErrorCount : 0;
    }
    if (arg === 'requests' || arg === 'request' || arg === 'all') {
      const res = await runRequestsTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
      results.requestErrorCount = (res && res.requestErrorCount) ? res.requestErrorCount : 0;
    }
    if (arg === 'navigation' || arg === 'all') {
      const res = await runNavigationTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
      results.navigationErrors = (res && res.totalErros) ? res.totalErros : 0;
    }
    if (arg === 'debug') {
      const res = await runDebugTest();
      results.totalErros += (res && res.totalErros) ? res.totalErros : 0;
    }
  }

  // --- Salvar logs e gerar relatório final ---
  try {
    const logFile = path.join(__dirname, 'relatorio_logs.txt');
    fs.writeFileSync(logFile, LOG_BUFFER.join('\n'), 'utf8');
  } catch (e) {
    console.error('Falha ao salvar o arquivo de logs:', e.message);
  }

  const exitCode = await generateFinalReport(results, arg, startTime);
  process.exit(exitCode);
}

main();