// === CONFIGURAÇÃO DO SUPABASE ===
const SUPABASE_URL = "https://doecoosuqibzdsyadsyg.supabase.co";
const SUPABASE_KEY = "sb_publishable_-30z4xAhwJPYmy1bfSEjCw_loKUe8uL";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DIAS_ANTECEDENCIA_MAX = 21;
const telefonesBarbeiros = { "Matheus": "5531997193193", "Yann": "5531993789798", "Rafael": "5531975470879" };

const duracoesServicos = {
    "Corte": 45, "Barba": 10, "Barba simples": 10, "Bigode simples": 5,
    "Sobrancelha": 25, "Hidratação profunda": 25, "Relaxamento": 25,
    "Escova": 30, "Luzes": 60, "Platinado": 60, "Botox (selagem)": 60,
    "Coloração": 60, "Pigmentação": 40, "Pezinho simples": 10, "Pezinho Gourmet": 20
};

let selectedBarber = "Matheus";
let selectedServices = [];
let enviandoAgendamento = false;

function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    const [y, m, d] = dateString.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
}

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
        if (icon) { icon.classList.remove("fa-solid", "fa-square-check"); icon.classList.add("fa-regular", "fa-square"); }
    } else {
        selectedServices.push({ name: serviceName, price: price, duration: duration });
        element.classList.add("active");
        if (icon) { icon.classList.remove("fa-regular", "fa-square"); icon.classList.add("fa-solid", "fa-square-check"); }
    }
    checkAvailableTimes();
}

function getTimesForDate(dateString, barbeiro) {
    if (!dateString) return [];
    const diaSem = diaDaSemana(dateString); 
    if (diaSem === 0) return [];
    if (barbeiro === "Matheus" && diaSem === 3) return [];
    if ((barbeiro === "Yann" || barbeiro === "Rafael") && diaSem === 1) return [];

    let inicioExpediente = 600, fimExpedienteLimite = 1320, inicioEmergencia = 1200;
    if (diaSem >= 4 && diaSem <= 5) { inicioExpediente = 540; inicioEmergencia = 1260; } 
    else if (diaSem === 6) { inicioExpediente = 540; inicioEmergencia = 1080; fimExpedienteLimite = 1320; }

    const slots = [];
    for (let m = inicioExpediente; m <= fimExpedienteLimite; m += 30) {
        const horaStr = fromMin(m);
        let textoSlot = m >= inicioEmergencia ? `${horaStr} - (Corte Emergencial: R$ 45,00)` : horaStr;
        slots.push({ valor: horaStr, texto: textoSlot });
    }
    return slots;
}

function mostrarMensagemNoSelect(timeSelect, texto) {
    timeSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = ""; option.textContent = texto;
    option.disabled = true; option.selected = true;
    timeSelect.appendChild(option);
}

async function checkAvailableTimes() {
    const dateEl = document.getElementById("date");
    const timeSel = document.getElementById("time");

    if (!dateEl || !timeSel || !dateEl.value) return;
    const selDate = dateEl.value;
    const previousSelection = timeSel.value;

    const allSlots = getTimesForDate(selDate, selectedBarber);
    if (allSlots.length === 0) return mostrarMensagemNoSelect(timeSel, "Barbeiro não atende neste dia");

    const durationMin = selectedServices.reduce((acc, s) => acc + s.duration, 0) || 30;
    const slotsNeeded = Math.ceil(durationMin / 30);
    mostrarMensagemNoSelect(timeSel, "A carregar horários...");

    try {
        const { data: agendamentos } = await _supabase.from("agendamentos_barreto").select("horario, servico").eq("barbeiro", selectedBarber).eq("data", selDate).neq("status", "cancelado");
        const { data: bloqueios } = await _supabase.from("bloqueios_barreto").select("horario").eq("barbeiro", selectedBarber).eq("data", selDate);

        if ((bloqueios || []).some(b => b.horario === "TODOS")) return mostrarMensagemNoSelect(timeSel, "Agenda fechada neste dia");

        const ocupados = new Set();
        (agendamentos || []).forEach(a => {
            if (!a.horario) return;
            const horaFormatada = a.horario.substring(0, 5); // CORREÇÃO DE FORMATAÇÃO HH:MM:SS para HH:MM APLICADA
            const inicio = toMin(horaFormatada);
            let dur = 0;
            if (a.servico) a.servico.split(",").forEach(s => dur += duracoesServicos[s.trim()] || 30);
            const numSlots = Math.max(1, Math.ceil(dur / 30));
            for (let k = 0; k < numSlots; k++) ocupados.add(inicio + (30 * k));
        });

        const bloqueados = new Set((bloqueios || []).map(b => toMin(b.horario.substring(0, 5))));
        const gradeBase = new Set(allSlots.map(s => toMin(s.valor)));

        timeSel.innerHTML = "";
        allSlots.forEach(slot => {
            const opt = document.createElement("option");
            opt.value = slot.valor; opt.textContent = slot.texto;
            const inicio = toMin(slot.valor);
            
            let conflito = false;
            for (let i = 0; i < slotsNeeded; i++) {
                const s = inicio + (30 * i);
                if (!gradeBase.has(s) || ocupados.has(s) || bloqueados.has(s)) { conflito = true; break; }
            }

            if (conflito) { opt.textContent = `${slot.valor} - (Indisponível)`; opt.disabled = true; }
            timeSel.appendChild(opt);
        });

        const anteriorDisp = Array.from(timeSel.options).find(o => o.value === previousSelection && !o.disabled);
        if (anteriorDisp) timeSel.value = previousSelection;
        else {
            const primeiroLivre = Array.from(timeSel.options).find(o => !o.disabled);
            if (primeiroLivre) timeSel.value = primeiroLivre.value;
        }

    } catch (err) {
        mostrarMensagemNoSelect(timeSel, "Erro ao carregar horários");
    }
}

function abrirModalConfirmacao() {
    const name = document.getElementById("client-name")?.value.trim();
    const phone = document.getElementById("client-phone")?.value.trim();
    const date = document.getElementById("date")?.value;
    const time = document.getElementById("time")?.value;

    if (!name || !phone || phone.replace(/\D/g,"").length < 10) return alert("Preencha o seu nome e um WhatsApp válido.");
    if (selectedServices.length === 0) return alert("Selecione um serviço.");
    if (!time || document.getElementById("time").selectedOptions[0]?.disabled) return alert("Selecione um horário válido.");

    const diaSem = diaDaSemana(date);
    const minTime = toMin(time);
    let ehEmergencia = ((diaSem >= 1 && diaSem <= 3 && minTime >= 1200) || (diaSem >= 4 && diaSem <= 5 && minTime >= 1260) || (diaSem === 6 && minTime >= 1080));
    
    const preco = ehEmergencia ? 45.0 : calcularTotal();
    const servNomes = ehEmergencia ? ["Corte Emergencial"] : selectedServices.map(s => s.name);

    document.getElementById("resumo-agendamento").innerHTML = `
        <div style="margin-bottom: 8px;"><strong>Barbeiro:</strong> ${selectedBarber}</div>
        <div style="margin-bottom: 8px;"><strong>Data:</strong> ${date.split("-").reverse().join("/")} às ${time}</div>
        <div style="margin-bottom: 8px;"><strong>Serviços:</strong> ${servNomes.join(", ")}</div>
        <div style="margin-top: 12px; border-top: 1px solid #333333; padding-top: 8px; font-size: 1.1rem;">
            <strong>Total Estimado:</strong> <span style="color: #FF6600; font-weight: bold;">R$ ${preco.toFixed(2).replace(".", ",")}</span>
        </div>
    `;
    document.getElementById("modal-confirmacao").style.display = "flex";
}

function fecharModalConfirmacao() { document.getElementById("modal-confirmacao").style.display = "none"; }

async function confirmarEEnviar() {
    if (enviandoAgendamento) return;
    const btn = document.getElementById("btn-continuar");
    enviandoAgendamento = true; btn.disabled = true; btn.innerHTML = 'A agendar...';

    const name = document.getElementById("client-name").value;
    const phone = document.getElementById("client-phone").value.replace(/\D/g, "");
    const date = document.getElementById("date").value;
    const time = document.getElementById("time").value;

    try {
        const diaSem = diaDaSemana(date);
        const minTime = toMin(time);
        let ehEmergencia = ((diaSem >= 1 && diaSem <= 3 && minTime >= 1200) || (diaSem >= 4 && diaSem <= 5 && minTime >= 1260) || (diaSem === 6 && minTime >= 1080));
        
        const precoTotal = ehEmergencia ? 45.0 : calcularTotal();
        const servicosNome = ehEmergencia ? "Corte Emergencial" : selectedServices.map(s => s.name).join(", ");

        const { error } = await _supabase.from("agendamentos_barreto").insert([{
            cliente: name,
            telefone: phone,
            barbeiro: selectedBarber,
            servico: servicosNome,
            preco_total: precoTotal,
            data: date,
            horario: time,
            status: 'ativo'
        }]);

        if (error) throw error;

        fecharModalConfirmacao();
        const num = telefonesBarbeiros[selectedBarber] || "5531997193193";
        const msg = `✅ *AGENDAMENTO CONFIRMADO* ✅\n\n👤 *Cliente:* ${name}\n📱 *Telefone:* ${phone}\n💈 *Barbeiro:* ${selectedBarber}\n✂️ *Serviços:* ${servicosNome}\n📅 *Data:* ${date.split("-").reverse().join("/")}\n⏰ *Horário:* ${time}`;
        
        window.location.href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;

    } catch (err) {
        alert("Erro ao agendar. Verifique a internet e tente novamente.");
        enviandoAgendamento = false; btn.disabled = false; btn.innerHTML = 'Continuar Agendamento <i class="fa-solid fa-arrow-right"></i>';
    }
}

async function buscarClientePorTelefone() {
    const tel = document.getElementById("client-phone").value.replace(/\D/g, "");
    if (tel.length < 10) return;
    const { data } = await _supabase.from("agendamentos_barreto").select("cliente").eq("telefone", tel).limit(1).maybeSingle();
    if (data && !document.getElementById("client-name").value) document.getElementById("client-name").value = data.cliente;
}
