// === CONFIGURAÇÃO DO SUPABASE ===
const SUPABASE_URL = "https://doecoosuqibzdsyadsyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-30z4xAhwJPYmy1bfSEjCw_loKUe8uL";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variáveis de Estado do Painel
let usuarioLogado = null;
let perfilLogado = null; // 'barbeiro' ou 'admin'
let dataAtualGrade = new Date();

// Mapeamento de senhas padrão para acesso rápido (caso não use tabela dedicada)
const senhasMaster = {
    "Matheus": "1234",
    "Yann": "1234",
    "Rafael": "1234",
    "admin": "admin123"
};

// === FUNÇÃO DE LOGIN ===
async function fazerLogin() {
    const usuarioInput = document.getElementById("login-usuario").value.trim();
    const senhaInput = document.getElementById("login-senha").value.trim();

    if (!usuarioInput || !senhaInput) {
        alert("Por favor, preencha o usuário e a senha.");
        return;
    }

    const nomeFormatado = usuarioInput.charAt(0).toUpperCase() + usuarioInput.slice(1).toLowerCase();
    
    // Validação básica local de acesso ou via tabela do Supabase
    let autorizado = false;
    if (senhasMaster[nomeFormatado] && senhasMaster[nomeFormatado] === senhaInput) {
        autorizado = true;
    } else if (usuarioInput.toLowerCase() === "admin" && senhaInput === "admin123") {
        autorizado = true;
    }

    if (!autorizado) {
        // Tenta validar em tabela do banco caso exista
        try {
            const { data, error } = await _supabase
                .from("barbeiros_senhas")
                .select("*")
                .eq("usuario", usuarioInput)
                .eq("senha", senhaInput)
                .single();
            if (data && !error) autorizado = true;
        } catch (e) {
            console.warn("Tabela de senhas personalizada não encontrada, usando validação padrão.");
        }
    }

    if (!autorizado) {
        alert("Usuário ou senha inválidos.");
        return;
    }

    usuarioLogado = nomeFormatado;
    document.getElementById("login-section").style.display = "none";

    if (usuarioInput.toLowerCase() === "admin") {
        perfilLogado = "admin";
        selectedBarber = "Matheus";
        document.getElementById("dashboard-barbeiro").style.display = "block";
        document.getElementById("titulo-agenda-barbeiro").textContent = "Agenda Geral (Admin)";
    } else {
        perfilLogado = "barbeiro";
        selectedBarber = nomeFormatado;
        document.getElementById("dashboard-barbeiro").style.display = "block";
        document.getElementById("titulo-agenda-barbeiro").textContent = `Agenda - ${nomeFormatado}`;
    }

    carregarAgendaSemanal();
    carregarFaturamentoBarbeiro();
}

function fazerLogout() {
    usuarioLogado = null;
    perfilLogado = null;
    document.getElementById("login-usuario").value = "";
    document.getElementById("login-senha").value = "";
    document.getElementById("dashboard-barbeiro").style.display = "none";
    document.getElementById("login-section").style.display = "flex";
}

// === FUNÇÕES DA GRADE E FATURAMENTO ===
function mudarSemana(direcao) {
    dataAtualGrade.setDate(dataAtualGrade.getDate() + (direcao * 7));
    carregarAgendaSemanal();
}

async function carregarAgendaSemanal() {
    const container = document.getElementById("grade-semanal-container");
    const labelPeriodo = document.getElementById("label-periodo-semana");
    if (!container) return;

    container.innerHTML = "<div style='grid-column: span 6; text-align:center; padding: 20px;'>Carregando agenda...</div>";

    // Calcula início da semana (Segunda-feira)
    const d = new Date(dataAtualGrade);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const segunda = new Date(d.setDate(diff));
    const sabado = new Date(segunda);
    sabado.setDate(segunda.getDate() + 5);

    if (labelPeriodo) {
        labelPeriodo.textContent = `${segunda.toLocaleDateString('pt-BR')} até ${sabado.toLocaleDateString('pt-BR')}`;
    }

    container.innerHTML = "";

    // Renderiza colunas de Segunda a Sábado
    for (let i = 0; i < 6; i++) {
        const diaAtual = new Date(segunda);
        diaAtual.setDate(segunda.getDate() + i);
        const dataIso = diaAtual.toISOString().split("T")[0];

        const coluna = document.createElement("div");
        coluna.className = "day-column";
        coluna.innerHTML = `
            <div class="day-header">
                <span>${diaAtual.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase()}</span>
                <span>${diaAtual.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;" id="slots-${dataIso}">
                <span style="font-size:0.65rem; color:#888; text-align:center;">Buscando...</span>
            </div>
        `;
        container.appendChild(coluna);

        // Busca agendamentos do dia para o barbeiro selecionado
        try {
            const { data: agendamentos } = await _supabase
                .rpc("horarios_ocupados", { p_barbeiro: selectedBarber, p_data: dataIso });

            const slotDiv = document.getElementById(`slots-${dataIso}`);
            if (slotDiv) {
                slotDiv.innerHTML = "";
                if (!agendamentos || agendamentos.length === 0) {
                    slotDiv.innerHTML = `<div style="font-size:0.6rem; color:#666; text-align:center; padding: 4px;">Livre</div>`;
                } else {
                    agendamentos.forEach(ag => {
                        const item = document.createElement("div");
                        item.className = "slot-item booked";
                        item.innerHTML = `<strong>${ag.horario}</strong><span>${ag.cliente || 'Cliente'}</span>`;
                        slotDiv.appendChild(item);
                    });
                }
            }
        } catch (err) {
            console.error("Erro ao carregar grade:", err);
        }
    }
}

async function carregarFaturamentoBarbeiro() {
    const qtdEl = document.getElementById("barber-resumo-qtd");
    const totalEl = document.getElementById("barber-resumo-total");
    if (!qtdEl || !totalEl) return;

    qtdEl.textContent = "0";
    totalEl.textContent = "R$ 0,00";

    try {
        // Consulta simulada ou direta ao banco de agendamentos concluídos
        const { data, error } = await _supabase
            .from("agendamentos_barreto")
            .select("*")
            .eq("barbeiro", selectedBarber);

        if (error) throw error;

        if (data) {
            qtdEl.textContent = data.length;
            const total = data.reduce((acc, curr) => acc + (Number(curr.preco) || 35.00), 0);
            totalEl.textContent = "R$ " + total.toFixed(2).replace(".", ",");
        }
    } catch (err) {
        console.error("Erro ao carregar faturamento:", err);
    }
}
