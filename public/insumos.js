// public/insumos.js

// CORREÇÃO: Usamos 'var' e verificamos se a variável já existe para evitar o erro de re-declaração.
var public_insumos_insumosData = window.public_insumos_insumosData || [];

function public_insumos_renderizarPaginaInsumos() {
    const appContainer = document.getElementById("app");
    appContainer.innerHTML = `
    <header class="mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div class="flex-1">
        <h2 class="text-3xl font-bold text-gray-900">Insumos</h2>
        <p class="text-gray-600 mt-1">Veja e atualize os preços dos seus insumos.</p>
        </div>
        <div class="flex-none text-right">
        <button id="btn-atualizar-precos" class="px-5 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold transition">Atualizar Preços da Planilha</button>
        <p class="text-xs text-gray-500 mt-2">Última verificação: <span id="ultima-verificacao-data">--</span></p>
        </div>
    </header>
    <div class="mb-4"><input type="text" id="insumos-search-input" placeholder="Buscar por nome, unidade, preço..." class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" onkeyup="public_insumos_filtrarInsumos()"></div>
    <div class="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden">
        <div class="overflow-y-auto" style="max-height: calc(100vh - 280px);">
        <table class="min-w-full text-left">
            <thead class="bg-[color:var(--azul-50)] text-gray-700 sticky top-0">
            <tr>
                <th class="px-5 py-3">Nome do Insumo</th>
                <th class="px-5 py-3">Unidade</th>
                <th class="px-5 py-3">Preço</th>
                <th class="px-5 py-3">Data da Cotação</th>
            </tr>
            </thead>
            <tbody id="insumos-table-body" class="divide-y divide-gray-100"></tbody>
        </table>
        </div>
    </div>`;
    document.getElementById("btn-atualizar-precos").addEventListener('click', public_insumos_chamarFuncaoAtualizarPrecos);
    public_insumos_carregarInsumos();
    public_insumos_carregarUltimaAtualizacaoGeral();
}

function public_insumos_filtrarInsumos() {
    const termoBusca = document.getElementById('insumos-search-input').value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const tableBody = document.getElementById("insumos-table-body");
    const insumosFiltrados = public_insumos_insumosData.filter(insumo => {
        const nome = insumo.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const unidade = insumo.unidade.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const preco = insumo.preco.toString().toLowerCase().replace(",", ".");
        const dataCotacao = insumo.dataCotacao ? insumo.dataCotacao.toDate().toLocaleDateString('pt-BR') : '';
        return nome.includes(termoBusca) || unidade.includes(termoBusca) || preco.includes(termoBusca) || dataCotacao.includes(termoBusca);
    });
    if (insumosFiltrados.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-gray-500">Nenhum insumo encontrado para a busca "${document.getElementById('insumos-search-input').value}".</td></tr>`;
        return;
    }
    let html = '';
    insumosFiltrados.forEach(insumo => {
        const precoFormatado = insumo.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        let dataCotacaoFormatada = 'N/A';
        if (insumo.dataCotacao) {
            dataCotacaoFormatada = new Date(insumo.dataCotacao.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        html += `<tr class="hover:bg-gray-50"><td class="px-5 py-3 font-medium text-gray-800">${insumo.nome}</td><td class="px-5 py-3">${insumo.unidade}</td><td class="px-5 py-3">${precoFormatado}</td><td class="px-5 py-3 text-sm text-gray-600">${dataCotacaoFormatada}</td></tr>`;
    });
    tableBody.innerHTML = html;
}

function public_insumos_carregarUltimaAtualizacaoGeral() {
    const dataElement = document.getElementById("ultima-verificacao-data");
    db.collection("metadata").doc("insumos").onSnapshot(doc => {
    if (doc.exists && doc.data().ultimaAtualizacaoGeral) {
        dataElement.textContent = new Date(doc.data().ultimaAtualizacaoGeral.seconds * 1000).toLocaleString('pt-BR');
    } else { dataElement.textContent = "Nunca executado"; }
    }, error => {
    console.error("Erro ao carregar metadados:", error);
    dataElement.textContent = "Erro ao carregar";
    });
}

function public_insumos_carregarInsumos() {
    const tableBody = document.getElementById("insumos-table-body");
    db.collection("insumos").orderBy("nome").onSnapshot(querySnapshot => {
    public_insumos_insumosData = [];
    if (querySnapshot.empty) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-gray-500">Nenhum insumo encontrado.</td></tr>`;
        return;
    }
    querySnapshot.forEach(doc => { public_insumos_insumosData.push(doc.data()); });
    public_insumos_filtrarInsumos();
    }, error => {
    console.error("Erro ao carregar insumos: ", error);
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-red-500">Ocorreu um erro ao carregar os insumos.</td></tr>`;
    });
}

async function public_insumos_chamarFuncaoAtualizarPrecos() {
    const botao = document.getElementById('btn-atualizar-precos');
    const textoOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = 'Atualizando...';
    botao.classList.add('opacity-50', 'cursor-not-allowed');
    try {
    const resultado = await functions.httpsCallable('atualizarPrecosDaPlanilha')();
    alert(`Sucesso! ${resultado.data.message}`);
    } catch (error) {
    console.error("Erro ao chamar a função:", error);
    alert(`Erro: ${error.message}`);
    } finally {
    botao.disabled = false;
    botao.innerHTML = textoOriginal;
    botao.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// Chuta a renderização inicial da página
public_insumos_renderizarPaginaInsumos();