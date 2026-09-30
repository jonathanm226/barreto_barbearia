// === CONFIGURAÇÃO DO SUPABASE ===
// A chave "publishable" pode ficar no front-end: quem protege os dados é o RLS (ver supabase_setup.sql).
const SUPABASE_URL = "https://doecoosuqibzdsyadsyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-30z4xAhwJPYmy1bfSEjCw_loKUe8uL";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// === CONFIGURAÇÕES DO NEGÓCIO ===
// ATENÇÃO: o expediente também existe dentro da função criar_agendamento no SQL.
// Se mudar aqui, mude lá também.
const PRIMEIRO_HORARIO = "08:00";
const ULTIMO_HORARIO = "19:00";   // último horário de INÍCIO de atendimento
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

// Data local (YYYY-MM-DD). toISOString() usa UTC e "pula" o dia depois das 21h no Brasil.
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
    return selectedServices.reduce((acc, s) => acc + s.price, 0);
}

function gerarSlots(ultimoHorario) {
    const slots = [];
    for (let m = toMin(PRIMEIRO_HORARIO); m <= toMin(ultimoHorario); m += 30) {
        slots.push(fromMin(m));
    }
    return slots;
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

// === HORÁRIOS ===

function getTimesForDate(dateString) {
    if (!dateString) return [];

    // Domingo fechado
    if (diaDaSemana(dateString) === 0) return [];

    let horarios = gerarSlots(ULTIMO_HORARIO);

    // Se for hoje, remove horários que já passaram (ou que estão muito em cima da hora)
    const agora = new Date();
    if (dateString === isoLocal(agora)) {
        const limite = agora.getTime() + MINUTOS_ANTECEDENCIA_MIN * 60000;
        const [y, m, d] = dateString.split("-").map(Number);
        horarios = horarios.filter(h => {
            const [hh, mm] = h.split(":").map(Number);
            return new Date(y, m - 1, d, hh, mm).getTime() >= limite;
        });
    }

    return horarios;
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
    const allTimes = getTimesForDate(selectedDate);

    if (allTimes.length === 0) {
        mostrarMensagemNoSelect(
            timeSelect,
            diaDaSemana(selectedDate) === 0 ? "Fechado neste dia" : "Sem horários disponíveis neste dia"
        );
        return;
    }

    const totalDurationMinutes = selectedServices.reduce((acc, s) => acc + s.duration, 0) || 30;
    const slotsNeeded = Math.ceil(totalDurationMinutes / 30);

    mostrarMensagemNoSelect(timeSelect, "Carregando horários...");

    try {
        // Só horário + serviço (sem dados pessoais) via função segura do banco
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

        // Minutos ocupados por agendamentos existentes (calculado por minutos, não por posição na lista)
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
        const slotsDisponiveisNaGrade = new Set(allTimes.map(toMin));

        timeSelect.innerHTML = "";

        allTimes.forEach(time => {
            const option = document.createElement("option");
            option.value = time;

            // O atendimento inteiro precisa caber dentro do expediente e sem colidir
            let temConflito = false;
            const inicio = toMin(time);
            for (let i = 0; i < slotsNeeded; i++) {
                const slot = inicio + 30 * i;
                if (!slotsDisponiveisNaGrade.has(slot) || ocupados.has(slot) || bloqueados.has(slot)) {
                    temConflito = true;
                    break;
                }
            }

            if (temConflito) {
                option.textContent = `${time} - (Indisponível para esta duração)`;
                option.disabled = true;
            } else {
                option.textContent = time;
            }

            timeSelect.appendChild(option);
        });

        // Mantém o horário que o cliente já tinha escolhido, se ainda estiver livre
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
            mostrarMensagemNoSelect(timeSelect, "Erro ao carregar horários. Verifique sua internet e tente novamente.");
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
    if (nomeInput.value.trim()) return; // não sobrescreve o que a pessoa já digitou

    try {
        // A busca acontece no servidor: o navegador recebe apenas um nome (nunca a lista de clientes)
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
        alert("Por favor, digite um WhatsApp válido, com DDD (ex: 31 99999-9999).");
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

    const precoTotal = calcularTotal();
    const servicosNomes = selectedServices.map(s => s.name);
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
    if (enviandoAgendamento) return; // evita clique duplo

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
        // A validação final e a gravação acontecem de forma atômica no banco.
        // Se dois clientes tentarem o mesmo horário, só um consegue.
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

    // Só vai para o WhatsApp se o agendamento foi realmente gravado
    if (linkWhatsapp) {
        window.location.href = linkWhatsapp;
    }
}
