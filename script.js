// ==========================================
// CONFIGURAÇÕES INICIAIS E SUPABASE
// ==========================================
const SUPABASE_URL = "https://doecoosuqibzdsyadsyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-30z4xAhwJPYmy1bfSEjCw_loKUe8uL";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DIAS_ANTECEDENCIA_MAX = 21;
const telefonesBarbeiros = { 
    "Matheus": "5531997193193", 
    "Yann": "5531993789798", 
    "Rafael": "5531975470879" 
};

let duracoesServicos = {}; 
let selectedBarber = "Matheus";
let selectedServices = [];
let horarioSelecionado = null;
let enviandoAgendamento = false;

// ==========================================
// INICIALIZAÇÃO DA PÁGINA (DOM)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const dateInput = document.getElementById("date");
    
    if (dateInput) {
        const hoje = new Date();
        const maximo = new Date();
        maximo.setDate(hoje.getDate() + DIAS_ANTECEDENCIA_MAX);
        
        dateInput.min = isoLocal(hoje);
        dateInput.max = isoLocal(maximo);
        dateInput.value = isoLocal(hoje);
        
        // Garante que a atualização ocorra independentemente do navegador/celular
        dateInput.addEventListener('change', checkAvailableTimes);
        dateInput.addEventListener('input', checkAvailableTimes);
    }
    
    // 1º Puxa os serviços dinâmicos do banco
    await carregarServicosDoBanco();
    
    // 2º Garante que os horários carregam imediatamente ao abrir a tela
    await checkAvailableTimes();
});

async function carregarServicosDoBanco() {
    const grid = document.getElementById("dynamic-services-grid");
    if (!grid) return;

    try {
        const { data, error } = await _supabase.from('servicos_config').select('*').order('nome');
        if (error) throw error;

        grid.innerHTML = ""; 

        if (!data || data.length === 0) {
            grid.innerHTML = "<p style='color: #888; font-size: 0.85rem; grid-column: span 2; text-align: center;'>Nenhum serviço disponível no momento.</p>";
            return;
        }

        data.forEach(servico => {
            duracoesServicos[servico.nome] = servico.duracao;

            let horas = Math.floor(servico.duracao / 60);
            let minutos = servico.duracao % 60;
            let tempoFormatado = horas > 0 
                ? `${horas > 9 ? horas : '0'+horas}h${minutos > 0 ? minutos : ''}` 
                : `${minutos} min`;

            const card = document.createElement("div");
            card.className = "service-card";
            card.onclick = () => toggleService(card, servico.nome, servico.preco);
            
            card.innerHTML = `
                <div class="service-info">
                    <h3><i class="fa-regular fa-square checkbox-icon"></i> ${servico.nome}</h3>
                    <span>${tempoFormatado}</span>
                </div>
                <span class="price">R$ ${servico.preco.toFixed(2).replace(".", ",")}</span>
            `;
            
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = "<p style='color: #e74c3c; font-size: 0.85rem; grid-column: span 2; text-align: center;'>Erro ao carregar serviços.</p>";
    }
}

// ==========================================
// INTERAÇÕES DE UI E MODAIS
// ==========================================
function mostrarAlertaCliente(mensagem, sucesso = true) {
    let modalAlerta = document.getElementById("modal-alerta-cliente");
    if (!modalAlerta) {
        const div = document.createElement("div");
        div.id = "modal-alerta-cliente";
        div.className = "custom-modal-overlay";
        div.style.zIndex = "10000";
        div.innerHTML = `
            <div class="custom-modal" style="max-width: 320px;">
                <h3 id="alerta-cliente-titulo" style="margin-bottom: 12px; font-size: 1.1rem;">Aviso</h3>
                <p id="alerta-cliente-mensagem" style="color: #FFF; font-size: 0.95rem; margin-bottom: 20px; text-align: center;"></p>
                <button type="button" class="custom-modal-btn btn-modal-confirmar" onclick="fecharAlertaCliente()">OK</button>
            </div>
        `;
        document.body.appendChild(div);
        modalAlerta = div;
    }

    const tituloEl = document.getElementById("alerta-cliente-titulo");
    tituloEl.textContent = sucesso ? "Sucesso!" : "Aviso!";
    tituloEl.style.color = sucesso ? "#25D366" : "#FF6600";
    document.getElementById("alerta-cliente-mensagem").textContent = mensagem;
    modalAlerta.classList.add("active");
}

function fecharAlertaCliente() {
    const modalAlerta = document.getElementById("modal-alerta-cliente");
    if (modalAlerta) modalAlerta.classList.remove("active");
}

function selectBarber(element, barberName) {
    if (!element) return;
    document.querySelectorAll(".barber-card").forEach(card => card.classList.remove("active"));
    element.classList.add("active");
    selectedBarber = barberName.trim();
    checkAvailableTimes();
}

function toggleService(element, serviceName, price) {
    if (!element) return;
    const icon = element.querySelector(".checkbox-icon");
    const index = selectedServices.findIndex(s => s.name === serviceName);
    const duration = duracoesServicos[serviceName] || 30;

    if (index > -1) {
        selectedServices.splice(index, 1);
        element.classList.remove("active");
        if (icon) { 
            icon.classList.remove("fa-solid", "fa-square-check"); 
            icon.classList.add("fa-regular", "fa-square"); 
        }
    } else {
        selectedServices.push({ name: serviceName, price: price, duration: duration });
        element.classList.add("active");
        if (icon) { 
            icon.classList.remove("fa-regular", "fa-square"); 
            icon.classList.add("fa-solid", "fa-square-check"); 
        }
    }
    checkAvailableTimes();
}

// ==========================================
// FUNÇÕES AUXILIARES DE TEMPO
// ==========================================
function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Normaliza qualquer formato de data do input para YYYY-MM-DD
function padronizarData(valorInput) {
    if (!valorInput) return "";
    if (valorInput.includes("-")) return valorInput; 
    if (valorInput.includes("/")) {
        const partes = valorInput.split("/");
        if (partes.length === 3) {
            return `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
    }
    return valorInput;
}

function toMin(hhmm) {
    if(!hhmm) return 0;
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
}

function fromMin(min) {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function calcularTotal() {
    return selectedServices.reduce((acc, s) => acc + s.price, 0);
}

function diaDaSemana(dateString) {
    if (!dateString) return -1;
    const partes = dateString.split("-");
    if (partes.length !== 3) return -1;
    const [y, m, d] = partes.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return date.getUTCDay();
}

function mostrarMensagemNoGrid(timesGrid, texto, erro = false) {
    // A propriedade grid-column: 1 / -1 garante que a mensagem ocupe todo o espaço e não fique "espremida"
    timesGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 15px; color: ${erro ? '#e74c3c' : '#aaa'}; font-size: 0.95rem; font-weight: 500;">${texto}</div>`;
}

// ==========================================
// LÓGICA CORE: VERIFICAÇÃO DE HORÁRIOS
// ==========================================
function getTimesForDate(dateString, barbeiro) {
    if (!dateString || !barbeiro) return [];
    const diaSem = diaDaSemana(dateString); 
    const barbTrim = barbeiro.trim();
    
    if (diaSem === 0) return []; 
    if (barbTrim === "Matheus" && diaSem === 3) return []; 
    if ((barbTrim === "Yann" || barbTrim === "Rafael") && diaSem === 1) return []; 

    let horarios = [];
    let horaInicio = 8;
    let horaFim = 22;
    let currentMin = horaInicio * 60;
    let endMin = horaFim * 60;
    
    while (currentMin <= endMin) {
        const horaStr = fromMin(currentMin);
        horarios.push({ valor: horaStr, texto: horaStr });
        currentMin += 30;
    }
    return horarios;
}

async function checkAvailableTimes() {
    const dateEl = document.getElementById("date");
    const timesGrid = document.getElementById("times-grid");

    if (!dateEl || !timesGrid) return;
    
    const selDate = padronizarData(dateEl.value); 
    if (!selDate) {
        mostrarMensagemNoGrid(timesGrid, "Por favor, selecione uma data válida.");
        return;
    }

    const allSlots = getTimesForDate(selDate, selectedBarber);
    if (allSlots.length === 0) {
        mostrarMensagemNoGrid(timesGrid, "O profissional não atende neste dia da semana.", true);
        return;
    }

    const durationMin = selectedServices.reduce((acc, s) => acc + s.duration, 0) || 30;
    const slotsNeeded = Math.ceil(durationMin / 30);
    
    mostrarMensagemNoGrid(timesGrid, '<i class="fa-solid fa-spinner fa-spin"></i> A buscar horários...');
    horarioSelecionado = null;

    try {
        const { data: agsDB, error: errAgs } = await _supabase.from("agendamentos_barreto_v2")
            .select("horario, servico, status, data, barbeiro");

        const agendamentos = (agsDB || []).filter(a => {
            if (!a.data || !a.barbeiro || !a.horario) return false;
            const dataBanco = String(a.data).substring(0, 10);
            const mesmoBarbeiro = a.barbeiro.trim().toLowerCase() === selectedBarber.trim().toLowerCase();
            const ativo = a.status !== 'cancelado';
            return dataBanco === selDate && mesmoBarbeiro && ativo;
        });

        const { data: bloqueiosDB, error: errBlq } = await _supabase.from("bloqueios_barreto_v2")
            .select("horario, data, barbeiro");

        const bloqueios = (bloqueiosDB || []).filter(b => {
            if (!b.data || !b.barbeiro) return false;
            const dataBanco = String(b.data).substring(0, 10);
            const mesmoBarbeiro = b.barbeiro.trim().toLowerCase() === selectedBarber.trim().toLowerCase();
            return dataBanco === selDate && mesmoBarbeiro;
        });

        if (bloqueios.some(b => b.horario === "TODOS")) {
            mostrarMensagemNoGrid(timesGrid, "Agenda fechada neste dia.", true);
            return;
        }

        const ocupados = new Set();
        agendamentos.forEach(a => {
            if (a.servico && a.servico.includes("[ENCAIXE]")) return;

            const horaFormatada = String(a.horario).substring(0, 5); 
            const inicio = toMin(horaFormatada);
            let dur = 30;
            if (a.servico) {
                dur = 0;
                a.servico.split(",").forEach(s => dur += duracoesServicos[s.trim()] || 30);
            }
            const numSlots = Math.max(1, Math.ceil(dur / 30));
            for (let k = 0; k < numSlots; k++) {
                ocupados.add(inicio + (30 * k));
            }
        });

        const bloqueiosAlmocoAutomaticos = {
            "Rafael": ["13:00", "13:30"],
            "Yann": ["12:00", "12:30", "13:00"],
            "Matheus": ["13:30", "14:00", "14:30"]
        };
        const almocoPadrao = bloqueiosAlmocoAutomaticos[selectedBarber.trim()] || [];

        const bloqueados = new Set(bloqueios.filter(b => !String(b.horario).includes("_LIBERADO")).map(b => toMin(String(b.horario).substring(0, 5))));
        const liberadosMinSet = new Set(bloqueios.filter(b => String(b.horario).includes("_LIBERADO")).map(b => toMin(String(b.horario).replace("_LIBERADO", "").substring(0, 5))));
        
        almocoPadrao.forEach(h => {
            const minH = toMin(h);
            if (!liberadosMinSet.has(minH)) {
                bloqueados.add(minH);
            }
        });

        const gradeBase = new Set(allSlots.map(s => toMin(s.valor)));

        const agora = new Date();
        const hojeIso = isoLocal(agora);
        const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

        timesGrid.innerHTML = "";
        const isSabado = diaDaSemana(selDate) === 6;
        let temAlgumLivre = false;

        allSlots.forEach(slot => {
            const inicio = toMin(slot.valor);
            let conflito = false;
            let expirado = false;

            if (selDate === hojeIso && inicio < minutosAtuais) {
                expirado = true;
            }

            for (let i = 0; i < slotsNeeded; i++) {
                const s = inicio + (30 * i);
                const [hCheck] = fromMin(s).split(":").map(Number);
                const eh18Check = hCheck >= 18;
                const bloqueadoCheck18 = eh18Check && isSabado && !liberadosMinSet.has(s);

                if (!gradeBase.has(s) || ocupados.has(s) || bloqueados.has(s) || bloqueadoCheck18) { 
                    conflito = true; 
                    break; 
                }
            }

            const card = document.createElement("div");
            card.className = "time-card";
            card.textContent = slot.valor;

            if (conflito || expirado) {
                card.classList.add("disabled");
            } else {
                card.onclick = () => selecionarHorarioCard(card, slot.valor);
                temAlgumLivre = true;
            }

            timesGrid.appendChild(card);
        });

        if (!temAlgumLivre && timesGrid.innerHTML !== "") {
            // Se todos os botões ficaram desativados
            const aviso = document.createElement("div");
            aviso.style.cssText = "grid-column: 1 / -1; text-align: center; color: #e74c3c; font-size: 0.85rem; margin-top: 10px;";
            aviso.textContent = "Não há horários suficientes para os serviços selecionados.";
            timesGrid.appendChild(aviso);
        }

    } catch (err) {
        mostrarMensagemNoGrid(timesGrid, "Erro ao carregar horários. Tente novamente.", true);
        console.error(err);
    }
}

function selecionarHorarioCard(element, horario) {
    document.querySelectorAll('.time-card').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    horarioSelecionado = horario;
}

// ==========================================
// SUBMISSÃO E WHATSAPP
// ==========================================
function abrirModalConfirmacao() {
    const name = document.getElementById("client-name")?.value.trim();
    const phone = document.getElementById("client-phone")?.value.trim();
    const date = padronizarData(document.getElementById("date")?.value);

    if (!name || !phone || phone.replace(/\D/g,"").length < 10) {
        mostrarAlertaCliente("Preencha o seu nome e um WhatsApp válido.", false);
        return;
    }
    if (selectedServices.length === 0) {
        mostrarAlertaCliente("Selecione um serviço.", false);
        return;
    }
    if (!horarioSelecionado) {
        mostrarAlertaCliente("Por favor, selecione um horário válido e livre.", false);
        return;
    }

    const preco = calcularTotal();
    const servNomes = selectedServices.map(s => s.name);

    document.getElementById("resumo-agendamento").innerHTML = `
        <div style="margin-bottom: 8px;"><strong>Barbeiro:</strong> ${selectedBarber}</div>
        <div style="margin-bottom: 8px;"><strong>Data:</strong> ${date.split("-").reverse().join("/")} às ${horarioSelecionado}</div>
        <div style="margin-bottom: 8px;"><strong>Serviços:</strong> ${servNomes.join(", ")}</div>
        <div style="margin-top: 12px; border-top: 1px solid #333333; padding-top: 8px; font-size: 1.1rem;">
            <strong>Total Estimado:</strong> <span style="color: #FF6600; font-weight: bold;">R$ ${preco.toFixed(2).replace(".", ",")}</span>
        </div>
    `;
    document.getElementById("modal-confirmacao").style.display = "flex";
}

function fecharModalConfirmacao() { 
    document.getElementById("modal-confirmacao").style.display = "none"; 
}

async function confirmarEEnviar() {
    if (enviandoAgendamento) return;
    const btn = document.getElementById("btn-continuar");
    enviandoAgendamento = true; 
    btn.disabled = true; 
    btn.innerHTML = 'A agendar...';

    const name = document.getElementById("client-name").value;
    const phone = document.getElementById("client-phone").value.replace(/\D/g, "");
    const date = padronizarData(document.getElementById("date").value);
    const time = horarioSelecionado;

    try {
        const precoTotal = calcularTotal();
        const servicosNome = selectedServices.map(s => s.name).join(", ");
        const barbeiroLimpo = selectedBarber.trim();

        const { error: insertError } = await _supabase.from("agendamentos_barreto_v2").insert([{
            cliente: name,
            telefone: phone,
            barbeiro: barbeiroLimpo,
            servico: servicosNome,
            preco_total: precoTotal,
            data: date,
            horario: time,
            status: 'ativo'
        }]);

        if (insertError) {
            if (insertError.code === '23505') {
                throw new Error("Este horário acabou de ser reservado por outra pessoa. Atualize a página e escolha outro horário.");
            }
            throw new Error(insertError.message);
        }

        fecharModalConfirmacao();
        const num = telefonesBarbeiros[barbeiroLimpo] || "5531997193193";
        const msg = `✅ *AGENDAMENTO CONFIRMADO* ✅\n\n👤 *Cliente:* ${name}\n📱 *Telefone:* ${phone}\n💈 *Barbeiro:* ${barbeiroLimpo}\n✂️ *Serviços:* ${servicosNome}\n📅 *Data:* ${date.split("-").reverse().join("/")}\n⏰ *Horário:* ${time}`;
        
        window.location.href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;

    } catch (err) {
        mostrarAlertaCliente("Aviso: " + err.message, false);
        enviandoAgendamento = false; 
        btn.disabled = false; 
        btn.innerHTML = 'Continuar Agendamento <i class="fa-solid fa-arrow-right"></i>';
    }
}

async function buscarClientePorTelefone() {
    const tel = document.getElementById("client-phone").value.replace(/\D/g, "");
    if (tel.length < 10) return;
    const { data } = await _supabase.from("agendamentos_barreto_v2")
        .select("cliente")
        .eq("telefone", tel)
        .limit(1)
        .maybeSingle();
        
    if (data && !document.getElementById("client-name").value) {
        document.getElementById("client-name").value = data.cliente;
    }
}
