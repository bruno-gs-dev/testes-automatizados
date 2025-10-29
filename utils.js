import 'dotenv/config';
import puppeteer from 'puppeteer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Helpers para parsing de .env
const toBool = (v, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'new'].includes(s);
};
const toNum = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
};
const toList = (v) => {
  if (!v) return [];
  return String(v).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
};

// Lidos do .env
export const URL_ALVO = process.env.URL_ALVO || 'https://smartviaamc.atlantatecnologia.com.br/app/paginainicial';

export const PALETA_CORES_PERMITIDAS = (
  process.env.PALETA_CORES_PERMITIDAS
    ? toList(process.env.PALETA_CORES_PERMITIDAS).map(s => s.toLowerCase())
    : ['#ffffff', '#000000', '#f8f9fa', '#1e293b', '#1f3f6e']
);

export function normalizeColor(colorString) {
  if (!colorString) return colorString;
  if (colorString === 'transparent') return 'rgba(0, 0, 0, 0)';
  if (colorString.startsWith('rgba')) {
    const rgba = colorString.match(/\d+(\.\d+)?/g).map(Number);
    if (rgba.length === 4 && rgba[3] === 0) return 'rgba(0, 0, 0, 0)';
    const r = rgba[0], g = rgba[1], b = rgba[2];
    return '#' + [r, g, b].map(x => ('0' + x.toString(16)).slice(-2)).join('');
  }
  if (colorString.startsWith('rgb')) {
    const rgb = colorString.match(/\d+/g).map(Number);
    return '#' + rgb.map(x => ('0' + x.toString(16)).slice(-2)).join('');
  }
  return colorString.toLowerCase();
}

// NOVO: Configuração de login centralizada (vinda do .env)
export const LOGIN_CONFIG = {
  idVerificacao: toNum(process.env.LOGIN_ID_VERIFICACAO, 40),
  expectedPath: process.env.EXPECTED_PATH || '/app/paginainicial',
  idSistema: toNum(process.env.LOGIN_ID_SISTEMA, 11),
  idContrato: (process.env.LOGIN_ID_CONTRATO ? toList(process.env.LOGIN_ID_CONTRATO).map(n => toNum(n, null)).filter(n => n != null) : [7]),
  nomeSistema: process.env.LOGIN_NOME_SISTEMA || 'SMARTVIA',
  contratoNome: process.env.LOGIN_CONTRATO_NOME || 'AMC VIAS INTELIGENTES',
  url: process.env.BASE_URL || 'https://smartviaamc.atlantatecnologia.com.br/',
  username: process.env.LOGIN_USERNAME || 'bruno.gomes',
  password: process.env.LOGIN_PASSWORD || 'a123456',
  selectors: {
    username: process.env.LOGIN_SELECTOR_USERNAME || '#email',
    password: process.env.LOGIN_SELECTOR_PASSWORD || '#password',
    submit: process.env.LOGIN_SELECTOR_SUBMIT || "button:contains('Entrar')"
  }
};

// NOVO: overlay de status no navegador
export async function showStatus(page, text) {
  try {
    await page.evaluate((msg) => {
      let el = document.getElementById('__qa_status_overlay');
      if (!el) {
        el = document.createElement('div');
        el.id = '__qa_status_overlay';
        el.setAttribute('data-qa-ignore', 'true');       // NOVO: ignorar nos testes
        el.setAttribute('aria-hidden', 'true');          // NOVO: acessibilidade
        el.style.cssText = 'position:fixed;z-index:2147483647;top:10px;left:10px;background:rgba(0,0,255,.12);backdrop-filter:saturate(120%);color:#0b5fff;font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px 10px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:none'; // NOVO: pointer-events none
        document.body.appendChild(el);
      } else {
        el.setAttribute('data-qa-ignore', 'true');
        el.setAttribute('aria-hidden', 'true');
        el.style.pointerEvents = 'none';
      }
      el.textContent = 'Automation: ' + msg;
    }, text);
  } catch {
    // ignora se a page ainda não estiver pronta
  }
}

// NOVO: helper para achar seletor em qualquer frame
async function getFrameWithSelector(page, selector) {
  for (const frame of page.frames()) {
    try {
      if (await frame.$(selector)) return frame;
    } catch { /* ignore */ }
  }
  return null;
}

// NOVO: digitar em input dentro de um frame disparando eventos (input/change/blur)
async function fillInputInFrame(frame, selector, value) {
  try {
    const el = await frame.$(selector);
    if (!el) return false;
    await el.click({ clickCount: 3 }).catch(() => {});
    // limpar selecionado
    await el.press('Backspace').catch(() => {});
    // digitar com delay para simular usuário
    await frame.type(selector, value, { delay: 30 });
    // garantir disparo de eventos e blur
    await frame.$eval(selector, (input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    });
    // confirmar valor persistido
    const typed = await frame.$eval(selector, (i) => i.value);
    return typed === value;
  } catch {
    return false;
  }
}

// NOVO: clicar botão por texto dentro de um frame (sem usar XPath)
async function clickButtonByTextInFrame(frame, text) {
  if (!frame || !text) return false;
  const needle = text.trim().toLowerCase();
  try {
    const handles = await frame.$$('button, [role="button"], a[role="button"], input[type="submit"], input[type="button"], button[type="submit"]');
    for (const h of handles) {
      const ok = await h.evaluate((el, t) => {
        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        const val = (el.value || '').trim().toLowerCase();
        return txt.includes(t) || val.includes(t);
      }, needle);
      if (ok) {
        await h.click().catch(() => {});
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// NOVO: realizar login (suporte a frames e busca por texto sem XPath, com digitação real)
export async function performLogin(page, loginConfig) {
  const baseUrl = loginConfig.url;
  const expectedPath = loginConfig.expectedPath || '/';

  await showStatus(page, 'Acessando tela de login...');
  await page.goto(baseUrl, { waitUntil: 'networkidle2' }).catch(() => {});

  const selUser = loginConfig.selectors.username;
  const selPass = loginConfig.selectors.password;
  const selSubmit = loginConfig.selectors.submit;

  // Aguarda aparecerem os campos em qualquer frame (espera ativa, sem timeout do Puppeteer)
  let userFrame = null, passFrame = null;
  const startFind = Date.now();
  while (Date.now() - startFind < 15000 && (!userFrame || !passFrame)) {
    if (!userFrame && selUser) userFrame = await getFrameWithSelector(page, selUser);
    if (!passFrame && selPass) passFrame = await getFrameWithSelector(page, selPass);
    if (userFrame && passFrame) break;
    await new Promise(r => setTimeout(r, 300));
  }
  // fallback para main frame se não achar
  const mainFrame = page.mainFrame();
  if (!userFrame) userFrame = mainFrame;
  if (!passFrame) passFrame = mainFrame;

  // Preenche os campos com digitação real + eventos
  await showStatus(page, 'Preenchendo e validando campos...');
  const userOk = selUser ? await fillInputInFrame(userFrame, selUser, loginConfig.username) : true;
  const passOk = selPass ? await fillInputInFrame(passFrame, selPass, loginConfig.password) : true;

  // Se ainda não OK, tenta mais uma vez (alguns apps só aceitam após blur)
  if (!userOk && selUser) await fillInputInFrame(userFrame, selUser, loginConfig.username);
  if (!passOk && selPass) await fillInputInFrame(passFrame, selPass, loginConfig.password);

  await showStatus(page, 'Enviando credenciais...');

  // Clique do submit: por seletor CSS ou por texto (em qualquer frame)
  const clickSubmitInFrame = async (frame) => {
    if (!frame) return false;
    if (selSubmit && !selSubmit.includes(':contains(')) {
      return frame.click(selSubmit).then(() => true).catch(() => false);
    }
    if (selSubmit && selSubmit.includes(':contains(')) {
      const textMatch = selSubmit.match(/:contains\(['"]?(.*?)[\'"]?\)/i);
      const text = textMatch ? textMatch[1] : null;
      if (text) {
        const clicked = await clickButtonByTextInFrame(frame, text);
        if (clicked) return true;
      }
    }
    return false;
  };

  let clicked = await clickSubmitInFrame(userFrame || passFrame);
  if (!clicked) {
    for (const frame of page.frames()) {
      if (await clickSubmitInFrame(frame)) { clicked = true; break; }
    }
  }
  if (!clicked && selPass && passFrame) {
    const handle = await passFrame.$(selPass);
    if (handle) {
      // Pressiona Enter no campo de senha como fallback e força blur depois
      await handle.press('Enter').catch(() => {});
      await passFrame.$eval(selPass, (input) => input.blur()).catch(() => {});
    }
  }

  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});

  // Verificação de rota esperada (espera ativa)
  const targetPath = expectedPath;
  const start = Date.now();
  const maxWaitMs = 20000;
  while ((Date.now() - start) < maxWaitMs) {
    try {
      const urlObj = new URL(page.url());
      if (urlObj.pathname === targetPath || urlObj.pathname.endsWith(targetPath)) {
        await showStatus(page, 'Login realizado com sucesso.');
        console.log(chalk.green('Login realizado com sucesso, rota esperada encontrada:'), urlObj.pathname);
        return true;
      }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 300));
  }

  await showStatus(page, 'Não foi possível confirmar login.');
  console.log(chalk.yellow('Aviso: não foi possível confirmar que a rota esperada foi atingida após o login.'));
  return false;
}

// NOVO: destacar elemento com outline azul
export async function highlightElement(page, selector, color = '#1e90ff') {
  try {
    await page.evaluate((sel, col) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (!el.dataset.qaPrevOutline) el.dataset.qaPrevOutline = el.style.outline || '';
      if (!el.dataset.qaPrevOutlineOffset) el.dataset.qaPrevOutlineOffset = el.style.outlineOffset || '';
      el.style.outline = `3px solid ${col}`;
      el.style.outlineOffset = '2px';
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch {}
    }, selector, color);
  } catch {}
}

export async function clearElementHighlight(page, selector) {
  try {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const prevOutline = el.dataset.qaPrevOutline ?? '';
      const prevOffset = el.dataset.qaPrevOutlineOffset ?? '';
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOffset;
      delete el.dataset.qaPrevOutline;
      delete el.dataset.qaPrevOutlineOffset;
    }, selector);
  } catch {}
}

// NOVO: flag para habilitar/desabilitar screenshots (ENV: ENABLE_SCREENSHOTS=0|false para desabilitar)
export const ENABLE_SCREENSHOTS = (() => {
  const v = process.env.ENABLE_SCREENSHOTS;
  if (v == null) return true;
  return !(v.toLowerCase() === '0' || v.toLowerCase() === 'false');
})();

export async function takeScreenshot(page, selector, fileName) {
  // NOVO: respeita a flag
  if (!ENABLE_SCREENSHOTS) {
    console.log('  Captura de tela desabilitada por flag (ENABLE_SCREENSHOTS).');
    return;
  }
  try {
    const elementHandle = await page.$(selector);
    if (elementHandle) {
      const screenshotPath = path.join(SCREENSHOT_DIR, fileName);
      await elementHandle.screenshot({ path: screenshotPath });
      console.log(`  ${chalk.gray('Screenshot salvo em:')} ${screenshotPath}`);
    } else {
      console.log(`  ${chalk.yellow('Aviso:')} Não foi possível encontrar o elemento ${selector} para o screenshot.`);
    }
  } catch (error) {
    console.log(`  ${chalk.red('Erro ao tirar screenshot:')}`, (error && error.message) ? error.message.split('\n')[0] : error);
  }
}

// Prepara o browser e page, adiciona listeners de rede, cria pasta de screenshots.
// Retorna { browser, page, requestErrors } já com a navegação para a URL feita.
export async function prepareBrowserPage(url, launchOptions = {}, loginConfig = null) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR);
  }
  // REMOVIDO: não apagar mais os arquivos existentes
  // else {
  //   fs.readdirSync(SCREENSHOT_DIR).forEach(file => fs.unlinkSync(path.join(SCREENSHOT_DIR, file)));
  // }

  // NOVO: ler opções do Puppeteer do .env
  const ENV_HEADLESS = toBool(process.env.HEADLESS, false);
  const ENV_SLOWMO = toNum(process.env.SLOWMO, 50);
  const ENV_MAXIMIZE = toBool(process.env.MAXIMIZE, true);
  const ENV_VIEWPORT_W = toNum(process.env.VIEWPORT_WIDTH, 1920);
  const ENV_VIEWPORT_H = toNum(process.env.VIEWPORT_HEIGHT, 1080);

  const browser = await puppeteer.launch({
    headless: ENV_HEADLESS,
    defaultViewport: ENV_MAXIMIZE ? null : { width: ENV_VIEWPORT_W, height: ENV_VIEWPORT_H },
    slowMo: ENV_SLOWMO,
    ...launchOptions,
    args: [
      ...(launchOptions.args || []),
      ...(ENV_MAXIMIZE ? ['--start-maximized'] : [])
    ]
  });
  const page = await browser.newPage();

  // Ajusta viewport somente se não maximizado
  if (!ENV_MAXIMIZE) {
    await page.setViewport({ width: ENV_VIEWPORT_W, height: ENV_VIEWPORT_H });
  }

  // NOVO: desabilitar timeouts globais
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);

  // NOVO: repassar console do navegador
  page.on('console', msg => {
    try {
      console.log(`[browser] ${msg.text()}`);
    } catch {
      // ignora
    }
  });

  const requestErrors = [];

  page.on('response', response => {
    if (!response.ok()) {
      requestErrors.push({
        type: 'HTTP Error',
        status: response.status(),
        url: response.url(),
      });
    }
  });

  page.on('requestfailed', request => {
    requestErrors.push({
      type: 'Network Failure',
      url: request.url(),
      error: request.failure() ? request.failure().errorText : 'unknown',
    });
  });

  try {
    await showStatus(page, loginConfig ? 'Iniciando login...' : 'Carregando página alvo...');
    if (loginConfig) {
      await performLogin(page, loginConfig);
    }
    await page.goto(url, { waitUntil: 'networkidle2' });
    await showStatus(page, 'Página carregada.');
  } catch (error) {
    await browser.close();
    throw new Error(`Não foi possível carregar a URL: ${url} — ${error.message}`);
  }

  return { browser, page, requestErrors };
}

// NOVO: carregador unificado de links (TS/JS/JSON) com parser robusto do .ts
export async function loadLinksMap() {
  const tsPath = path.join(__dirname, 'links_map.ts');
  const jsPath = path.join(__dirname, 'links_map.js');
  const jsonPath = path.join(__dirname, 'links_map.json');

  const tryImportModule = async (absPath) => {
    try {
      if (!fs.existsSync(absPath)) return null;
      const moduleUrl = pathToFileURL(absPath).href;
      const mod = await import(moduleUrl);
      const links = mod.default || mod.linksMap || mod;
      return Array.isArray(links) ? links : null;
    } catch {
      return null;
    }
  };

  const loadLinksFromTs = (absPath) => {
    try {
      if (!fs.existsSync(absPath)) return null;
      const src = fs.readFileSync(absPath, 'utf8');

      const extractArrayLiteral = (code) => {
        let startSearch = code.indexOf('linksMap');
        if (startSearch < 0) startSearch = 0;
        let inS = false, inD = false, inT = false;
        let inLC = false, inBC = false, esc = false;
        let depth = 0, start = -1, end = -1;

        for (let i = startSearch; i < code.length; i++) {
          const ch = code[i], nx = code[i + 1];

          if (inLC) { if (ch === '\n' || ch === '\r') inLC = false; continue; }
          if (inBC) { if (ch === '*' && nx === '/') { inBC = false; i++; } continue; }

          if (inS) { if (!esc && ch === '\'') inS = false; esc = ch === '\\' && !esc; continue; }
          if (inD) { if (!esc && ch === '"') inD = false; esc = ch === '\\' && !esc; continue; }
          if (inT) { if (!esc && ch === '`') inT = false; esc = ch === '\\' && !esc; continue; }

          if (ch === '/' && nx === '/') { inLC = true; i++; continue; }
          if (ch === '/' && nx === '*') { inBC = true; i++; continue; }

          if (ch === '\'') { inS = true; esc = false; continue; }
          if (ch === '"') { inD = true; esc = false; continue; }
          if (ch === '`') { inT = true; esc = false; continue; }

          if (ch === '[') { if (depth === 0) start = i; depth++; continue; }
          if (ch === ']') { depth--; if (depth === 0) { end = i; break; } continue; }
        }
        if (start >= 0 && end > start) return code.slice(start, end + 1);
        return null;
      };

      const stripCommentsPreserveStrings = (code) => {
        let out = '';
        let inS = false, inD = false, inT = false;
        let inLC = false, inBC = false, esc = false;

        for (let i = 0; i < code.length; i++) {
          const ch = code[i], nx = code[i + 1];

          if (inLC) { if (ch === '\n' || ch === '\r') { inLC = false; out += ch; } continue; }
          if (inBC) { if (ch === '*' && nx === '/') { inBC = false; i++; } continue; }

          if (inS) { out += ch; if (!esc && ch === '\'') inS = false; esc = ch === '\\' && !esc; continue; }
          if (inD) { out += ch; if (!esc && ch === '"') inD = false; esc = ch === '\\' && !esc; continue; }
          if (inT) { out += ch; if (!esc && ch === '`') inT = false; esc = ch === '\\' && !esc; continue; }

          if (ch === '/' && nx === '/') { inLC = true; i++; continue; }
          if (ch === '/' && nx === '*') { inBC = true; i++; continue; }

          if (ch === '\'') { inS = true; esc = false; out += ch; continue; }
          if (ch === '"') { inD = true; esc = false; out += ch; continue; }
          if (ch === '`') { inT = true; esc = false; out += ch; continue; }

          out += ch;
        }
        return out;
      };

      const arrayRaw = extractArrayLiteral(src);
      if (!arrayRaw) return null;

      let jsonLike = stripCommentsPreserveStrings(arrayRaw);
      jsonLike = jsonLike.replace(/,\s*(?=[}\]])/g, '');

      const linksArr = JSON.parse(jsonLike);
      return Array.isArray(linksArr) ? linksArr : null;
    } catch {
      return null;
    }
  };

  let links = await tryImportModule(tsPath) || await tryImportModule(jsPath);
  let source = null;

  if (links && Array.isArray(links)) {
    source = fs.existsSync(jsPath) ? 'links_map.js' : 'links_map.ts (module)';
  } else {
    links = loadLinksFromTs(tsPath);
    if (links && Array.isArray(links)) {
      source = 'links_map.ts (parsed)';
    } else if (fs.existsSync(jsonPath)) {
      links = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      source = 'links_map.json';
    }
  }

  if (links && Array.isArray(links)) {
    const seen = new Set();
    links = links.filter(l => l && l.href && !seen.has(l.href) && seen.add(l.href));
  }

  return { links: Array.isArray(links) ? links : [], source };
}
