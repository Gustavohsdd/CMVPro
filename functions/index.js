// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const path = require("path");
// CORREÇÃO 1: Importar o FieldValue corretamente
const { FieldValue } = require("firebase-admin/firestore");

// Detecta se estamos no emulador e define o caminho da chave
const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

const serviceAccountKeyPath = isEmulator
  ? path.resolve(__dirname, '../.keys/leitor-planilha.json')
  : process.env.GOOGLE_APPLICATION_CREDENTIALS;

const sheetsAuth = new google.auth.GoogleAuth({
  keyFile: serviceAccountKeyPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

async function getSheets() {
  const authClient = await sheetsAuth.getClient();
  console.log('Sheets usando credenciais em:', serviceAccountKeyPath || '<não definida>');
  return google.sheets({ version: 'v4', auth: authClient });
}

admin.initializeApp();
const db = admin.firestore();

exports.atualizarPrecosDaPlanilha = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Você precisa estar autenticado para executar esta operação."
    );
  }

  const SPREADSHEET_ID = "1CFbP6_VC4TOJXITwO-nvxu6IX1brAYJNUCaRW0VDXDY";
  const SHEET_NAME = "Cotacoes";

  const sheets = await getSheets();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:AB`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.log("Nenhum dado encontrado na planilha.");
      return { success: true, message: "Nenhum dado encontrado na planilha." };
    }

    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    const columnIndex = {
      produto: headerRow.indexOf("Produto"),
      unidade: headerRow.indexOf("UN"),
      preco: headerRow.indexOf("Preço"),
      comprar: headerRow.indexOf("Comprar"),
      dataAbertura: headerRow.indexOf("Data Abertura"),
    };

    for (const key in columnIndex) {
      if (columnIndex[key] === -1) {
        throw new functions.https.HttpsError(
          "internal",
          `A coluna obrigatória "${key}" não foi encontrada na planilha.`
        );
      }
    }

    const itensParaComprar = dataRows.filter(row => {
      const quantidadeComprar = parseFloat(String(row[columnIndex.comprar] || '0').replace(",", ".")) || 0;
      return quantidadeComprar > 0;
    });

    const ultimasCompras = {};
    itensParaComprar.forEach(row => {
      const nomeProduto = row[columnIndex.produto];
      const dataAberturaStr = row[columnIndex.dataAbertura];

      if (!nomeProduto || !dataAberturaStr) { return; }
      
      const partesData = dataAberturaStr.split('/');
      const dataAbertura = new Date(partesData[2], partesData[1] - 1, partesData[0]);

      if (!ultimasCompras[nomeProduto] || dataAbertura > ultimasCompras[nomeProduto].data) {
        ultimasCompras[nomeProduto] = {
          data: dataAbertura,
          row: row,
        };
      }
    });

    const batch = db.batch();
    let atualizacoes = 0;

    for (const produto in ultimasCompras) {
      const item = ultimasCompras[produto];
      const rowData = item.row;

      const nome = rowData[columnIndex.produto];
      const unidade = rowData[columnIndex.unidade];
      const precoStr = rowData[columnIndex.preco];

      if (nome && unidade && precoStr) {
        const preco = parseFloat(String(precoStr).replace("R$", "").trim().replace(",", "."));

        if (!isNaN(preco)) {
          const docId = nome.trim().toLowerCase().replace(/\//g, "-");
          
          if (docId) { 
            const docRef = db.collection("insumos").doc(docId);

            batch.set(docRef, {
              nome: nome.trim(),
              unidade: unidade.trim(),
              preco: preco,
              // CORREÇÃO 2: Usar o FieldValue importado
              ultimaAtualizacao: FieldValue.serverTimestamp(),
            }, { merge: true });

            atualizacoes++;
          }
        }
      }
    }

    await batch.commit();

    const message = `${atualizacoes} insumos foram atualizados com sucesso com base nas últimas cotações.`;
    console.log(message);
    return { success: true, message: message };

  } catch (error) {
    console.error("Erro ao processar a planilha:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Ocorreu um erro ao ler a planilha e atualizar o banco de dados.",
      error.message
    );
  }
});