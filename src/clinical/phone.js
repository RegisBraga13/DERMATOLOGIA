// Fone e WhatsApp moram no mesmo campo: no Brasil o celular do paciente e o
// numero do WhatsApp dele. O campo guarda o numero ja formatado, do jeito que
// se le no prontuario, e o link do WhatsApp sai dos digitos.

// Numero que comeca com "+" e estrangeiro: nao cabe na mascara brasileira,
// entao fica como foi digitado.
function isInternational(value) {
  return String(value || "").trim().startsWith("+");
}

// Digitos nacionais: sem o 55 do pais e sem o 0 da discagem interurbana,
// que aparecem quando o numero vem colado de outro lugar.
export function nationalPhoneDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length > 11 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return digits.slice(0, 11);
}

// Mascara progressiva: formata enquanto digita, (31) 9 → (31) 90000-0000.
// Com 10 digitos e fixo, (31) 3000-0000; com 11, celular.
// Valor com letra ("9999-0000 recado com a mae") e texto do medico: a mascara
// nao apaga o que foi escrito.
export function formatPhone(value) {
  if (isInternational(value) || /\p{L}/u.test(String(value || ""))) return String(value || "").trim();
  const digits = nationalPhoneDigits(value);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = digits.length === 11 ? 5 : 4;
  if (rest.length <= split) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

// Link wa.me so para numero completo; numero pela metade nao abre conversa
// com ninguem, e abrir com o numero errado e pior que nao abrir.
export function whatsappLink(value) {
  if (isInternational(value)) {
    const digits = String(value).replace(/\D/g, "");
    return digits.length >= 8 ? `https://wa.me/${digits}` : "";
  }
  const digits = nationalPhoneDigits(value);
  return digits.length === 10 || digits.length === 11 ? `https://wa.me/55${digits}` : "";
}
