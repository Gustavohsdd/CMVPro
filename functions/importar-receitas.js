// functions/importar-receitas.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const path = require("path");

// A inicialização do app já é feita no index.js principal.
// Aqui, apenas garantimos acesso ao Firestore.
const db = admin.firestore();

// Pega as credenciais da mesma forma que o arquivo index.js
const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
const serviceAccountKeyPath = isEmulator
  ? path.resolve(__dirname, '../.keys/leitor-planilha.json')
  : process.env.GOOGLE_APPLICATION_CREDENTIALS;

const sheetsAuth = new google.auth.GoogleAuth({
  keyFile: serviceAccountKeyPath,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

async function importar_receitas_js_getSheets() {
  const authClient = await sheetsAuth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Função principal de importação
exports.importarReceitasDaPlanilha = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Você precisa estar autenticado para executar esta operação."
    );
  }

  // !!! ATENÇÃO: Substitua pelo ID da sua planilha !!!
  const SPREADSHEET_ID = "1CFbP6_VC4TOJXITwO-nvxu6IX1brAYJNUCaRW0VDXDY"; 
  const SHEET_NAME = "Receitas";

  const sheets = await importar_receitas_js_getSheets();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:H`, // Lendo da coluna A até a H
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.log("Nenhum dado encontrado na planilha de receitas.");
      return { success: true, message: "Nenhum dado encontrado na planilha de receitas." };
    }

    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    // Mapeamento das colunas com base na sua imagem
    const columnIndex = {
      produto: headerRow.indexOf("Produto"),
      insumo: headerRow.indexOf("Insumos"),
      quantidade: headerRow.indexOf("Quantidade"),
      rendimentoKg: headerRow.indexOf("Rendimento KG"),
      rendimentoUn: headerRow.indexOf("Rendimento UN"),
    };

    // Validação das colunas
    for (const key in columnIndex) {
      if (columnIndex[key] === -1) {
        throw new functions.https.HttpsError(
          "internal",
          `A coluna obrigatória "${key}" não foi encontrada na planilha de receitas.`
        );
      }
    }

    const receitasAgrupadas = {};
    let receitaAtual = null;

    // Agrupando os insumos por receita
    dataRows.forEach(row => {
      const nomeReceita = row[columnIndex.produto] ? String(row[columnIndex.produto]).trim() : null;
      const nomeInsumo = row[columnIndex.insumo] ? String(row[columnIndex.insumo]).trim() : null;

      if (nomeReceita) {
        receitaAtual = nomeReceita;
        if (!receitasAgrupadas[receitaAtual]) {
          const rendimentoKg = parseFloat(String(row[columnIndex.rendimentoKg] || '0').replace(",", ".")) || 0;
          const rendimentoUn = parseFloat(String(row[columnIndex.rendimentoUn] || '0').replace(",", ".")) || 0;
          
          receitasAgrupadas[receitaAtual] = {
            nome: receitaAtual,
            rendimentoKg: rendimentoKg,
            rendimentoUn: rendimentoUn,
            insumos: []
          };
        }
      }

      if (receitaAtual && nomeInsumo) {
        const quantidadeStr = String(row[columnIndex.quantidade] || '0').replace(",", ".");
        const quantidade = parseFloat(quantidadeStr) || 0;

        if (quantidade > 0) {
          // Cria uma referência ao documento do insumo no Firestore
          const docIdInsumo = nomeInsumo.toLowerCase().replace(/\//g, "-");
          const insumoRef = db.collection("insumos").doc(docIdInsumo);

          receitasAgrupadas[receitaAtual].insumos.push({
            nome: nomeInsumo,
            quantidade: quantidade,
            insumoRef: insumoRef
          });
        }
      }
    });
    
    // Preparando para salvar os dados no Firestore
    const batch = db.batch();
    let receitasProcessadas = 0;

    for (const nomeReceita in receitasAgrupadas) {
      const receitaData = receitasAgrupadas[nomeReceita];
      
      // Garante que a receita tenha insumos antes de salvar
      if (receitaData.insumos.length > 0) {
        const docIdReceita = nomeReceita.trim().toLowerCase().replace(/\//g, "-");
        
        if (docIdReceita) {
          const docRef = db.collection("receitas").doc(docIdReceita);
          batch.set(docRef, receitaData, { merge: true });
          receitasProcessadas++;
        }
      }
    }

    await batch.commit();

    const message = `${receitasProcessadas} receitas foram importadas ou atualizadas com sucesso.`;
    console.log(message);
    return { success: true, message: message };

  } catch (error) {
    console.error("Erro ao processar a planilha de receitas:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Ocorreu um erro ao ler a planilha e salvar as receitas.",
      error.message
    );
  }
});