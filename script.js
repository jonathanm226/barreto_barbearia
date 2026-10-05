// === CONFIGURAÇÃO DO SUPABASE ===
const SUPABASE_URL = "https://doecoosuqibzdsyadsyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-30z4xAhwJPYmy1bfSEjCw_loKUe8uL";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variáveis de Estado do Painel
let usuarioLogado = null;
let perfilLogado = null;
let dataAtualGrade = new Date();
let selectedBarber = "Matheus";

// Senhas padrão para acesso rápido e seguro ao painel
const senhasMaster = {
    "Matheus": "1234",
    "Yann": "1234",
    "Rafael": "1234",
    "Admin": "admin123"
};

// === FUNÇÃO DE LOGIN CORRIGIDA E DEPURADA ===
async function fazerLogin() {
    const inputUsuario = document.getElementById("login-usuario");
    const inputSenha = document.getElementById("login-senha");

    if (!inputUsuario || !inputSenha) {
        alert("Erro crítico: Os campos de login não foram encontrados no HTML.");
        return;
    }

    const usuarioInput = inputUsuario.value.trim();
    const senhaInput = inputSenha.value.trim();

    if (!usuarioInput || !senhaInput) {
        alert("Por favor, preencha o usuário e a senha.");
        return;
    }

    const nomeFormatado = usuarioInput.charAt(0).toUpperCase() + usuarioInput.slice(1).toLowerCase();
    
    let autorizado = false;
    
    // Validação pelas credenciais padrão
    if (senhasMaster[nomeFormatado] && senhasMaster[nomeFormatado] === senhaInput) {
        autorizado = true;
    } else if (usuarioInput.toLowerCase() === "admin" && senhaInput === "admin123") {
        autorizado = true;
    }

    // Validação opcional caso exista tabela no Supabase
    if (!autorizado) {
        try {
            const { data, error } = await _supabase
                .from("barbeiros_senhas")
                .select("*")
                .eq("usuario", usuarioInput)
                .eq("senha", senhaInput)
                .single();
            
            if (data && !error) {
                autorizado = true;
            }
        } catch (e) {
            console.log("Aviso: Tabela personalizada não consultada, utilizando validação padrão.");
        }
    }

    if (!autorizado) {
        alert("Usuário ou senha inválidos! Verifique se digitou corretamente.");
        return;
    }

    usuarioLogado = nomeFormatado;
    
    const secLogin = document.getElementById("login-section");
    const secDash = document.getElementById("dashboard-barbeiro");

    if (secLogin) secLogin.style.display = "none";
    if (secDash) secDash.style.display = "block";

    const tituloAgenda = document.getElementById("titulo-agenda-barbeiro");
    if (tituloAgenda) {
        tituloAgenda.textContent = usuarioInput.toLowerCase() === "admin" ? "Agenda Geral (Admin)" : `Agenda - ${nomeFormatado}`;
    }

    if (usuarioInput.toLowerCase() === "admin") {
        perfilLogado = "admin";
        selectedBarber = "Matheus";
    } else {
        perfilLogado = "barbeiro";
        selectedBarber = nomeFormatado;
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

    container.innerHTML = "<div style='grid-column: span 6; text-align:center; padding: 20px;'>A carregar agenda...</div>";

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
                <span style="font-size:0.65rem; color:#888; text-align:center;">A procurar...</span>
            </div>
        `;
        container.appendChild(coluna);

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
