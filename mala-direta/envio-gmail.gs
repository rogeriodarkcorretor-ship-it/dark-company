/**
 * MALA DIRETA — DARK COMPANY (Google Sheets + Gmail)
 *
 * Como usar:
 * 1. Importe lista-contatos-modelo.csv numa Planilha Google (aba "Contatos").
 * 2. Extensões > Apps Script > cole este arquivo.
 * 3. Crie um arquivo HTML no projeto chamado "email" e cole o conteúdo de email-classe-a.html.
 * 4. Rode testarComigo() primeiro. Depois rode enviarLote() (envia até LIMITE_POR_EXECUCAO).
 * 5. A coluna "status" é preenchida com ENVIADO/ERRO — reexecutar não reenvia.
 */

const ABA = 'Contatos';
const LIMITE_POR_EXECUCAO = 50;   // Gmail pessoal: 500/dia · Workspace: 2.000/dia. Comece baixo.
const PAUSA_MS = 4000;            // intervalo entre e-mails (melhora entregabilidade)
const REMETENTE_NOME = 'Rogério · Dark Company';
const DESCADASTRO = 'mailto:' + Session.getActiveUser().getEmail() + '?subject=SAIR';

const PERFIS = {
  medico: {
    assunto: '{{tratamento}} {{nome}}, uma curadoria reservada de imóveis em {{cidade}}',
    abertura: 'Sei que a agenda de quem cuida de pacientes raramente deixa espaço para visitar dezenas de imóveis. Por isso escrevo de forma direta: alguns dos imóveis mais interessantes de {{cidade}} são negociados de maneira reservada e nunca chegam aos portais.'
  },
  dentista: {
    assunto: '{{tratamento}} {{nome}}, imóveis de alto padrão fora dos portais',
    abertura: 'Entre consultório, equipe e pacientes, o seu tempo é o ativo mais disputado da semana. Por isso escrevo de forma direta: alguns dos imóveis mais interessantes de {{cidade}} são negociados de maneira reservada e nunca chegam aos portais.'
  },
  advogado: {
    assunto: '{{tratamento}} {{nome}}, uma seleção reservada — com documentação analisada',
    abertura: 'Quem conhece de perto o peso de um contrato bem feito sabe que, em imóveis, o risco costuma estar no que não foi verificado. Alguns dos imóveis mais interessantes de {{cidade}} são negociados de maneira reservada — e nós os apresentamos com a documentação já analisada.'
  },
  empresario: {
    assunto: '{{nome}}, oportunidades imobiliárias reservadas em {{cidade}}',
    abertura: 'Para quem toma decisões de negócio todos os dias, um imóvel é mais do que um endereço: é patrimônio, liquidez e posicionamento. Alguns dos imóveis mais interessantes de {{cidade}} são negociados de maneira reservada e nunca chegam aos portais.'
  }
};

function mesclar_(texto, dados) {
  return texto.replace(/{{(\w+)}}/g, (_, k) => (dados[k] !== undefined && dados[k] !== '' ? dados[k] : ''))
              .replace(/\s{2,}/g, ' ').trim();
}

function montar_(c) {
  const perfil = PERFIS[String(c.profissao).toLowerCase().trim()] || PERFIS.empresario;
  const dados = Object.assign({ cidade: 'Piracicaba', link_descadastro: DESCADASTRO }, c);
  if (!dados.cidade) dados.cidade = 'Piracicaba';
  dados.abertura = mesclar_(perfil.abertura, dados);
  const html = HtmlService.createHtmlOutputFromFile('email').getContent()
                 .replace(/{{(\w+)}}/g, (_, k) => dados[k] || '');
  return { assunto: mesclar_(perfil.assunto, dados), html: html };
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
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), '[TESTE] ' + m.assunto, '', { htmlBody: m.html, name: REMETENTE_NOME });
}

function enviarLote() {
  const { sh, cab, linhas } = lerContatos_();
  const colStatus = cab.indexOf('status');
  let enviados = 0;
  for (let i = 0; i < linhas.length && enviados < LIMITE_POR_EXECUCAO; i++) {
    const c = Object.fromEntries(cab.map((h, j) => [h, linhas[i][j]]));
    if (!c.email || c.status) continue;               // pula vazios, já enviados e descadastrados
    try {
      const m = montar_(c);
      GmailApp.sendEmail(c.email, m.assunto, '', {
        htmlBody: m.html, name: REMETENTE_NOME
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
