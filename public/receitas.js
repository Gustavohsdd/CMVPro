// public/receitas.js

// Variável global para armazenar os dados das receitas desta página
let public_receitas_receitasData = {};

function public_receitas_renderizarPaginaReceitas() {
    const appContainer = document.getElementById("app");
    appContainer.innerHTML = `
    <header class="mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
        <h2 class="text-3xl font-bold text-gray-900">Receitas</h2>
        <p class="text-gray-600 mt-1">Clique duas vezes em uma receita para ver os detalhes.</p>
        </div>
        <div class="flex items-center gap-3">
        <button id="btn-importar-receitas" class="px-5 py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 font-semibold transition">Importar Receitas (Uso Único)</button>
        <button class="px-5 py-2.5 rounded-lg bg-[color:var(--azul-600)] text-white hover:opacity-95 font-semibold">Nova Receita</button>
        </div>
    </header>
    <div class="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
        <div class="overflow-y-auto" style="max-height: calc(100vh - 280px);">
        <table class="min-w-full text-left">
            <thead class="bg-[color:var(--azul-50)] text-gray-700 sticky top-0">
            <tr>
                <th class="px-5 py-3">Nome da Receita</th>
                <th class="px-5 py-3">Rendimento (KG)</th>
                <th class="px-5 py-3">Rendimento (UN)</th>
                <th class="px-5 py-3">Perda</th>
            </tr>
            </thead>
            <tbody id="receitas-table-body" class="divide-y divide-gray-100"></tbody>
        </table>
        </div>
    </div>`;
    document.getElementById('btn-importar-receitas').addEventListener('click', public_receitas_chamarFuncaoImportarReceitas);
    public_receitas_carregarReceitas();
}

function public_receitas_carregarReceitas() {
    const tableBody = document.getElementById("receitas-table-body");
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-gray-500">Carregando receitas...</td></tr>`;

    db.collection("receitas").orderBy("nome").onSnapshot(querySnapshot => {
    public_receitas_receitasData = {};
    if (querySnapshot.empty) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-gray-500">Nenhuma receita encontrada.</td></tr>`;
        return;
    }
    
    let html = '';
    querySnapshot.forEach(doc => {
        const receita = doc.data();
        public_receitas_receitasData[doc.id] = receita;
        
        const rendimentoKgFormatado = (receita.rendimentoKg || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 });
        const rendimentoUnFormatado = (receita.rendimentoUn || 0).toLocaleString('pt-BR');
        const perdaFormatada = (receita.perda || 0).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 2 });

        html += `<tr class="hover:bg-gray-50 cursor-pointer" data-doc-id="${doc.id}" ondblclick="public_receitas_abrirModalReceita(this.getAttribute('data-doc-id'))">
                <td class="px-5 py-3 font-medium text-gray-800">${receita.nome}</td>
                <td class="px-5 py-3">${rendimentoKgFormatado}</td>
                <td class="px-5 py-3">${rendimentoUnFormatado}</td>
                <td class="px-5 py-3">${perdaFormatada}</td>
            </tr>`;
    });
    tableBody.innerHTML = html;
    
    }, error => {
        console.error("Erro ao carregar receitas: ", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-red-500">Ocorreu um erro ao carregar as receitas.</td></tr>`;
    });
}

async function public_receitas_abrirModalReceita(docId) {
    const receita = public_receitas_receitasData[docId];
    if (!receita) return;

    document.getElementById('modal-nome-produto').textContent = receita.nome;
    document.getElementById('modal-rendimento-kg').textContent = (receita.rendimentoKg || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 });
    document.getElementById('modal-rendimento-un').textContent = (receita.rendimentoUn || 0).toLocaleString('pt-BR');
    document.getElementById('modal-perda').textContent = (receita.perda || 0).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 2 });
    
    document.getElementById('modal-preco-venda').textContent = 'R$ 0,00';
    document.getElementById('modal-preco-sugerido').textContent = 'R$ 0,00';
    document.getElementById('modal-markup').textContent = '0,00%';
    document.getElementById('modal-cmv').textContent = '0,00%';
    document.getElementById('modal-custo-insumos').textContent = 'R$ 0,00';
    document.getElementById('modal-outros-custos').textContent = 'R$ 0,00';
    document.getElementById('modal-custo-kg').textContent = 'R$ 0,00';
    document.getElementById('modal-custo-un').textContent = 'R$ 0,00';

    const insumosTbody = document.getElementById('modal-insumos-tbody');
    insumosTbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Buscando dados dos insumos...</td></tr>';
    document.getElementById("receita-modal").style.display = 'flex';

    try {
    const promessasInsumos = receita.insumos.map(insumo => insumo.insumoRef.get());
    const snapshotsInsumos = await Promise.all(promessasInsumos);
    
    let insumosHtml = '';
    let custoTotalInsumos = 0;
    
    for (let i = 0; i < snapshotsInsumos.length; i++) {
        const insumoDoc = snapshotsInsumos[i];
        const insumoReceita = receita.insumos[i];
        const insumoData = insumoDoc.exists ? insumoDoc.data() : { preco: 0, nome: insumoReceita.nome + ' (Não encontrado)' };
        
        const precoUnitario = insumoData.preco || 0;
        const valorUsado = insumoReceita.quantidade * precoUnitario;
        custoTotalInsumos += valorUsado;

        insumosHtml += `<tr class="text-gray-700 text-sm">
            <td class="px-4 py-2">${insumoReceita.nome}</td>
            <td class="px-4 py-2">${insumoReceita.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</td>
            <td class="px-4 py-2">${precoUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td class="px-4 py-2 font-semibold">${valorUsado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        </tr>`;
    }
    insumosTbody.innerHTML = insumosHtml;

    document.getElementById('modal-custo-insumos').textContent = custoTotalInsumos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    } catch (error) {
    console.error("Erro ao buscar detalhes dos insumos:", error);
    insumosTbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Erro ao carregar insumos.</td></tr>';
    }
}

function public_receitas_fecharModalReceita() {
    document.getElementById("receita-modal").style.display = 'none';
}

async function public_receitas_chamarFuncaoImportarReceitas() {
    if (!confirm("ATENÇÃO: Esta é uma operação de uso único para importar/atualizar todas as receitas da planilha.\n\nDeseja continuar?")) return;
    const botao = document.getElementById('btn-importar-receitas');
    const textoOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = 'Importando...';
    botao.classList.add('opacity-50', 'cursor-not-allowed');
    try {
    const resultado = await functions.httpsCallable('importarReceitasDaPlanilha')();
    alert(`Sucesso! ${resultado.data.message}`);
    } catch (error) {
    console.error("Erro ao chamar a função de importação de receitas:", error);
    alert(`Erro ao importar: ${error.message}`);
    } finally {
    botao.disabled = false;
    botao.innerHTML = textoOriginal;
    botao.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// Chuta a renderização inicial da página
public_receitas_renderizarPaginaReceitas();