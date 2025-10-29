import chalk from 'chalk';
import { URL_ALVO, prepareBrowserPage, showStatus, LOGIN_CONFIG, loadLinksMap } from './utils.js';

export default async function runRequestsTest() {
  console.log(chalk.blue(`Executando teste de REQUISIÇÕES para: ${URL_ALVO}\n`));
  let browser;
  try {
    // NOVO: usar loader unificado (TS/JS/JSON)
    const { links, source: linksSource } = await loadLinksMap();
    if (links && links.length) {
      console.log(chalk.gray(`Usando ${links.length} links de: ${linksSource}`));
      const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
      browser = b;
      let totalErros = 0;
      let requestErrorCount = 0;
      const allErrors = new Map(); // Agrupar erros por URL

      console.log(chalk.cyan('\n📊 Iniciando análise de requisições...\n'));

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const progress = `${i+1}/${links.length}`;
        
        // Progresso visual melhorado
        process.stdout.write(chalk.gray(`[${progress}] ${link.text.substring(0, 40)}${link.text.length > 40 ? '...' : ''}`));

        const requestErrors = [];
        const responseListener = (response) => {
          try {
            if (!response.ok()) {
              requestErrors.push({ type: 'HTTP Error', status: response.status(), url: response.url() });
            }
          } catch { /* ignore */ }
        };
        const requestFailedListener = (request) => {
          try {
            requestErrors.push({ type: 'Network Failure', url: request.url(), error: request.failure() ? request.failure().errorText : 'unknown' });
          } catch { /* ignore */ }
        };
        page.on('response', responseListener);
        page.on('requestfailed', requestFailedListener);

        try {
          await page.goto(link.href, { waitUntil: 'networkidle2' });
          
          // Processar erros encontrados
          if (requestErrors.length > 0) {
            process.stdout.write(chalk.red(` ✖ ${requestErrors.length} erro(s)\n`));
            requestErrors.forEach(error => {
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
              totalErros++;
              requestErrorCount++;
            });
          } else {
            process.stdout.write(chalk.green(` ✓ OK\n`));
          }
        } catch (e) {
          process.stdout.write(chalk.yellow(` ⚠ Falha na navegação\n`));
          console.log(chalk.gray(`   └─ ${e.message.split('\n')[0]}`));
          totalErros++;
        }

        page.off('response', responseListener);
        page.off('requestfailed', requestFailedListener);
      }

      // Relatório consolidado
      console.log(chalk.bold('\n\n📋 RELATÓRIO CONSOLIDADO DE REQUISIÇÕES'));
      console.log('━'.repeat(60));
      
      if (allErrors.size > 0) {
        console.log(chalk.red.bold(`\n❌ ${allErrors.size} tipo(s) de erro encontrados:\n`));
        
        let errorIndex = 1;
        for (const [key, errorData] of allErrors) {
          console.log(chalk.red(`${errorIndex}. ${errorData.type}`));
          if (errorData.status) console.log(chalk.yellow(`   Status: ${errorData.status}`));
          console.log(chalk.gray(`   URL: ${errorData.url}`));
          if (errorData.error) console.log(chalk.gray(`   Motivo: ${errorData.error}`));
          console.log(chalk.blue(`   Ocorrências: ${errorData.count}x`));
          
          if (errorData.pages.length <= 3) {
            console.log(chalk.gray(`   Páginas: ${errorData.pages.join(', ')}`));
          } else {
            console.log(chalk.gray(`   Páginas: ${errorData.pages.slice(0, 3).join(', ')} e mais ${errorData.pages.length - 3}...`));
          }
          console.log('');
          errorIndex++;
        }
        
        console.log(chalk.red.bold(`📊 RESUMO: ${requestErrorCount} erros totais em ${allErrors.size} URLs diferentes`));
      } else {
        console.log(chalk.green.bold('\n✅ Nenhum erro de requisição encontrado!'));
      }

      console.log('━'.repeat(60));
      await showStatus(page, 'Análise de requisições concluída.');
      return { totalErros, requestErrorCount };
    }

    // fallback: comportamento antigo (página única)
    const { browser: b, page, requestErrors } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
    browser = b;

    await showStatus(page, 'Verificando erros de rede...');
    console.log(chalk.bold('\n--- Relatório de Requisições ---'));
    if (requestErrors.length > 0) {
      let totalErros = 0;
      requestErrors.forEach(error => {
        totalErros++;
        console.log(`${chalk.red.bold(`✖ ERRO DE REQUISIÇÃO:`)} [${error.type}]`);
        if (error.status) console.log(`  Status: ${chalk.yellow(error.status)}`);
        console.log(`  URL: ${error.url}`);
        if (error.error) console.log(`  Motivo: ${error.error}`);
      });
      console.log('\n----------------------------------------------------');
      await showStatus(page, 'Relatório de requisições concluído (erros encontrados).');
      return { totalErros, requestErrorCount: requestErrors.length };
    } else {
      console.log(chalk.green('Nenhuma requisição com erro encontrada.'));
      console.log('\n----------------------------------------------------');
      await showStatus(page, 'Relatório de requisições concluído (sem erros).');
      return { totalErros: 0, requestErrorCount: 0 };
    }
  } catch (err) {
    console.log(chalk.red.bold('✖ FALHA CRÍTICA:'), err.message);
    return { totalErros: 1, requestErrorCount: 1 };
  } finally {
    if (browser) await browser.close();
  }
}
