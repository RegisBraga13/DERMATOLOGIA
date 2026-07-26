export async function fetchCep(cep) {
  const clean = String(cep || "").replace(/\D/g, "");
  if (clean.length !== 8) throw new Error("CEP deve conter 8 digitos.");
  const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  if (!response.ok) throw new Error("Nao foi possivel consultar o CEP.");
  const data = await response.json();
  if (data.erro) throw new Error("CEP nao encontrado.");
  return {
    endereco: data.logradouro || "",
    bairro: data.bairro || "",
    cidade: data.localidade || "",
    estado: data.uf || ""
  };
}
