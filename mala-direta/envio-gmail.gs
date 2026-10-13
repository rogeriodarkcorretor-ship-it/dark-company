/**
 * MALA DIRETA — DARK COMPANY · INFINITY BUSINESS TOWER (Google Sheets + Gmail)
 *
 * Como usar:
 * 1. Importe lista-contatos-modelo.csv numa Planilha Google (aba "Contatos").
 * 2. Suba infinity-business-tower.jpg no Google Drive e copie o ID do arquivo
 *    (o trecho entre /d/ e /view no link) para IMAGEM_DRIVE_ID abaixo.
 * 3. Extensões > Apps Script > cole este arquivo.
 *    Crie um arquivo HTML no projeto chamado "email" e cole o conteúdo de email-classe-a.html.
 * 4. Rode testarComigo() — o e-mail chega para você. Confira no celular e no computador.
 * 5. Rode enviarLote() quantas vezes precisar (envia até LIMITE_POR_EXECUCAO por vez).
 *    A coluna "status" recebe ENVIADO/ERRO — reexecutar não reenvia para quem já recebeu.
 *    Para descadastrar alguém, escreva SAIR na coluna "status".
 */

const ABA = 'Contatos';
const IMAGEM_DRIVE_ID = 'COLE_AQUI_O_ID_DA_IMAGEM_NO_DRIVE';
const LIMITE_POR_EXECUCAO = 50;   // Gmail pessoal: ~100–500/dia · Workspace: até 2.000/dia. Comece baixo.
const PAUSA_MS = 4000;            // intervalo entre e-mails (melhora entregabilidade)
const REMETENTE_NOME = 'Rogério · Dark Company';
const DESCADASTRO = 'mailto:' + Session.getActiveUser().getEmail() + '?subject=SAIR';

// Assunto por perfil. {{saudacao}} = "Dr. Carlos", "Juliana" etc.
const ASSUNTOS = {
  medico:     '{{saudacao}}, em primeira mão: Infinity Business Tower em Piracicaba',
  dentista:   '{{saudacao}}, em primeira mão: Infinity Business Tower em Piracicaba',
  advogado:   '{{saudacao}}, pré-lançamento exclusivo: Infinity Business Tower',
  empresario: '{{saudacao}}, a nova torre corporativa de Piracicaba — pré-lançamento'
};
const ASSUNTO_PADRAO = '{{saudacao}}, pré-lançamento exclusivo em Piracicaba';

function saudacao_(c) {
  const trat = String(c.tratamento || '').trim();
  // Dr./Dra. ficam na saudação; Sr./Sra. soam formais demais num "Olá, ..., tudo bem?"
  return (/^dra?\.?$/i.test(trat) ? trat + ' ' : '') + String(c.nome || '').trim();
}

function montar_(c) {
  const dados = { saudacao: saudacao_(c), imagem: 'cid:infinity', link_descadastro: DESCADASTRO };
  const assunto = (ASSUNTOS[String(c.profissao).toLowerCase().trim()] || ASSUNTO_PADRAO)
                    .replace(/{{(\w+)}}/g, (_, k) => dados[k] || '');
  const html = HtmlService.createHtmlOutputFromFile('email').getContent()
                 .replace(/{{(\w+)}}/g, (_, k) => dados[k] || '');
  return { assunto, html };
}

function imagem_() {
  return DriveApp.getFileById(IMAGEM_DRIVE_ID).getBlob().setName('infinity.jpg');
}

function lerContatos_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA);
  const [cab, ...linhas] = sh.getDataRange().getValues();
  return { sh, cab, linhas };
}

function testarComigo() {
  const { cab, linhas } = lerContatos_();
  const c = Object.fromEntries(cab.map((h, i) => [h, linhas[0][i]]));
  const m = montar_(c);
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), '[TESTE] ' + m.assunto, '', {
    htmlBody: m.html, name: REMETENTE_NOME, inlineImages: { infinity: imagem_() }
  });
}

function enviarLote() {
  const { sh, cab, linhas } = lerContatos_();
  const colStatus = cab.indexOf('status');
  const img = imagem_();
  let enviados = 0;
  for (let i = 0; i < linhas.length && enviados < LIMITE_POR_EXECUCAO; i++) {
    const c = Object.fromEntries(cab.map((h, j) => [h, linhas[i][j]]));
    if (!c.email || c.status) continue;               // pula vazios, já enviados e descadastrados (SAIR)
    try {
      const m = montar_(c);
      GmailApp.sendEmail(c.email, m.assunto, '', {
        htmlBody: m.html, name: REMETENTE_NOME, inlineImages: { infinity: img }
      });
      sh.getRange(i + 2, colStatus + 1).setValue('ENVIADO ' + new Date().toLocaleString('pt-BR'));
      enviados++;
      Utilities.sleep(PAUSA_MS);
    } catch (e) {
      sh.getRange(i + 2, colStatus + 1).setValue('ERRO: ' + e.message);
    }
  }
  Logger.log(enviados + ' e-mails enviados. Cota restante hoje: ' + MailApp.getRemainingDailyQuota());
}

/**
 * CAPTAÇÃO — recebe os cadastros da página infinity-business-tower.html
 * Implantar > Nova implantação > Tipo "App da Web" > Executar como: Eu · Acesso: Qualquer pessoa.
 * Copie a URL gerada e cole em ENDPOINT no <script> da página.
 * Cada cadastro entra como nova linha na aba "Contatos" (status vazio = entra no próximo enviarLote()).
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = e.parameter || {};
    const email = String(p.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !p.consentimento) {
      return ContentService.createTextOutput('invalid');
    }
    const { sh, cab, linhas } = lerContatos_();
    const colEmail = cab.indexOf('email');
    if (linhas.some(l => String(l[colEmail]).trim().toLowerCase() === email)) {
      return ContentService.createTextOutput('duplicate');
    }
    const dados = Object.assign({}, p, { email: email, status: '' });
    sh.appendRow(cab.map(h => (dados[h] !== undefined ? String(dados[h]).slice(0, 200) : '')));
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}
