// === CONFIGURAÇÃO DO SUPABASE ===
const SUPABASE_URL = "https://doecoosuqibzdsyadsyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-30z4xAhwJPYmy1bfSEjCw_loKUe8uL";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// === CONFIGURAÇÕES DO NEGÓCIO ===
const DIAS_ANTECEDENCIA_MAX = 21;
const MINUTOS_ANTECEDENCIA_MIN = 30;

// Telefones específicos de cada barbeiro da Barbearia do Barreto
const telefonesBarbeiros = {
    "Matheus": "5531997193193",
    "Yann": "5531993789798",
    "Rafael": "5531975470879"
};

// Durações em minutos (devem ser iguais às da tabela servicos_barreto no SQL)
const duracoesServicos = {
    "Corte": 45,
    "Barba": 10,
    "Barba simples": 10,
    "Bigode simples": 5,
    "Sobrancelha": 25,
    "Hidratação profunda": 25,
    "Relaxamento": 25,
    "Escova": 30,
    "Luzes": 60,
    "Platinado": 60,
    "Botox (selagem)": 60,
    "Coloração": 60,
    "Pigmentação": 40,
    "Pezinho simples": 10,
    "Pezinho Gourmet": 20
};

let selectedBarber = "Matheus";
let selectedServices = [];
let requisicaoHorariosAtual = 0;
let enviandoAgendamento = false;

// === FUNÇÕES AUXILIARES ===

function isoLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
}

function toMin(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
}

function fromMin(min) {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function formatarBRL(valor) {
    return "R$ " + Number(valor).toFixed(2).replace(".", ",");
}

function escapeHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function calcularTotal() {
    // Se houver apenas Corte e for horário emergencial, pode aplicar o valor fixo ou somar
    return selectedServices.reduce((acc, s) => acc + s.price, 0);
}

function diaDaSemana(dateString) {
    const [y, m, d] = dateString.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
}

// === INICIALIZAÇÃO ===

document.addEventListener("DOMContentLoaded", () => {
    const dateInput = document.getElementById("date");
    if (dateInput) {
        const hoje = new Date();
        const maximo = new Date();
        maximo.setDate(hoje.getDate() + DIAS_ANTECEDENCIA_MAX);

        dateInput.min = isoLocal(hoje);
        dateInput.max = isoLocal(maximo);
        dateInput.value = isoLocal(hoje);
    }
    checkAvailableTimes();
});

function selectBarber(element, barberName) {
    document.querySelectorAll(".barber-card").forEach(card => card.classList.remove("active"));
    element.classList.add("active");
    selectedBarber = barberName;
    checkAvailableTimes();
}

function toggleService(element, serviceName, price) {
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

// === HORÁRIOS E REGRAS DA SEMANA ===

function getTimesForDate(dateString, barbeiro) {
    if (!dateString) return [];

    const diaSem = diaDaSemana(dateString); // 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado

    // Domingo: Fechado para todos
    if (diaSem === 0) return [];

    // Validar escala do barbeiro no dia escolhido
    if (barbeiro === "Matheus") {
        if (diaSem === 3) return []; // Quarta-feira o Matheus não atende
    } else if (barbeiro === "Yann" || barbeiro === "Rafael") {
        if (diaSem === 1) return []; // Segunda-feira Yann e Rafael não atendem
    }

    let inicioExpediente = 600;     // 10:00 padrão
    let fimExpedienteNormal = 1200; // 20:00 padrão
    let inicioEmergencia = 1200;    // 20:00 padrão
    let fimExpedienteLimite = 1320; // 22:00 (último horário)

    // Configurações específicas por dia da semana
    if (diaSem === 1) { // Segunda: apenas Matheus 10:00 às 20:00, emergência após 20:00
        inicioExpediente = 600;
        fimExpedienteNormal = 1200;
        inicioEmergencia = 1200;
    } else if (diaSem === 2) { // Terça: todos 10:00 às 20:00, emergência após 20:00
        inicioExpediente = 600;
        fimExpedienteNormal = 1200;
        inicioEmergencia = 1200;
    } else if (diaSem === 3) { // Quarta: apenas Rafael e Yann 10:00 às 20:00, emergência após 20:00
        inicioExpediente = 600;
        fimExpedienteNormal = 1200;
        inicioEmergencia = 1200;
    } else if (diaSem === 4 || diaSem === 5) { // Quinta e Sexta: todos 09:00 às 21:30, emergência a partir de 21:00
        inicioExpediente = 540; // 09:00
        fimExpedienteNormal = 1290; // 21:30
        inicioEmergencia = 1260; // 21:00
    } else if (diaSem === 6) { // Sábado: todos 09:00 às 17:00, emergência a partir de 18:00
        inicioExpediente = 540; // 09:00
        fimExpedienteNormal = 1020; // 17:00
        inicioEmergencia = 1080; // 18:00
    }

    const slots = [];
    for (let m = inicioExpediente; m <= fimExpedienteLimite; m += 30) {
        const horaStr = fromMin(m);
        let textoSlot = horaStr;
        let ehEmergencia = m >= inicioEmergencia;

        if (ehEmergencia) {
            textoSlot = `${horaStr} - (Corte Emergencial: R$ 45,00)`;
        }

        slots.push({ valor: horaStr, texto: textoSlot, ehEmergencia: ehEmergencia });
    }

    return slots;
}

function mostrarMensagemNoSelect(timeSelect, texto) {
    timeSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = texto;
    option.disabled = true;
    option.selected = true;
    timeSelect.appendChild(option);
}

async function checkAvailableTimes() {
    const minhaRequisicao = ++requisicaoHorariosAtual;
    const dateElement = document.getElementById("date");
    const timeSelect = document.getElementById("time");

    if (!dateElement || !timeSelect) return;

    const selectedDate = dateElement.value;
    if (!selectedDate) return;

    const horarioAnterior = timeSelect.value;
    const allSlots = getTimesForDate(selectedDate, selectedBarber);

    if (allSlots.length === 0) {
        const diaSem = diaDaSemana(selectedDate);
        let msg = "Sem horários disponíveis neste dia";
        if (diaSem === 0) msg = "Fechado aos domingos";
        else if (selectedBarber === "Matheus" && diaSem === 3) msg = "Matheus não atende às quartas-feiras";
        else if ((selectedBarber === "Yann" || selectedBarber === "Rafael") && diaSem === 1) msg = `${selectedBarber} não atende às segundas-feiras`;

        mostrarMensagemNoSelect(timeSelect, msg);
        return;
    }

    const totalDurationMinutes = selectedServices.reduce((acc, s) => acc + s.duration, 0) || 30;
    const slotsNeeded = Math.ceil(totalDurationMinutes / 30);

    mostrarMensagemNoSelect(timeSelect, "Carregando horários...");

    try {
        const { data: agendamentos, error: errAgendamentos } = await _supabase
            .rpc("horarios_ocupados", { p_barbeiro: selectedBarber, p_data: selectedDate });

        if (errAgendamentos) throw errAgendamentos;
        if (minhaRequisicao !== requisicaoHorariosAtual) return;

        const { data: bloqueios, error: errBloqueios } = await _supabase
            .from("bloqueios_barreto")
            .select("horario")
            .eq("barbeiro", selectedBarber)
            .eq("data", selectedDate);

        if (errBloqueios) throw errBloqueios;
        if (minhaRequisicao !== requisicaoHorariosAtual) return;

        const ocupados = new Set();
        (agendamentos || []).forEach(a => {
            if (typeof a.horario !== "string" || !/^\d{1,2}:\d{2}/.test(a.horario)) return;
            const inicio = toMin(a.horario);
            let duracao = 0;
            if (a.servico) {
                a.servico.split(",").forEach(serv => {
                    duracao += duracoesServicos[serv.trim()] || 30;
                });
            }
            const slots = Math.max(1, Math.ceil(duracao / 30));
            for (let k = 0; k < slots; k++) ocupados.add(inicio + 30 * k);
        });

        const listaBloqueios = (bloqueios || []).map(b => String(b.horario));
        if (listaBloqueios.includes("TODOS")) {
            mostrarMensagemNoSelect(timeSelect, "Agenda fechada neste dia");
            return;
        }

        const bloqueados = new Set(
            listaBloqueios.filter(h => /^\d{1,2}:\d{2}/.test(h)).map(toMin)
        );
        const slotsDisponiveisNaGrade = new Set(allSlots.map(s => toMin(s.valor)));

        timeSelect.innerHTML = "";

        allSlots.forEach(slotObj => {
            const option = document.createElement("option");
            option.value = slotObj.valor;
            option.textContent = slotObj.texto;

            let temConflito = false;
            const inicio = toMin(slotObj.valor);
            for (let i = 0; i < slotsNeeded; i++) {
                const slot = inicio + 30 * i;
                if (!slotsDisponiveisNaGrade.has(slot) || ocupados.has(slot) || bloqueados.has(slot)) {
                    temConflito = true;
                    break;
                }
            }

            if (temConflito) {
                option.textContent = `${slotObj.valor} - (Indisponível)`;
                option.disabled = true;
            }

            timeSelect.appendChild(option);
        });

        const anterior = Array.from(timeSelect.options).find(o => o.value === horarioAnterior && !o.disabled);
        if (anterior) {
            timeSelect.value = horarioAnterior;
        } else {
            const primeiroLivre = Array.from(timeSelect.options).find(o => !o.disabled);
            if (primeiroLivre) timeSelect.value = primeiroLivre.value;
        }
    } catch (err) {
        console.error("Erro ao buscar disponibilidade:", err);
        if (minhaRequisicao === requisicaoHorariosAtual) {
            mostrarMensagemNoSelect(timeSelect, "Erro ao carregar horários. Tente novamente.");
        }
    }
}

// === CLIENTE ===

async function buscarClientePorTelefone() {
    const telefoneInput = document.getElementById("client-phone").value.trim();
    if (!telefoneInput) return;

    const telefoneLimpo = telefoneInput.replace(/\D/g, "");
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) return;

    const nomeInput = document.getElementById("client-name");
    if (nomeInput.value.trim()) return;

    try {
        const { data, error } = await _supabase.rpc("buscar_cliente_por_telefone", { p_telefone: telefoneLimpo });
        if (error) throw error;
        if (data && !nomeInput.value.trim()) {
            nomeInput.value = data;
        }
    } catch (err) {
        console.error("Erro ao buscar cliente:", err);
    }
}

// === CONFIRMAÇÃO ===

function abrirModalConfirmacao() {
    const nameInput = document.getElementById("client-name");
    const phoneInput = document.getElementById("client-phone");
    const dateInput = document.getElementById("date");
    const timeSelect = document.getElementById("time");

    const name = nameInput ? nameInput.value.trim() : "";
    const phone = phoneInput ? phoneInput.value.trim() : "";
    const date = dateInput ? dateInput.value : "";
    const time = timeSelect ? timeSelect.value : "";

    if (!name || !phone) {
        alert("Por favor, digite o seu nome e WhatsApp antes de prosseguir.");
        return;
    }

    const telefoneDigitos = phone.replace(/\D/g, "");
    if (telefoneDigitos.length < 10 || telefoneDigitos.length > 11) {
        alert("Por favor, digite um WhatsApp válido com DDD.");
        return;
    }

    if (selectedServices.length === 0) {
        alert("Por favor, selecione pelo menos um serviço.");
        return;
    }

    if (!time || timeSelect.selectedOptions[0]?.disabled) {
        alert("Por favor, selecione um horário válido e disponível.");
        return;
    }

    // Verificar se é horário de emergência para exibir o valor correto no resumo
    const diaSem = diaDaSemana(date);
    const minTime = toMin(time);
    let ehEmergencia = false;
    if ((diaSem >= 1 && diaSem <= 3 && minTime >= 1200) ||
        ((diaSem === 4 || diaSem === 5) && minTime >= 1260) ||
        (diaSem === 6 && minTime >= 1080)) {
        ehEmergencia = true;
    }

    const precoTotal = ehEmergencia ? 45.00 : calcularTotal();
    const servicosNomes = ehEmergencia ? ["Corte Emergencial"] : selectedServices.map(s => s.name);
    const formattedDate = date.split("-").reverse().join("/");

    const resumoDiv = document.getElementById("resumo-agendamento");
    if (resumoDiv) {
        resumoDiv.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Barbeiro:</strong> ${escapeHtml(selectedBarber)}</div>
            <div style="margin-bottom: 8px;"><strong>Data:</strong> ${escapeHtml(formattedDate)} às ${escapeHtml(time)}</div>
            <div style="margin-bottom: 8px;"><strong>Serviços:</strong> ${escapeHtml(servicosNomes.join(", "))}</div>
            <div style="margin-top: 12px; border-top: 1px solid #333333; padding-top: 8px; font-size: 1.1rem;">
                <strong>Total Estimado:</strong> <span style="color: #FF6600; font-weight: bold;">${formatarBRL(precoTotal)}</span>
            </div>
        `;
    }

    const modal = document.getElementById("modal-confirmacao");
    if (modal) {
        modal.style.display = "flex";
    }
}

function fecharModalConfirmacao() {
    const modal = document.getElementById("modal-confirmacao");
    if (modal) {
        modal.style.display = "none";
    }
}

async function confirmarEEnviar() {
    fecharModalConfirmacao();
    await sendToWhatsapp();
}

async function sendToWhatsapp() {
    if (enviandoAgendamento) return;

    const nameInput = document.getElementById("client-name");
    const phoneInput = document.getElementById("client-phone");
    const dateInput = document.getElementById("date");
    const timeSelect = document.getElementById("time");
    const btnAgendar = document.getElementById("btn-continuar");

    const name = nameInput ? nameInput.value.trim() : "";
    const phone = phoneInput ? phoneInput.value.trim() : "";
    const date = dateInput ? dateInput.value : "";
    const time = timeSelect ? timeSelect.value : "";

    enviandoAgendamento = true;
    if (btnAgendar) {
        btnAgendar.disabled = true;
        btnAgendar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Agendando...';
    }

    let linkWhatsapp = null;

    try {
        const { data: resultado, error } = await _supabase.rpc("criar_agendamento", {
            p_cliente: name,
            p_telefone: phone.replace(/\D/g, ""),
            p_barbeiro: selectedBarber,
            p_servicos: selectedServices.map(s => s.name),
            p_data: date,
            p_horario: time
        });

        if (error) throw error;

        if (!resultado || resultado.ok !== true) {
            alert((resultado && resultado.mensagem) || "Não foi possível concluir o agendamento. Tente outro horário.");
            await checkAvailableTimes();
        } else {
            const formattedDate = date.split("-").reverse().join("/");
            const whatsappNumber = telefonesBarbeiros[selectedBarber] || "5531997193193";
            const listaNomesServicos = selectedServices.map(s => s.name).join(", ");

            const message = `✅ *AGENDAMENTO CONFIRMADO - BARRETO BARBEARIA* ✅\n\nOlá! Segue a confirmação do meu horário:\n\n👤 *Cliente:* ${name}\n📱 *Telefone:* ${phone}\n💈 *Barbeiro:* ${selectedBarber}\n✂️ *Serviços:* ${listaNomesServicos} (Total: ${formatarBRL(resultado.preco_total)})\n📅 *Data:* ${formattedDate}\n⏰ *Horário:* ${time}`;

            linkWhatsapp = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
        }
    } catch (err) {
        console.error("Erro ao registrar agendamento:", err);
        alert("Não foi possível registrar o seu agendamento. Verifique a internet e tente novamente.");
    } finally {
        enviandoAgendamento = false;
        if (btnAgendar) {
            btnAgendar.disabled = false;
            btnAgendar.innerHTML = 'Continuar Agendamento <i class="fa-solid fa-arrow-right" style="margin-left: 8px;"></i>';
        }
    }

    if (linkWhatsapp) {
        window.location.href = linkWhatsapp;
    }
}
