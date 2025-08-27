
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
  // Garante que a requisição venha de um usuário autenticado.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Você precisa estar autenticado para executar esta operação."
    );
  }

  // 2. CONFIGURAÇÃO DE ACESSO À PLANILHA
  // ID da sua planilha. Pegue da URL da planilha (a parte entre /d/ e /edit).
  const SPREADSHEET_ID = "1CFbP6_VC4TOJXITwO-nvxu6IX1brAYJNUCaRW0VDXDY";

  // Nome da aba/página da planilha que contém os dados.
  const SHEET_NAME = "Cotacoes"; // Mude se o nome da sua aba for diferente

  // Autentica usando as credenciais padrão do ambiente do Google Cloud Functions
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    // 3. LEITURA DOS DADOS DA PLANILHA
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:M`, // Lê da coluna A até a C, começando da linha 2
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log("Nenhum dado encontrado na planilha.");
      return { success: true, message: "Nenhum dado encontrado na planilha." };
    }

    // 4. ATUALIZAÇÃO NO FIRESTORE
    // Cria um "batch" para executar todas as operações de uma vez, o que é mais eficiente.
    const batch = db.batch();
    let atualizacoes = 0;

    rows.forEach(row => {
      const [nome, unidade, precoStr] = row;

      // Validação simples dos dados da linha
      if (nome && unidade && precoStr) {
        // Converte o preço para número (removendo "R$" e trocando vírgula por ponto)
        const preco = parseFloat(precoStr.replace("R$", "").trim().replace(",", "."));

        if (!isNaN(preco)) {
          // O ID do documento no Firestore será o nome do insumo em minúsculas
          // Isso evita duplicidade de insumos. Ex: "Farinha" e "farinha"
          const docId = nome.trim().toLowerCase();
          const docRef = db.collection("insumos").doc(docId);

          // Adiciona a operação de atualização ao batch
          batch.set(docRef, {
            nome: nome.trim(),
            unidade: unidade.trim(),
            preco: preco,
            ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true }); // { merge: true } cria o documento se não existir, ou atualiza se já existir

          atualizacoes++;
        }
      }
    });

    // Envia todas as atualizações para o Firestore de uma vez
    await batch.commit();

    const message = `${atualizacoes} insumos foram atualizados com sucesso.`;
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