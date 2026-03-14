// routes/callbacks/partner.class.js

export function getPartnerEditFieldMeta(field) {
  const key = String(field || "").trim();

  if (key === "nama_lengkap") {
    return { key, label: "Nama Lengkap", currentKey: "nama_lengkap", prompt: "Ketik Nama Baru" };
  }
  if (key === "nickname") {
    return { key, label: "Nickname", currentKey: "nickname", prompt: "Ketik Nickname Baru" };
  }
  if (key === "no_whatsapp") {
    return { key, label: "No. Whatsapp", currentKey: "no_whatsapp", prompt: "Ketik No. Whatsapp Baru" };
  }
  if (key === "nik") {
    return { key, label: "NIK", currentKey: "nik", prompt: "Ketik NIK Baru" };
  }
  if (key === "kecamatan") {
    return { key, label: "Kecamatan", currentKey: "kecamatan", prompt: "Ketik Kecamatan Baru" };
  }
  if (key === "kota") {
    return { key, label: "Kota", currentKey: "kota", prompt: "Ketik Kota Baru" };
  }
  if (key === "channel_url") {
    return { key, label: "Channel", currentKey: "channel_url", prompt: "Ketik Link Channel Baru" };
  }

  return null;
}
