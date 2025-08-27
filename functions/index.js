// functions/index.js

// Importação dos módulos necessários
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

// Inicializa o Firebase Admin SDK para que a função possa acessar o Firestore
admin.initializeApp();

// Constante para acessar o banco de dados Firestore
const db = admin.firestore();

/**
 * Função HTTP "Callable" que pode ser chamada diretamente do seu app web.
 * Ela lê uma planilha do Google Sheets e atualiza a coleção 'insumos' no Firestore.
 */
exports.functions_index_atualizarPrecosDaPlanilha = functions.https.onCall(async (data, context) => {
  // 1. VERIFICAÇÃO DE AUTENTICAÇÃO
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Você precisa estar autenticado para executar esta operação."
    );
  }

  // 2. CONFIGURAÇÃO DE ACESSO À PLANILHA
  const SPREADSHEET_ID = "1CFbP6_VC4TOJXITwO-nvxu6IX1brAYJNUCaRW0VDXDY";
  const SHEET_NAME = "Cotacoes";

  // Autentica usando as credenciais padrão do ambiente do Google Cloud Functions
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    // 3. LEITURA DOS DADOS DA PLANILHA (incluindo cabeçalho)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:AB`, // Lê a planilha inteira da coluna A até a AB
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) { // Precisa ter pelo menos cabeçalho e uma linha de dados
      console.log("Nenhum dado encontrado na planilha.");
      return { success: true, message: "Nenhum dado encontrado na planilha." };
    }

    // 4. MAPEAMENTO DOS CABEÇALHOS PARA ÍNDICES DE COLUNA
    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    const columnIndex = {
      produto: headerRow.indexOf("Produto"),
      unidade: headerRow.indexOf("UN"),
      preco: headerRow.indexOf("Preço"),
      comprar: headerRow.indexOf("Comprar"),
      dataAbertura: headerRow.indexOf("Data Abertura"),
    };

    // Validação para garantir que todas as colunas necessárias foram encontradas
    for (const key in columnIndex) {
      if (columnIndex[key] === -1) {
        throw new functions.https.HttpsError(
          "internal",
          `A coluna obrigatória "${key}" não foi encontrada na planilha.`
        );
      }
    }

    // 5. PROCESSAMENTO DOS DADOS
    
    // Filtra apenas as linhas que devem ser compradas
    const itensParaComprar = dataRows.filter(row => {
      const quantidadeComprar = parseFloat(String(row[columnIndex.comprar] || '0').replace(",", ".")) || 0;
      return quantidadeComprar > 0;
    });

    // Agrupa os itens por produto para encontrar a cotação mais recente
    const ultimasCompras = {};
    itensParaComprar.forEach(row => {
      const nomeProduto = row[columnIndex.produto];
      const dataAberturaStr = row[columnIndex.dataAbertura];

      // Ignora linhas sem nome de produto ou data
      if (!nomeProduto || !dataAberturaStr) {
        return;
      }
      
      // Converte data DD/MM/AAAA para um formato comparável (Date object)
      const partesData = dataAberturaStr.split('/');
      const dataAbertura = new Date(partesData[2], partesData[1] - 1, partesData[0]);

      // Se o produto ainda não foi visto ou a data atual é mais recente, atualiza
      if (!ultimasCompras[nomeProduto] || dataAbertura > ultimasCompras[nomeProduto].data) {
        ultimasCompras[nomeProduto] = {
          data: dataAbertura,
          row: row,
        };
      }
    });

    // 6. ATUALIZAÇÃO NO FIRESTORE
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
          // *** LINHA MODIFICADA AQUI ***
          // Substitui o caractere problemático "/" por "-"
          const docId = nome.trim().toLowerCase().replace(/\//g, "-");
          
          if (docId) { 
            const docRef = db.collection("insumos").doc(docId);

            batch.set(docRef, {
              nome: nome.trim(),
              unidade: unidade.trim(),
              preco: preco,
              ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            atualizacoes++;
          }
        }
      }
    }

    // Envia todas as atualizações para o Firestore de uma vez
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