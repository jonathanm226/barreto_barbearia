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

    const timeSelect = document.getElementById("time");
    if (timeSelect) {
        timeSelect.addEventListener("change", function(e) {
            const selOpt = this.options[this.selectedIndex];
            if (selOpt && selOpt.dataset.ocupado === "true") {
                mostrarAlertaCliente("Este horário já está ocupado ou indisponível. Por favor, escolha um horário livre.", false);
                this.value = ""; 
            }
        });
    }
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
        selectedServices.push
